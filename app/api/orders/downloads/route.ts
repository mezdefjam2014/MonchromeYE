import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function safeMatch(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");

  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session_id");
    const token = url.searchParams.get("token");

    if (!sessionId || !token) {
      return NextResponse.json(
        { error: "Missing order access details." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id,stripe_session_id,payment_status,beat_ids,download_token_hash"
      )
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (orderError) {
      console.error("Stripe download order lookup failed:", orderError);
      return NextResponse.json(
        { error: "Could not load the order." },
        { status: 500 }
      );
    }

    if (!order) {
      return NextResponse.json(
        { error: "Order not found." },
        { status: 404 }
      );
    }

    if (order.payment_status === "pending") {
      return NextResponse.json(
        {
          error: "Payment confirmation is still processing.",
          processing: true
        },
        { status: 409 }
      );
    }

    if (
      order.payment_status !== "completed" ||
      !order.download_token_hash
    ) {
      return NextResponse.json(
        { error: "This order is not available for download." },
        { status: 403 }
      );
    }

    const providedHash = createHash("sha256")
      .update(token)
      .digest("hex");

    if (!safeMatch(providedHash, order.download_token_hash)) {
      return NextResponse.json(
        { error: "Invalid download access." },
        { status: 403 }
      );
    }

    const { data: beats, error: beatsError } = await supabase
      .from("beats")
      .select("id,title,mp3_path,wav_path")
      .in("id", order.beat_ids || []);

    if (beatsError) {
      console.error("Could not load purchased beats:", beatsError);
      return NextResponse.json(
        { error: "Could not load purchased beats." },
        { status: 500 }
      );
    }

    const fileRequests = (beats || []).flatMap((beat) => {
      const files: Array<{
        beatId: string;
        title: string;
        format: "MP3" | "WAV";
        path: string;
      }> = [];

      if (beat.mp3_path) {
        files.push({
          beatId: beat.id,
          title: beat.title,
          format: "MP3",
          path: beat.mp3_path
        });
      }

      if (beat.wav_path) {
        files.push({
          beatId: beat.id,
          title: beat.title,
          format: "WAV",
          path: beat.wav_path
        });
      }

      return files;
    });

    const signedFiles = await Promise.all(
      fileRequests.map(async (file) => {
        const safeTitle = file.title
          .replace(/[^a-z0-9-_ ]/gi, "")
          .trim() || "YE2K-beat";

        const { data, error } = await supabase.storage
          .from("beat-files")
          .createSignedUrl(
            file.path,
            60 * 15,
            {
              download: `${safeTitle}.${file.format.toLowerCase()}`
            }
          );

        if (error || !data?.signedUrl) {
          console.error("Could not sign purchased file:", {
            path: file.path,
            error
          });
          return null;
        }

        return {
          beatId: file.beatId,
          title: file.title,
          format: file.format,
          url: data.signedUrl
        };
      })
    );

    return NextResponse.json({
      sessionId,
      files: signedFiles.filter(Boolean),
      expiresInSeconds: 900
    });
  } catch (error) {
    console.error("Prepare Stripe downloads error:", error);

    return NextResponse.json(
      { error: "Could not prepare downloads." },
      { status: 500 }
    );
  }
}

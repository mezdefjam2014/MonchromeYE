import { createHash, randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function getSiteUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  const origin = request.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");

  throw new Error("Missing NEXT_PUBLIC_SITE_URL.");
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  let internalOrderId: string | null = null;

  try {
    const body = await request.json();
    const beatIds = body?.beatIds;

    if (
      !Array.isArray(beatIds) ||
      beatIds.length === 0 ||
      beatIds.length > 25 ||
      beatIds.some((id) => typeof id !== "string")
    ) {
      return NextResponse.json(
        { error: "The cart is invalid." },
        { status: 400 }
      );
    }

    const uniqueBeatIds = [...new Set(beatIds)];

    const { data: beats, error: beatsError } = await supabase
      .from("beats")
      .select("id,title,price,status,mp3_path,wav_path")
      .in("id", uniqueBeatIds)
      .eq("status", "published");

    if (beatsError) {
      console.error("Stripe cart lookup failed:", beatsError);
      return NextResponse.json(
        { error: "The store could not verify the cart." },
        { status: 500 }
      );
    }

    if (!beats || beats.length !== uniqueBeatIds.length) {
      return NextResponse.json(
        { error: "One or more beats are no longer available." },
        { status: 400 }
      );
    }

    const currency = (process.env.NEXT_PUBLIC_CURRENCY || "USD").toLowerCase();
    const totalCents = beats.reduce((sum, beat) => {
      return sum + Math.round(Number(beat.price) * 100);
    }, 0);

    if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
      return NextResponse.json(
        { error: "The order total is invalid." },
        { status: 400 }
      );
    }

    internalOrderId = randomUUID();
    const downloadToken = randomBytes(32).toString("hex");
    const downloadTokenHash = createHash("sha256")
      .update(downloadToken)
      .digest("hex");

    const { error: pendingOrderError } = await supabase
      .from("orders")
      .insert({
        id: internalOrderId,
        payment_provider: "stripe",
        currency: currency.toUpperCase(),
        total: totalCents / 100,
        payment_status: "pending",
        beat_ids: uniqueBeatIds,
        download_token_hash: downloadTokenHash
      });

    if (pendingOrderError) {
      console.error("Could not create pending Stripe order:", pendingOrderError);
      return NextResponse.json(
        { error: "The order could not be prepared." },
        { status: 500 }
      );
    }

    const siteUrl = getSiteUrl(request);
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: beats.map((beat) => ({
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(Number(beat.price) * 100),
            product_data: {
              name: beat.title,
              description: `YE2K beat purchase · ${beat.wav_path ? "MP3 + WAV" : "MP3"}`
            }
          }
        })),
        client_reference_id: internalOrderId,
        metadata: {
          internal_order_id: internalOrderId
        },
        payment_intent_data: {
          metadata: {
            internal_order_id: internalOrderId
          }
        },
        billing_address_collection: "auto",
        success_url:
          `${siteUrl}/checkout/success` +
          `?session_id={CHECKOUT_SESSION_ID}` +
          `&token=${encodeURIComponent(downloadToken)}`,
        cancel_url: `${siteUrl}/checkout`,
        allow_promotion_codes: false
      },
      {
        idempotencyKey: internalOrderId
      }
    );

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    const { error: sessionUpdateError } = await supabase
      .from("orders")
      .update({
        stripe_session_id: session.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", internalOrderId);

    if (sessionUpdateError) {
      console.error("Could not attach Stripe session to order:", sessionUpdateError);

      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireError) {
        console.error("Could not expire orphaned Stripe session:", expireError);
      }

      throw new Error("The checkout session could not be finalized.");
    }

    return NextResponse.json({
      url: session.url
    });
  } catch (error) {
    console.error("Create Stripe Checkout Session error:", error);

    if (internalOrderId) {
      await supabase
        .from("orders")
        .delete()
        .eq("id", internalOrderId)
        .eq("payment_status", "pending");
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Stripe checkout could not be started."
      },
      { status: 500 }
    );
  }
}

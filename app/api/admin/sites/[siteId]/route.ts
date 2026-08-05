import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const STORAGE_BUCKETS = [
  "beat-covers",
  "beat-previews",
  "beat-files"
] as const;

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing admin session.");
  }

  const token = authorization.slice("Bearer ".length);
  const supabase = createAdminClient();

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new Error("Your admin session is invalid or expired.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") {
    throw new Error("Administrator access is required.");
  }

  return supabase;
}

async function collectFiles(
  supabase: ReturnType<typeof createAdminClient>,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" }
      });

    if (error) {
      if (
        error.message.toLowerCase().includes("not found") ||
        error.message.toLowerCase().includes("does not exist")
      ) {
        return files;
      }

      throw new Error(
        `Could not inspect ${bucket}/${prefix}: ${error.message}`
      );
    }

    const entries = data || [];

    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.id) {
        files.push(path);
      } else {
        files.push(
          ...(await collectFiles(supabase, bucket, path))
        );
      }
    }

    if (entries.length < 100) break;
    offset += entries.length;
  }

  return files;
}

async function removeFiles(
  supabase: ReturnType<typeof createAdminClient>,
  bucket: string,
  paths: string[]
) {
  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100);
    const { error } = await supabase.storage
      .from(bucket)
      .remove(batch);

    if (error) {
      throw new Error(
        `Could not remove files from ${bucket}: ${error.message}`
      );
    }
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await context.params;
    const supabase = await requireAdmin(request);

    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("id,name,slug,is_default")
      .eq("id", siteId)
      .maybeSingle();

    if (siteError) throw siteError;

    if (!site) {
      return NextResponse.json(
        { error: "Storefront not found." },
        { status: 404 }
      );
    }

    if (site.is_default) {
      return NextResponse.json(
        { error: "The default storefront cannot be deleted." },
        { status: 400 }
      );
    }

    const filesByBucket = await Promise.all(
      STORAGE_BUCKETS.map(async (bucket) => ({
        bucket,
        paths: await collectFiles(supabase, bucket, site.slug)
      }))
    );

    for (const entry of filesByBucket) {
      await removeFiles(supabase, entry.bucket, entry.paths);
    }

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({ site_id: null })
      .eq("site_id", site.id);

    if (orderUpdateError) throw orderUpdateError;

    const { error: beatsDeleteError } = await supabase
      .from("beats")
      .delete()
      .eq("site_id", site.id);

    if (beatsDeleteError) throw beatsDeleteError;

    const { error: settingsDeleteError } = await supabase
      .from("storefront_settings")
      .delete()
      .eq("site_id", site.id);

    if (settingsDeleteError) throw settingsDeleteError;

    const { error: siteDeleteError } = await supabase
      .from("sites")
      .delete()
      .eq("id", site.id)
      .eq("is_default", false);

    if (siteDeleteError) throw siteDeleteError;

    const removedFiles = filesByBucket.reduce(
      (total, entry) => total + entry.paths.length,
      0
    );

    return NextResponse.json({
      deleted: true,
      site: {
        id: site.id,
        name: site.name,
        slug: site.slug
      },
      removedFiles
    });
  } catch (error) {
    console.error("Delete storefront error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not delete the storefront."
      },
      { status: 500 }
    );
  }
}

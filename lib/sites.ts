import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

const fallbackTitle = "YE2K — Original Production";
const fallbackDescription =
  "Original production. Immediate preview. Secure delivery.";

export async function getSiteMetadata(slug: string): Promise<Metadata> {
  try {
    const supabase = createAdminClient();
    const { data: site } = await supabase
      .from("sites")
      .select("id,name,slug")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();

    if (!site) {
      return { title: fallbackTitle, description: fallbackDescription };
    }

    const { data: row } = await supabase
      .from("storefront_settings")
      .select("description,settings")
      .eq("site_id", site.id)
      .maybeSingle();

    const branding =
      (row?.settings as {
        branding?: {
          siteTitle?: string;
          siteDescription?: string;
          faviconPath?: string;
          shareImagePath?: string;
        };
      } | null)?.branding || {};

    const title = branding.siteTitle || `${site.name} — Original Production`;
    const description =
      branding.siteDescription || row?.description || fallbackDescription;

    const publicUrl = (path?: string) =>
      path
        ? supabase.storage.from("beat-covers").getPublicUrl(path).data.publicUrl
        : undefined;

    const favicon = publicUrl(branding.faviconPath);
    const shareImage = publicUrl(branding.shareImagePath);

    return {
      title,
      description,
      icons: favicon ? { icon: favicon, shortcut: favicon } : undefined,
      openGraph: {
        title,
        description,
        type: "website",
        images: shareImage ? [{ url: shareImage, width: 1200, height: 630 }] : undefined
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: shareImage ? [shareImage] : undefined
      }
    };
  } catch {
    return { title: fallbackTitle, description: fallbackDescription };
  }
}

export async function getBeatMetadata(
  siteSlug: string,
  beatIdentifier: string
): Promise<Metadata> {
  try {
    const supabase = createAdminClient();

    const { data: site } = await supabase
      .from("sites")
      .select("id,name,slug")
      .eq("slug", siteSlug)
      .eq("active", true)
      .maybeSingle();

    if (!site) {
      return {
        title: fallbackTitle,
        description: fallbackDescription
      };
    }

    const normalized = decodeURIComponent(beatIdentifier).trim();

    let { data: beat } = await supabase
      .from("beats")
      .select("title,producer,catalog_code,slug,cover_path")
      .eq("site_id", site.id)
      .eq("status", "published")
      .ilike("catalog_code", normalized)
      .maybeSingle();

    if (!beat) {
      const fallback = await supabase
        .from("beats")
        .select("title,producer,catalog_code,slug,cover_path")
        .eq("site_id", site.id)
        .eq("status", "published")
        .eq("slug", normalized.toLowerCase())
        .maybeSingle();

      beat = fallback.data;
    }

    if (!beat) {
      return {
        title: `${site.name} — Beat not found`,
        description: fallbackDescription
      };
    }

    const { data: settingsRow } = await supabase
      .from("storefront_settings")
      .select("settings")
      .eq("site_id", site.id)
      .maybeSingle();

    const settings =
      (settingsRow?.settings as {
        media?: { globalCoverPath?: string };
        branding?: {
          shareImagePath?: string;
          siteDescription?: string;
        };
      } | null) || {};

    const coverPath =
      settings.media?.globalCoverPath ||
      beat.cover_path ||
      settings.branding?.shareImagePath;

    const image = coverPath
      ? supabase.storage
          .from("beat-covers")
          .getPublicUrl(coverPath).data.publicUrl
      : undefined;

    const title = beat.catalog_code
      ? `${beat.title} (${beat.catalog_code}) — ${site.name}`
      : `${beat.title} — ${site.name}`;

    const description =
      `${beat.title} by ${beat.producer}. Preview and purchase this beat from ${site.name}.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        images: image ? [{ url: image }] : undefined
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: image ? [image] : undefined
      }
    };
  } catch {
    return {
      title: fallbackTitle,
      description: fallbackDescription
    };
  }
}

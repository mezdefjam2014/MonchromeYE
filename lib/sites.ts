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

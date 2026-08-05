import type { Metadata } from "next";
import Storefront from "@/components/storefront";
import { getBeatMetadata } from "@/lib/sites";

export const revalidate = 30;

export async function generateMetadata({
  params
}: {
  params: Promise<{ site: string; code: string }>;
}): Promise<Metadata> {
  const { site, code } = await params;
  return getBeatMetadata(site, code);
}

export default async function StorefrontBeatPage({
  params
}: {
  params: Promise<{ site: string; code: string }>;
}) {
  const { site, code } = await params;
  return <Storefront siteSlug={site} focusBeatCode={code} />;
}

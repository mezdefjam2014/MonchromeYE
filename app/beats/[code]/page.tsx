import type { Metadata } from "next";
import Storefront from "@/components/storefront";
import { getBeatMetadata } from "@/lib/sites";

export const revalidate = 30;

export async function generateMetadata({
  params
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  return getBeatMetadata("ye2k", code);
}

export default async function BeatPage({
  params
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <Storefront siteSlug="ye2k" focusBeatCode={code} />;
}

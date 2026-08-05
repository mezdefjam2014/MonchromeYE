import type { Metadata } from "next";
import { getSiteMetadata } from "@/lib/sites";

export async function generateMetadata({
  params
}: {
  params: Promise<{ site: string }>;
}): Promise<Metadata> {
  const { site } = await params;
  return getSiteMetadata(site);
}

export default function SiteLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}

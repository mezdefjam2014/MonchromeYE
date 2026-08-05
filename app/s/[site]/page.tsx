import Storefront from "@/components/storefront";

export const revalidate = 30;

export default async function SitePage({
  params
}: {
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;
  return <Storefront siteSlug={site} />;
}

import Storefront from "@/components/storefront";

export const revalidate = 30;

export default function HomePage() {
  return <Storefront siteSlug="ye2k" />;
}

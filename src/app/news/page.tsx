import type { Metadata } from "next";
import { getDb } from "@/db";
import { getCentralNewsHubData } from "@/news/hub";
import { NewsHubView } from "./news-hub-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Central News | Rumbledore",
  description: "League-agnostic NFL and fantasy-football headlines.",
};

export default async function NewsPage() {
  const data = await getCentralNewsHubData(getDb());
  return <NewsHubView data={data} />;
}

import { PublicationArticleView } from "@/components/publication/article-view";
import type { LeaguePressArticleData } from "@/news";

export function LeagueBlogPostView({ data }: { data: LeaguePressArticleData }) {
  return <PublicationArticleView data={data} />;
}

import { and, eq } from "drizzle-orm";
import type { AiPersona } from "@/ai/personas";
import { contentItemIsPublished } from "@/content/lifecycle";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { contentItems, leagues, type Member, members } from "@/db/schema";
import type { FantasyProviderId } from "@/providers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LeagueBlogPostData {
  league: {
    id: string;
    provider: FantasyProviderId;
    providerLeagueId: string;
    name: string;
    season: number;
  };
  post: {
    id: string;
    title: string;
    summary: string;
    body: string;
    authorPersona: AiPersona | null;
    publishedAt: string;
  };
  userRole: Member["role"];
}

export type LeagueBlogPostLoadResult =
  | { status: "ready"; data: LeagueBlogPostData }
  | { status: "not_found" }
  | { status: "forbidden" };

export async function getLeagueBlogPostData(
  db: Db,
  input: {
    leagueId: string;
    postId: string;
    userId: string;
    userRole?: Member["role"];
  },
): Promise<LeagueBlogPostLoadResult> {
  if (!UUID_RE.test(input.leagueId) || !UUID_RE.test(input.postId)) {
    return { status: "not_found" };
  }

  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const userRole =
    input.userRole ??
    (
      await db
        .select({ role: members.role })
        .from(members)
        .where(
          and(
            eq(members.organizationId, input.leagueId),
            eq(members.userId, input.userId),
          ),
        )
        .limit(1)
    )[0]?.role;

  if (!userRole) {
    return { status: "forbidden" };
  }

  const post = await withLeagueContext(db, input.leagueId, async (tx) => {
    const [row] = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        body: contentItems.body,
        id: contentItems.id,
        publishedAt: contentItems.publishedAt,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.id, input.postId),
          eq(contentItems.leagueId, input.leagueId),
          eq(contentItems.kind, "blog"),
          contentItemIsPublished(),
        ),
      )
      .limit(1);

    return row ?? null;
  });

  if (!post) {
    return { status: "not_found" };
  }

  return {
    data: {
      league,
      post: {
        ...post,
        publishedAt: post.publishedAt.toISOString(),
      },
      userRole,
    },
    status: "ready",
  };
}

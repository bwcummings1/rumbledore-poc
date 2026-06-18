import { NextResponse } from "next/server";
import { z } from "zod";
import { getPersonalAgentAnswer } from "@/ai/personal-agent";
import { requireLeagueRoleForUser, requireSession } from "@/auth/guards";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const personalAgentMessageSchema = z.object({
  context: z
    .object({
      leagueId: z.string().uuid().nullable().optional(),
      pathname: z.string().trim().max(2048).optional(),
      scope: z.enum(["arena", "global", "league", "news"]).optional(),
      sectionId: z.string().trim().max(80).nullable().optional(),
    })
    .optional(),
  question: z.string().trim().min(1).max(400),
});

async function personalAgentMessagePost(request: Request) {
  const session = await requireSession({ headers: request.headers });
  if (!session.ok) {
    return NextResponse.json(
      { error: session.error.toJSON() },
      { status: session.error.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "PERSONAL_AGENT_MESSAGE_INVALID",
          message: "Personal agent requests must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const parsed = personalAgentMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "PERSONAL_AGENT_MESSAGE_INVALID",
          message: "Personal agent questions must include 1-400 characters.",
        },
      },
      { status: 400 },
    );
  }

  const db = getDb();
  const leagueId = parsed.data.context?.leagueId ?? null;
  if (leagueId) {
    const access = await requireLeagueRoleForUser(db, {
      leagueId,
      userId: session.value.userId,
    });
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error.toJSON() },
        { status: access.error.status },
      );
    }
  }

  const env = getEnv();
  const result = await getPersonalAgentAnswer({
    context: parsed.data.context,
    db,
    env: { entitlements: env.entitlements },
    question: parsed.data.question,
    userId: session.value.userId,
  });

  return NextResponse.json(result);
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/personal-agent/messages" },
  personalAgentMessagePost,
);

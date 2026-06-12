import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError } from "@/core/result";
import { getDb } from "@/db";
import { getLeagueInviteDependencies } from "@/onboarding/deps";
import { errorJson, readJsonBody, resultJson } from "@/onboarding/http";
import {
  createLeaguemateInvite,
  listLeaguemateInviteTargets,
} from "@/onboarding/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INVITE_BODY_BYTES = 2048;

const providerMemberIdSchema = z.string().trim().min(1).max(256);

const createInviteSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("share"),
    providerMemberId: providerMemberIdSchema,
  }),
  z.object({
    channel: z.literal("email"),
    destination: z.email().max(320),
    providerMemberId: providerMemberIdSchema,
  }),
  z.object({
    channel: z.literal("sms"),
    destination: z
      .string()
      .trim()
      .min(7)
      .max(32)
      .regex(/^\+?[0-9 .()-]+$/),
    providerMemberId: providerMemberIdSchema,
  }),
]);

interface InviteRouteContext {
  params: Promise<{ leagueId: string }>;
}

function appOrigin(request: Request): string {
  return new URL(request.url).origin;
}

function inviteDestination(
  parsed: z.infer<typeof createInviteSchema>,
): string | undefined {
  switch (parsed.channel) {
    case "share":
      return undefined;
    case "email":
    case "sms":
      return parsed.destination;
  }
}

async function authorize(request: Request, leagueId: string) {
  return requireLeagueRole({
    db: getDb(),
    headers: request.headers,
    leagueId,
    minRole: "member",
  });
}

async function invitesGet(request: Request, context: InviteRouteContext) {
  const { leagueId } = await context.params;
  const access = await authorize(request, leagueId);
  if (!access.ok) {
    return errorJson(access.error);
  }

  const result = await listLeaguemateInviteTargets(
    getLeagueInviteDependencies(),
    {
      leagueId,
      userId: access.value.userId,
      userRole: access.value.role,
    },
  );
  return resultJson(result);
}

async function invitesPost(request: Request, context: InviteRouteContext) {
  const { leagueId } = await context.params;
  const access = await authorize(request, leagueId);
  if (!access.ok) {
    return errorJson(access.error);
  }

  const body = await readJsonBody(request, MAX_INVITE_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = createInviteSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_INVITE_REQUEST",
        message: "Invite request payload is invalid",
        status: 400,
      }),
    );
  }

  const result = await createLeaguemateInvite(getLeagueInviteDependencies(), {
    appBaseUrl: appOrigin(request),
    channel: parsed.data.channel,
    destination: inviteDestination(parsed.data),
    leagueId,
    providerMemberId: parsed.data.providerMemberId,
    userId: access.value.userId,
    userRole: access.value.role,
  });
  return resultJson(result, result.ok ? 201 : 200);
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/leagues/[leagueId]/invites" },
  invitesGet,
);

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/invites" },
  invitesPost,
);

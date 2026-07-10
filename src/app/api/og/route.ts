import { ImageResponse } from "next/og";
import { getEnv } from "@/core/env";
import {
  OG_IMAGE_SIZE,
  ogCardFromSearchParams,
  renderOgCard,
} from "@/share/og-card";
import { verifyOgImageSignature } from "@/share/og-signature";

export const runtime = "nodejs";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!verifyOgImageSignature(params, getEnv().share.ogImageSigningSecret)) {
    return new Response("Invalid OG image signature", {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 400,
    });
  }
  const card = ogCardFromSearchParams(params);

  return new ImageResponse(renderOgCard(card), {
    ...OG_IMAGE_SIZE,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

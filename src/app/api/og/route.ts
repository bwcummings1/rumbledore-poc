import { ImageResponse } from "next/og";
import {
  OG_IMAGE_SIZE,
  ogCardFromSearchParams,
  renderOgCard,
} from "@/share/og-card";

export const runtime = "edge";

export function GET(request: Request) {
  const card = ogCardFromSearchParams(new URL(request.url).searchParams);

  return new ImageResponse(renderOgCard(card), {
    ...OG_IMAGE_SIZE,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

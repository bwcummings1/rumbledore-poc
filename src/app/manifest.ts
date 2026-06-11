import type { MetadataRoute } from "next";
import { PWA_BACKGROUND_HEX } from "@/lib/pwa";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rumbledore",
    short_name: "Rumbledore",
    description:
      "Your fantasy league's home base — history, records, news, AI takes, and paper betting.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: PWA_BACKGROUND_HEX,
    theme_color: PWA_BACKGROUND_HEX,
    categories: ["sports", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

export const LEAGUE_PAGE_CACHE_CONTROL = "private, no-store";

export const LEAGUE_PAGE_CACHE_HEADER_RULE = {
  source: "/leagues/:path*",
  headers: [
    {
      key: "Cache-Control",
      value: LEAGUE_PAGE_CACHE_CONTROL,
    },
  ],
};

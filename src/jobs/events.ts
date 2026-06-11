export const JOB_EVENTS = {
  appPing: "app.ping",
  leagueConnected: "league.connected",
  gameFinal: "game.final",
  importRequested: "import.requested",
  oddsPoll: "odds.poll",
  newsRefresh: "news.refresh",
  contentGenerate: "content.generate",
} as const;

export type JobEventName = (typeof JOB_EVENTS)[keyof typeof JOB_EVENTS];

export interface AppPingData {
  message?: unknown;
  requestedAt?: unknown;
}

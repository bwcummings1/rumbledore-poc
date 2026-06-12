import { serve } from "inngest/next";
import { recordApiHandler } from "@/core/metrics";
import { functions, inngest } from "@/jobs";

const served = serve({
  client: inngest,
  functions,
});

export const GET = recordApiHandler(
  { method: "GET", route: "/api/inngest" },
  served.GET,
);
export const POST = recordApiHandler(
  { method: "POST", route: "/api/inngest" },
  served.POST,
);
export const PUT = recordApiHandler(
  { method: "PUT", route: "/api/inngest" },
  served.PUT,
);

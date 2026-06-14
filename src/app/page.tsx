import { headers } from "next/headers";
import { requireSession } from "@/auth/guards";
import { getDb } from "@/db";
import { getYourLeaguesLandingData } from "@/home/your-leagues";
import {
  LoggedOutLanding,
  YourLeaguesLandingView,
} from "./your-leagues-landing-view";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireSession({ headers: await headers() });
  if (!session.ok) {
    return <LoggedOutLanding />;
  }

  const data = await getYourLeaguesLandingData(getDb(), {
    userId: session.value.userId,
  });
  return <YourLeaguesLandingView data={data} />;
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/auth/guards";
import { getDb } from "@/db";
import {
  getYourLeaguesLandingData,
  userHasAnyLeague,
} from "@/home/your-leagues";
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

  // Ask the cheap question first. A user with leagues is redirected and never
  // sees this payload, so building it before the check meant every signed-in
  // visit to `/` paid for a landing page nobody rendered.
  const db = getDb();
  if (await userHasAnyLeague(db, { userId: session.value.userId })) {
    redirect("/news");
  }

  const data = await getYourLeaguesLandingData(db, {
    userId: session.value.userId,
  });
  return <YourLeaguesLandingView data={data} />;
}

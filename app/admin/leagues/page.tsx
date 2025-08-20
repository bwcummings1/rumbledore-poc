import { LeagueManagement } from '@/components/admin/league-management';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function LeaguesPage({
  searchParams,
}: {
  searchParams: { league?: string };
}) {
  const leagueSandbox = searchParams.league || '';
  
  // Fetch league settings and members if a league is selected
  let settings = null;
  let members = [];
  
  if (leagueSandbox) {
    settings = await prisma.leagueSettings.findUnique({
      where: { leagueSandbox },
    });
    
    members = await prisma.leagueMember.findMany({
      where: { 
        league: {
          sandboxNamespace: leagueSandbox
        }
      },
      include: {
        user: true,
      },
    });
  }

  return <LeagueManagement 
    leagueSandbox={leagueSandbox} 
    settings={settings}
    members={members}
  />;
}
import { PrismaClient } from '@prisma/client';
import DashboardPageLayout from "@/components/dashboard/layout";
import BracketsIcon from "@/components/icons/brackets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const prisma = new PrismaClient();

async function getMyLeagues() {
  try {
    // For now, get all leagues since we don't have auth yet
    const leagues = await prisma.league.findMany({
      include: {
        members: {
          include: {
            user: true,
            team: true,
          }
        },
        _count: {
          select: {
            members: true,
            teams: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    return leagues;
  } catch (error) {
    console.error('Failed to fetch leagues:', error);
    return [];
  }
}

export default async function MyLeaguesPage() {
  const leagues = await getMyLeagues();

  return (
    <DashboardPageLayout
      header={{
        title: "My Leagues",
        description: `${leagues.length} active leagues`,
        icon: BracketsIcon,
      }}
    >
      <div className="grid gap-6">
        {leagues.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BracketsIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Leagues Yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Join or create a league to get started with your fantasy football journey.
              </p>
              <div className="flex gap-2">
                <Button variant="outline">Browse Leagues</Button>
                <Button>Create League</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {leagues.map((league) => (
              <Card key={league.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{league.name}</CardTitle>
                      <CardDescription>
                        Season {league.season} • League #{league.espnLeagueId.toString()}
                      </CardDescription>
                    </div>
                    {league.isActive && (
                      <Badge className="bg-green-500/20 text-green-500">Active</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Teams</span>
                      <span className="font-medium">{league._count.teams}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Members</span>
                      <span className="font-medium">{league._count.members}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Scoring</span>
                      <span className="font-medium">
                        {(league.settings as any)?.scoringType || 'Standard'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Link href={`/leagues/${league.id}`} className="flex-1">
                      <Button variant="outline" className="w-full" size="sm">
                        View League
                      </Button>
                    </Link>
                    <Link href={`/leagues/${league.id}/roster`} className="flex-1">
                      <Button className="w-full" size="sm">
                        My Team
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardPageLayout>
  );
}
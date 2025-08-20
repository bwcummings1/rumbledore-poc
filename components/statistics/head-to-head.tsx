'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Trophy, Swords, TrendingUp, Calendar } from 'lucide-react';

interface HeadToHeadProps {
  leagueId: string;
  teams: Array<{ id: string; name: string }>;
}

interface H2HData {
  team1Id: string;
  team2Id: string;
  totalMatchups: number;
  team1Wins: number;
  team2Wins: number;
  ties: number;
  team1TotalPoints: number;
  team2TotalPoints: number;
  team1HighestScore?: number;
  team2HighestScore?: number;
  lastMatchupDate?: string;
  playoffMatchups: number;
  championshipMatchups: number;
  team1WinPercentage?: number;
  team2WinPercentage?: number;
  team1AvgPoints?: number;
  team2AvgPoints?: number;
  games?: Array<{
    season: string;
    week: number;
    team1Score: number;
    team2Score: number;
    winner: string | null;
    isPlayoff: boolean;
    isChampionship: boolean;
    date: string;
  }>;
}

export function HeadToHead({ leagueId, teams }: HeadToHeadProps) {
  const [team1, setTeam1] = useState<string>('');
  const [team2, setTeam2] = useState<string>('');
  const [h2hData, setH2hData] = useState<H2HData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showGames, setShowGames] = useState(false);

  useEffect(() => {
    if (team1 && team2 && team1 !== team2) {
      fetchH2HData();
    }
  }, [team1, team2]);

  const fetchH2HData = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/statistics/h2h?leagueId=${leagueId}&team1=${team1}&team2=${team2}&includeGames=true`
      );
      const data = await response.json();
      if (data.success) {
        setH2hData(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch H2H data:', error);
    }
    setLoading(false);
  };

  const getWinPercentage = (wins: number, total: number) => {
    if (total === 0) return 0;
    return (wins / total) * 100;
  };

  const getTeamName = (teamId: string) => {
    return teams.find(t => t.id === teamId)?.name || `Team ${teamId.slice(0, 8)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5" />
          Head-to-Head Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Select value={team1} onValueChange={setTeam1}>
            <SelectTrigger>
              <SelectValue placeholder="Select Team 1" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={team2} onValueChange={setTeam2}>
            <SelectTrigger>
              <SelectValue placeholder="Select Team 2" />
            </SelectTrigger>
            <SelectContent>
              {teams.filter(t => t.id !== team1).map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}

        {h2hData && !loading && (
          <div className="space-y-6">
            {/* Overall Record */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-3">Overall Record</p>
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1 text-center">
                  <p className="text-3xl font-bold">{h2hData.team1Wins}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {getTeamName(h2hData.team1Id)}
                  </p>
                </div>
                <div className="px-4">
                  <span className="text-2xl text-muted-foreground">-</span>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-3xl font-bold">{h2hData.team2Wins}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {getTeamName(h2hData.team2Id)}
                  </p>
                </div>
                {h2hData.ties > 0 && (
                  <>
                    <div className="px-4">
                      <span className="text-2xl text-muted-foreground">-</span>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold">{h2hData.ties}</p>
                      <p className="text-sm text-muted-foreground mt-1">Ties</p>
                    </div>
                  </>
                )}
              </div>
              
              {/* Win percentage bar */}
              <div className="space-y-2">
                <Progress 
                  value={h2hData.team1WinPercentage || getWinPercentage(h2hData.team1Wins, h2hData.totalMatchups)}
                  className="h-3"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {(h2hData.team1WinPercentage || getWinPercentage(h2hData.team1Wins, h2hData.totalMatchups)).toFixed(0)}%
                  </span>
                  <span>
                    {h2hData.totalMatchups} total games
                  </span>
                  <span>
                    {(h2hData.team2WinPercentage || getWinPercentage(h2hData.team2Wins, h2hData.totalMatchups)).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Statistics */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Average Score</p>
                  <p className="text-2xl font-semibold">
                    {(h2hData.team1AvgPoints || (Number(h2hData.team1TotalPoints) / h2hData.totalMatchups)).toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Highest Score</p>
                  <p className="text-2xl font-semibold">
                    {Number(h2hData.team1HighestScore || 0).toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Points</p>
                  <p className="text-xl">
                    {Number(h2hData.team1TotalPoints).toFixed(1)}
                  </p>
                </div>
              </div>
              
              <div className="space-y-3 text-right">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Average Score</p>
                  <p className="text-2xl font-semibold">
                    {(h2hData.team2AvgPoints || (Number(h2hData.team2TotalPoints) / h2hData.totalMatchups)).toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Highest Score</p>
                  <p className="text-2xl font-semibold">
                    {Number(h2hData.team2HighestScore || 0).toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Points</p>
                  <p className="text-xl">
                    {Number(h2hData.team2TotalPoints).toFixed(1)}
                  </p>
                </div>
              </div>
            </div>

            {/* Playoff/Championship Stats */}
            {(h2hData.playoffMatchups > 0 || h2hData.championshipMatchups > 0) && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-3">Postseason</p>
                  <div className="flex gap-4">
                    {h2hData.playoffMatchups > 0 && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {h2hData.playoffMatchups} Playoff Matchup{h2hData.playoffMatchups > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {h2hData.championshipMatchups > 0 && (
                      <Badge variant="default" className="flex items-center gap-1">
                        <Trophy className="h-3 w-3" />
                        {h2hData.championshipMatchups} Championship Game{h2hData.championshipMatchups > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Game History */}
            {h2hData.games && h2hData.games.length > 0 && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-muted-foreground">Game History</p>
                    <button
                      onClick={() => setShowGames(!showGames)}
                      className="text-sm text-primary hover:underline"
                    >
                      {showGames ? 'Hide' : 'Show'} Games
                    </button>
                  </div>
                  
                  {showGames && (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {h2hData.games.map((game, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 text-sm border rounded hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              {game.season} W{game.week}
                            </span>
                            {game.isChampionship && (
                              <Badge variant="default" className="text-xs">
                                <Trophy className="h-3 w-3" />
                              </Badge>
                            )}
                            {game.isPlayoff && !game.isChampionship && (
                              <Badge variant="secondary" className="text-xs">
                                Playoff
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={game.winner === h2hData.team1Id ? 'font-semibold' : ''}>
                              {Number(game.team1Score).toFixed(1)}
                            </span>
                            <span className="text-muted-foreground">-</span>
                            <span className={game.winner === h2hData.team2Id ? 'font-semibold' : ''}>
                              {Number(game.team2Score).toFixed(1)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Last Matchup */}
            {h2hData.lastMatchupDate && (
              <>
                <Separator />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    Last matchup: {new Date(h2hData.lastMatchupDate).toLocaleDateString()}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {!h2hData && !loading && team1 && team2 && team1 !== team2 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No head-to-head matchups found</p>
          </div>
        )}

        {(!team1 || !team2 || team1 === team2) && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Select two different teams to compare</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
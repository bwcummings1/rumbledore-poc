'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Clock, MapPin } from 'lucide-react';
import { format } from 'date-fns';

interface UpcomingGamesProps {
  games?: any[];
  isLoading?: boolean;
}

export function UpcomingGames({ games, isLoading }: UpcomingGamesProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Games</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-20 bg-muted rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const upcomingGames = games || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Games</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {upcomingGames.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No upcoming games
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingGames.map((game, index) => (
                <div key={index} className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline">{game.week ? `Week ${game.week}` : game.competition}</Badge>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3 mr-1" />
                      {game.date ? format(new Date(game.date), 'MMM dd') : 'TBD'}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <div className="text-sm font-medium">{game.awayTeam?.name || 'Away Team'}</div>
                          {game.awayTeam?.record && (
                            <span className="text-xs text-muted-foreground">
                              ({game.awayTeam.record})
                            </span>
                          )}
                        </div>
                        {game.awayScore !== undefined && (
                          <div className="text-lg font-bold">{game.awayScore}</div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="text-sm font-medium">{game.homeTeam?.name || 'Home Team'}</div>
                          {game.homeTeam?.record && (
                            <span className="text-xs text-muted-foreground">
                              ({game.homeTeam.record})
                            </span>
                          )}
                        </div>
                        {game.homeScore !== undefined && (
                          <div className="text-lg font-bold">{game.homeScore}</div>
                        )}
                      </div>
                    </div>
                    
                    {game.spread && (
                      <div className="ml-4 text-right">
                        <p className="text-xs text-muted-foreground">Spread</p>
                        <p className="text-sm font-medium">
                          {game.spread > 0 ? '+' : ''}{game.spread}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {game.time || 'Time TBD'}
                    </div>
                    {game.location && (
                      <div className="flex items-center">
                        <MapPin className="h-3 w-3 mr-1" />
                        {game.location}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
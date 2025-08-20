'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Search, 
  Merge, 
  Split, 
  Check, 
  X, 
  AlertCircle, 
  RefreshCw,
  Users,
  Shield,
  TrendingUp,
  Calendar
} from 'lucide-react';
import { 
  IdentityMatchResult, 
  MatchStatus,
  PlayerIdentity,
  TeamIdentity 
} from '@/types/identity';

interface IdentityResolutionManagerProps {
  leagueId: string;
  onIdentitiesUpdated?: () => void;
}

export function IdentityResolutionManager({ leagueId, onIdentitiesUpdated }: IdentityResolutionManagerProps) {
  const [activeTab, setActiveTab] = useState<'players' | 'teams' | 'matches' | 'audit'>('matches');
  const [matches, setMatches] = useState<IdentityMatchResult[]>([]);
  const [playerIdentities, setPlayerIdentities] = useState<PlayerIdentity[]>([]);
  const [teamIdentities, setTeamIdentities] = useState<TeamIdentity[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMatch, setSelectedMatch] = useState<IdentityMatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchData();
    fetchStats();
  }, [leagueId, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'matches') {
        await fetchMatches();
      } else if (activeTab === 'players') {
        await fetchPlayerIdentities();
      } else if (activeTab === 'teams') {
        await fetchTeamIdentities();
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMatches = async () => {
    const response = await fetch(`/api/leagues/${leagueId}/identity/matches?status=${filter === 'all' ? '' : filter}`);
    const data = await response.json();
    setMatches(data.matches || []);
  };

  const fetchPlayerIdentities = async () => {
    const response = await fetch(`/api/leagues/${leagueId}/identity?type=identities&entityType=player`);
    const data = await response.json();
    setPlayerIdentities(data || []);
  };

  const fetchTeamIdentities = async () => {
    const response = await fetch(`/api/leagues/${leagueId}/identity?type=identities&entityType=team`);
    const data = await response.json();
    setTeamIdentities(data || []);
  };

  const fetchStats = async () => {
    const response = await fetch(`/api/leagues/${leagueId}/identity?type=summary`);
    const data = await response.json();
    setStats(data);
  };

  const runAutoResolve = async (entityType: 'player' | 'team') => {
    setResolving(true);
    try {
      const response = await fetch(`/api/leagues/${leagueId}/identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve',
          entityType,
          options: {
            autoApprove: true,
            skipExisting: true,
            minConfidence: 0.85,
          },
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        await fetchData();
        await fetchStats();
        onIdentitiesUpdated?.();
      }
    } catch (error) {
      console.error('Failed to run auto-resolve:', error);
    } finally {
      setResolving(false);
    }
  };

  const handleApprove = async (matchId: string) => {
    try {
      await fetch(`/api/leagues/${leagueId}/identity/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          matchId,
        }),
      });
      await fetchMatches();
    } catch (error) {
      console.error('Failed to approve match:', error);
    }
  };

  const handleReject = async (matchId: string) => {
    try {
      await fetch(`/api/leagues/${leagueId}/identity/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          matchId,
        }),
      });
      await fetchMatches();
    } catch (error) {
      console.error('Failed to reject match:', error);
    }
  };

  const handleMerge = async (player1Id: string, player2Id: string) => {
    try {
      await fetch(`/api/leagues/${leagueId}/identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'merge',
          entityType: 'player',
          primaryId: player1Id,
          secondaryId: player2Id,
        }),
      });
      await fetchData();
      setSelectedMatch(null);
    } catch (error) {
      console.error('Failed to merge players:', error);
    }
  };

  const getConfidenceBadgeColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-500';
    if (confidence >= 0.7) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusBadgeVariant = (status: MatchStatus) => {
    switch (status) {
      case 'approved': return 'default';
      case 'rejected': return 'destructive';
      case 'merged': return 'secondary';
      default: return 'outline';
    }
  };

  const filteredMatches = matches.filter(match => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        match.player1.name.toLowerCase().includes(term) ||
        match.player2.name.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Player Identities</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.players?.identities || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats.players?.mappings || 0} total mappings
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Identities</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.teams?.identities || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats.teams?.mappings || 0} total mappings
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Confidence</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {matches.length > 0 
                  ? `${(matches.reduce((acc, m) => acc + m.confidence, 0) / matches.length * 100).toFixed(0)}%`
                  : 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground">
                Across all matches
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {matches.filter(m => m.status === 'pending').length}
              </div>
              <p className="text-xs text-muted-foreground">
                Requires manual review
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Identity Resolution</CardTitle>
              <CardDescription>
                Manage player and team identities across seasons
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => runAutoResolve('player')} 
                disabled={resolving}
                variant="outline"
              >
                {resolving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Resolving...
                  </>
                ) : (
                  <>
                    <Users className="mr-2 h-4 w-4" />
                    Auto-Resolve Players
                  </>
                )}
              </Button>
              <Button 
                onClick={() => runAutoResolve('team')} 
                disabled={resolving}
                variant="outline"
              >
                {resolving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Resolving...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Auto-Resolve Teams
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Button onClick={fetchData} variant="outline">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="matches">
                Matches ({matches.filter(m => m.status === 'pending').length})
              </TabsTrigger>
              <TabsTrigger value="players">Players</TabsTrigger>
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="audit">Audit Log</TabsTrigger>
            </TabsList>

            <TabsContent value="matches" className="mt-4">
              <div className="mb-4">
                <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                    <TabsTrigger value="approved">Approved</TabsTrigger>
                    <TabsTrigger value="rejected">Rejected</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player 1</TableHead>
                    <TableHead>Player 2</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Reasons</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMatches.map((match) => (
                    <TableRow key={match.id}>
                      <TableCell>
                        <div>
                          <p className="font-semibold">{match.player1.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {match.player1.season} • {match.player1.position}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold">{match.player2.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {match.player2.season} • {match.player2.position}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getConfidenceBadgeColor(match.confidence)}>
                          {(match.confidence * 100).toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {match.reasons.map((reason, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {reason}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(match.status)}>
                          {match.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {match.status === 'pending' ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleApprove(match.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleReject(match.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedMatch(match)}
                            >
                              <Merge className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {match.reviewedAt ? 
                              new Date(match.reviewedAt).toLocaleDateString() : 
                              '-'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="players" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canonical Name</TableHead>
                    <TableHead>Seasons</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Verified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {playerIdentities.map((identity) => (
                    <TableRow key={identity.id}>
                      <TableCell className="font-medium">
                        {identity.canonicalName}
                      </TableCell>
                      <TableCell>
                        {identity.mappings?.length || 0} seasons
                      </TableCell>
                      <TableCell>
                        <Badge className={getConfidenceBadgeColor(identity.confidenceScore)}>
                          {(identity.confidenceScore * 100).toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {identity.verified ? (
                          <Badge variant="default">Verified</Badge>
                        ) : (
                          <Badge variant="outline">Unverified</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="teams" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team Name</TableHead>
                    <TableHead>Seasons</TableHead>
                    <TableHead>Owner History</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamIdentities.map((identity) => (
                    <TableRow key={identity.id}>
                      <TableCell className="font-medium">
                        {identity.canonicalName}
                      </TableCell>
                      <TableCell>
                        {identity.mappings?.length || 0} seasons
                      </TableCell>
                      <TableCell>
                        {identity.ownerHistory?.map((owner, i) => (
                          <div key={i} className="text-sm">
                            {owner.name} ({owner.startSeason}-{owner.endSeason || 'present'})
                          </div>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="audit" className="mt-4">
              <div className="text-center text-muted-foreground py-8">
                Audit log component will be implemented separately
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Merge Dialog */}
      {selectedMatch && (
        <AlertDialog open={!!selectedMatch} onOpenChange={() => setSelectedMatch(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Player Merge</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to merge these players? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="my-4 space-y-4">
              <div className="p-4 border rounded">
                <p className="font-semibold">{selectedMatch.player1.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedMatch.player1.season} • {selectedMatch.player1.position}
                </p>
              </div>
              <div className="flex justify-center">
                <Merge className="h-6 w-6" />
              </div>
              <div className="p-4 border rounded">
                <p className="font-semibold">{selectedMatch.player2.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedMatch.player2.season} • {selectedMatch.player2.position}
                </p>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  handleMerge(selectedMatch.player1.id, selectedMatch.player2.id);
                }}
              >
                Merge Players
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Competition, CompetitionType, CompetitionScope, CompetitionStatus } from '@/types/betting';
import {
  Trophy,
  Users,
  DollarSign,
  Calendar,
  Clock,
  Search,
  Filter,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Star,
  Zap,
  Target,
  Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompetitionBrowserProps {
  leagueId?: string;
  userId: string;
}

export function CompetitionBrowser({ leagueId, userId }: CompetitionBrowserProps) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [filteredCompetitions, setFilteredCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<CompetitionType | 'ALL'>('ALL');
  const [scopeFilter, setScopeFilter] = useState<CompetitionScope | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<CompetitionStatus | 'ALL'>('ALL');
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [userEntries, setUserEntries] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('available');

  useEffect(() => {
    fetchCompetitions();
    fetchUserEntries();
  }, [leagueId, userId]);

  useEffect(() => {
    filterCompetitions();
  }, [competitions, searchTerm, typeFilter, scopeFilter, statusFilter, activeTab]);

  const fetchCompetitions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (leagueId) params.append('leagueId', leagueId);
      
      const res = await fetch(`/api/competitions?${params}`);
      const data = await res.json();
      
      if (data.success) {
        setCompetitions(data.data);
      }
    } catch (error) {
      console.error('Error fetching competitions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserEntries = async () => {
    try {
      const res = await fetch(`/api/competitions?userId=${userId}`);
      const data = await res.json();
      
      if (data.success) {
        const entryIds = new Set(data.data.map((c: Competition) => c.id));
        setUserEntries(entryIds);
      }
    } catch (error) {
      console.error('Error fetching user entries:', error);
    }
  };

  const filterCompetitions = () => {
    let filtered = [...competitions];

    // Tab filtering
    if (activeTab === 'available') {
      filtered = filtered.filter(c => 
        (c.status === 'PENDING' || c.status === 'ACTIVE') && 
        !userEntries.has(c.id) &&
        (!c.maxEntrants || c.currentEntrants < c.maxEntrants)
      );
    } else if (activeTab === 'entered') {
      filtered = filtered.filter(c => userEntries.has(c.id));
    } else if (activeTab === 'completed') {
      filtered = filtered.filter(c => c.status === 'COMPLETED');
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Type filter
    if (typeFilter !== 'ALL') {
      filtered = filtered.filter(c => c.type === typeFilter);
    }

    // Scope filter
    if (scopeFilter !== 'ALL') {
      filtered = filtered.filter(c => c.scope === scopeFilter);
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }

    setFilteredCompetitions(filtered);
  };

  const handleJoinCompetition = async () => {
    if (!selectedCompetition) return;

    try {
      setJoining(true);
      const res = await fetch(
        `/api/competitions/${selectedCompetition.id}/join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leagueId }),
        }
      );

      const data = await res.json();
      
      if (data.success) {
        setUserEntries(prev => new Set([...prev, selectedCompetition.id]));
        setJoinDialogOpen(false);
        // Refresh competitions to update entry counts
        fetchCompetitions();
      } else {
        alert(data.error || 'Failed to join competition');
      }
    } catch (error) {
      console.error('Error joining competition:', error);
      alert('Failed to join competition');
    } finally {
      setJoining(false);
    }
  };

  const getTypeIcon = (type: CompetitionType) => {
    switch (type) {
      case 'WEEKLY':
        return <Calendar className="h-4 w-4" />;
      case 'SEASON':
        return <Trophy className="h-4 w-4" />;
      case 'TOURNAMENT':
        return <Target className="h-4 w-4" />;
      case 'CUSTOM':
        return <Zap className="h-4 w-4" />;
      default:
        return <Star className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: CompetitionStatus) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-500';
      case 'ACTIVE':
        return 'bg-green-500';
      case 'SETTLING':
        return 'bg-blue-500';
      case 'COMPLETED':
        return 'bg-gray-500';
      case 'CANCELLED':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const CompetitionCard = ({ competition }: { competition: Competition }) => {
    const isEntered = userEntries.has(competition.id);
    const isFull = competition.maxEntrants && competition.currentEntrants >= competition.maxEntrants;
    const canJoin = !isEntered && !isFull && 
      (competition.status === 'PENDING' || competition.status === 'ACTIVE');

    return (
      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              {getTypeIcon(competition.type)}
              <div>
                <CardTitle className="text-lg">{competition.name}</CardTitle>
                {competition.description && (
                  <CardDescription className="mt-1">
                    {competition.description}
                  </CardDescription>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end space-y-2">
              <Badge className={cn(getStatusColor(competition.status), 'text-white')}>
                {competition.status}
              </Badge>
              {isEntered && (
                <Badge variant="outline" className="border-green-500 text-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Entered
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>
                  {competition.currentEntrants}
                  {competition.maxEntrants && `/${competition.maxEntrants}`} entrants
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span>
                  {competition.entryFee > 0 
                    ? `${competition.entryFee} units entry`
                    : 'Free entry'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <span>{competition.prizePool} units prize pool</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{formatDate(competition.startDate)} - {formatDate(competition.endDate)}</span>
              </div>
            </div>

            {competition.prizeStructure && (
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">Prize Structure</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {Object.entries(competition.prizeStructure).slice(0, 3).map(([place, prize]) => (
                    <div key={place} className="flex justify-between">
                      <span className="text-muted-foreground">{place}:</span>
                      <span className="font-medium">{prize as string}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t">
              <div className="flex items-center space-x-2">
                {competition.requiresInvite && (
                  <Badge variant="outline">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Invite Only
                  </Badge>
                )}
                {isFull && (
                  <Badge variant="outline" className="border-red-500 text-red-500">
                    Full
                  </Badge>
                )}
              </div>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // Navigate to competition details
                    window.location.href = `/competitions/${competition.id}`;
                  }}
                >
                  View Details
                </Button>
                {canJoin && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedCompetition(competition);
                      setJoinDialogOpen(true);
                    }}
                  >
                    Join Competition
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Browse Competitions</CardTitle>
          <CardDescription>
            Find and join competitions to test your skills
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search competitions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={typeFilter} onValueChange={(value: any) => setTypeFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
                <SelectItem value="SEASON">Season</SelectItem>
                <SelectItem value="TOURNAMENT">Tournament</SelectItem>
                <SelectItem value="CUSTOM">Custom</SelectItem>
              </SelectContent>
            </Select>
            <Select value={scopeFilter} onValueChange={(value: any) => setScopeFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Scopes</SelectItem>
                <SelectItem value="LEAGUE">League</SelectItem>
                <SelectItem value="GLOBAL">Global</SelectItem>
                <SelectItem value="PRIVATE">Private</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Competition Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="available">Available</TabsTrigger>
          <TabsTrigger value="entered">My Competitions</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="space-y-4">
          {filteredCompetitions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Trophy className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No available competitions</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Check back later for new competitions
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredCompetitions.map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="entered" className="space-y-4">
          {filteredCompetitions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Users className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">You haven't entered any competitions</p>
                <Button className="mt-4" onClick={() => setActiveTab('available')}>
                  Browse Available Competitions
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredCompetitions.map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {filteredCompetitions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Crown className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No completed competitions</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredCompetitions.map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Join Dialog */}
      <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join Competition</DialogTitle>
            <DialogDescription>
              Are you sure you want to join this competition?
            </DialogDescription>
          </DialogHeader>
          {selectedCompetition && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="font-medium">{selectedCompetition.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedCompetition.description}
                </p>
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Entry Fee: {selectedCompetition.entryFee > 0
                    ? `${selectedCompetition.entryFee} units will be deducted from your bankroll`
                    : 'Free entry'}
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Prize Pool</p>
                  <p className="font-medium">{selectedCompetition.prizePool} units</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Current Entrants</p>
                  <p className="font-medium">
                    {selectedCompetition.currentEntrants}
                    {selectedCompetition.maxEntrants && `/${selectedCompetition.maxEntrants}`}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Competition Type</p>
                  <p className="font-medium">{selectedCompetition.type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p className="font-medium">
                    {formatDate(selectedCompetition.startDate)} - {formatDate(selectedCompetition.endDate)}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleJoinCompetition} disabled={joining}>
              {joining ? 'Joining...' : 'Join Competition'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
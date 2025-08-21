'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Achievement, AchievementCategory } from '@/types/betting';
import {
  Trophy,
  Medal,
  Award,
  Star,
  Target,
  TrendingUp,
  Users,
  Calendar,
  Zap,
  Shield,
  Crown,
  Gem,
  Lock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AchievementDisplayProps {
  userId: string;
  leagueId?: string;
  showProgress?: boolean;
  compactView?: boolean;
}

export function AchievementDisplay({
  userId,
  leagueId,
  showProgress = true,
  compactView = false,
}: AchievementDisplayProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [userAchievements, setUserAchievements] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<AchievementCategory | 'ALL'>('ALL');

  useEffect(() => {
    fetchAchievements();
  }, [userId, leagueId]);

  const fetchAchievements = async () => {
    try {
      setLoading(true);
      
      // Fetch all available achievements
      const allRes = await fetch('/api/achievements');
      const allData = await allRes.json();
      
      // Fetch user's achievements
      const params = new URLSearchParams({ userId });
      if (leagueId) params.append('leagueId', leagueId);
      
      const userRes = await fetch(`/api/achievements/user?${params}`);
      const userData = await userRes.json();
      
      if (allData.success) {
        setAchievements(allData.data);
      }
      
      if (userData.success) {
        const unlockedIds = new Set(userData.data.map((a: Achievement) => a.id));
        setUserAchievements(unlockedIds);
      }
    } catch (error) {
      console.error('Error fetching achievements:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category: AchievementCategory) => {
    switch (category) {
      case 'COMPETITION_WINS':
        return <Trophy className="h-5 w-5" />;
      case 'BETTING_MILESTONES':
        return <TrendingUp className="h-5 w-5" />;
      case 'PARTICIPATION':
        return <Users className="h-5 w-5" />;
      case 'STREAKS':
        return <Zap className="h-5 w-5" />;
      case 'SPECIAL':
        return <Star className="h-5 w-5" />;
      default:
        return <Award className="h-5 w-5" />;
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'COMMON':
        return 'text-gray-500 border-gray-500';
      case 'RARE':
        return 'text-blue-500 border-blue-500';
      case 'EPIC':
        return 'text-purple-500 border-purple-500';
      case 'LEGENDARY':
        return 'text-yellow-500 border-yellow-500';
      default:
        return 'text-gray-400 border-gray-400';
    }
  };

  const getRarityIcon = (rarity: string) => {
    switch (rarity) {
      case 'LEGENDARY':
        return <Crown className="h-4 w-4" />;
      case 'EPIC':
        return <Gem className="h-4 w-4" />;
      case 'RARE':
        return <Shield className="h-4 w-4" />;
      default:
        return <Medal className="h-4 w-4" />;
    }
  };

  const calculateProgress = (achievement: Achievement): number => {
    if (!achievement.isProgressive || !achievement.currentProgress) {
      return userAchievements.has(achievement.id) ? 100 : 0;
    }
    
    const progress = (achievement.currentProgress / achievement.targetValue!) * 100;
    return Math.min(progress, 100);
  };

  const getFilteredAchievements = () => {
    let filtered = [...achievements];
    
    if (activeCategory !== 'ALL') {
      filtered = filtered.filter(a => a.category === activeCategory);
    }
    
    // Sort: Unlocked first, then by rarity
    const rarityOrder = { 'LEGENDARY': 0, 'EPIC': 1, 'RARE': 2, 'COMMON': 3 };
    filtered.sort((a, b) => {
      const aUnlocked = userAchievements.has(a.id);
      const bUnlocked = userAchievements.has(b.id);
      
      if (aUnlocked !== bUnlocked) {
        return aUnlocked ? -1 : 1;
      }
      
      return (rarityOrder[a.rarity as keyof typeof rarityOrder] || 3) -
             (rarityOrder[b.rarity as keyof typeof rarityOrder] || 3);
    });
    
    return filtered;
  };

  const AchievementCard = ({ achievement }: { achievement: Achievement }) => {
    const isUnlocked = userAchievements.has(achievement.id);
    const progress = calculateProgress(achievement);
    
    return (
      <Card
        className={cn(
          'cursor-pointer transition-all hover:shadow-lg',
          !isUnlocked && 'opacity-60',
          compactView && 'p-2'
        )}
        onClick={() => {
          setSelectedAchievement(achievement);
          setDetailsOpen(true);
        }}
      >
        <CardHeader className={cn(compactView && 'p-2')}>
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={cn(
                  'p-2 rounded-full',
                  isUnlocked ? 'bg-primary/10' : 'bg-muted'
                )}
              >
                {isUnlocked ? (
                  getCategoryIcon(achievement.category)
                ) : (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <CardTitle className={cn('text-base', compactView && 'text-sm')}>
                  {achievement.name}
                </CardTitle>
                {!compactView && (
                  <CardDescription className="mt-1">
                    {achievement.description}
                  </CardDescription>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {getRarityIcon(achievement.rarity || 'COMMON')}
              <Badge
                variant="outline"
                className={cn(
                  getRarityColor(achievement.rarity || 'COMMON'),
                  compactView && 'text-xs'
                )}
              >
                {achievement.rarity || 'COMMON'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        {!compactView && (
          <CardContent>
            <div className="space-y-3">
              {showProgress && achievement.isProgressive && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">
                      {achievement.currentProgress || 0} / {achievement.targetValue}
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {achievement.rewardValue && (
                    <Badge variant="secondary">
                      +{achievement.rewardValue} {achievement.rewardType}
                    </Badge>
                  )}
                  {achievement.badgeIcon && (
                    <span className="text-2xl">{achievement.badgeIcon}</span>
                  )}
                </div>
                {isUnlocked && (
                  <div className="flex items-center text-green-500">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    <span className="text-sm font-medium">Unlocked</span>
                  </div>
                )}
              </div>
              
              {isUnlocked && achievement.unlockedAt && (
                <p className="text-xs text-muted-foreground">
                  Unlocked on {new Date(achievement.unlockedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const AchievementStats = () => {
    const totalAchievements = achievements.length;
    const unlockedCount = userAchievements.size;
    const progressPercentage = totalAchievements > 0
      ? (unlockedCount / totalAchievements) * 100
      : 0;
    
    const categoryStats = achievements.reduce((acc, achievement) => {
      const category = achievement.category;
      if (!acc[category]) {
        acc[category] = { total: 0, unlocked: 0 };
      }
      acc[category].total++;
      if (userAchievements.has(achievement.id)) {
        acc[category].unlocked++;
      }
      return acc;
    }, {} as Record<AchievementCategory, { total: number; unlocked: number }>);
    
    return (
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {unlockedCount} / {totalAchievements}
            </div>
            <Progress value={progressPercentage} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {progressPercentage.toFixed(1)}% complete
            </p>
          </CardContent>
        </Card>
        
        {Object.entries(categoryStats).slice(0, 3).map(([category, stats]) => (
          <Card key={category}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center space-x-2">
                {getCategoryIcon(category as AchievementCategory)}
                <span>{category.replace(/_/g, ' ')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.unlocked} / {stats.total}
              </div>
              <Progress
                value={(stats.unlocked / stats.total) * 100}
                className="mt-2 h-2"
              />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (compactView) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Achievements</h3>
          <Badge variant="secondary">
            {userAchievements.size} / {achievements.length}
          </Badge>
        </div>
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {getFilteredAchievements().slice(0, 10).map((achievement) => (
              <AchievementCard key={achievement.id} achievement={achievement} />
            ))}
          </div>
        </ScrollArea>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => window.location.href = '/achievements'}
        >
          View All Achievements
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <AchievementStats />
      
      {/* Achievement Categories */}
      <Tabs value={activeCategory} onValueChange={(value: any) => setActiveCategory(value)}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="ALL">All</TabsTrigger>
          <TabsTrigger value="COMPETITION_WINS">Wins</TabsTrigger>
          <TabsTrigger value="BETTING_MILESTONES">Betting</TabsTrigger>
          <TabsTrigger value="PARTICIPATION">Participation</TabsTrigger>
          <TabsTrigger value="STREAKS">Streaks</TabsTrigger>
          <TabsTrigger value="SPECIAL">Special</TabsTrigger>
        </TabsList>
        
        <TabsContent value={activeCategory} className="mt-4">
          {getFilteredAchievements().length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No achievements in this category</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {getFilteredAchievements().map((achievement) => (
                <AchievementCard key={achievement.id} achievement={achievement} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      {/* Achievement Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              {selectedAchievement && getCategoryIcon(selectedAchievement.category)}
              <span>{selectedAchievement?.name}</span>
            </DialogTitle>
            <DialogDescription>
              {selectedAchievement?.description}
            </DialogDescription>
          </DialogHeader>
          {selectedAchievement && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge
                  variant="outline"
                  className={getRarityColor(selectedAchievement.rarity || 'COMMON')}
                >
                  {selectedAchievement.rarity || 'COMMON'}
                </Badge>
                {userAchievements.has(selectedAchievement.id) ? (
                  <Badge className="bg-green-500 text-white">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Unlocked
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    <Lock className="h-3 w-3 mr-1" />
                    Locked
                  </Badge>
                )}
              </div>
              
              {selectedAchievement.isProgressive && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">
                      {selectedAchievement.currentProgress || 0} / {selectedAchievement.targetValue}
                    </span>
                  </div>
                  <Progress value={calculateProgress(selectedAchievement)} className="h-2" />
                </div>
              )}
              
              {selectedAchievement.criteria && (
                <div>
                  <p className="text-sm font-medium mb-2">Requirements</p>
                  <div className="space-y-1">
                    {Object.entries(selectedAchievement.criteria).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{key}:</span>
                        <span>{value as string}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedAchievement.rewardValue && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-2">Rewards</p>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary" className="text-lg py-1">
                      +{selectedAchievement.rewardValue} {selectedAchievement.rewardType}
                    </Badge>
                    {selectedAchievement.badgeIcon && (
                      <span className="text-3xl">{selectedAchievement.badgeIcon}</span>
                    )}
                  </div>
                </div>
              )}
              
              {userAchievements.has(selectedAchievement.id) && selectedAchievement.unlockedAt && (
                <div className="text-sm text-muted-foreground border-t pt-4">
                  Unlocked on {new Date(selectedAchievement.unlockedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
'use client';

import { useState } from 'react';
import DashboardPageLayout from '@/components/dashboard/layout';
import { ContentDashboard } from '@/components/content/content-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Newspaper, TrendingUp, Users, Trophy, Sparkles, Calendar } from 'lucide-react';
import { useContent, useTrendingTopics, useContentSchedule } from '@/hooks/api/use-content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArticleCard } from '@/components/content/article-card';
import { ContentFilters } from '@/components/content/content-filters';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';

export default function FantasyNewsPage() {
  const router = useRouter();
  const [contentType, setContentType] = useState<'platform' | 'league'>('platform');
  const [filters, setFilters] = useState({});
  const { data: articles, isLoading } = useContent(contentType, filters);
  const { data: trending } = useTrendingTopics();
  const { data: schedule } = useContentSchedule();

  const handleArticleClick = (articleId: string) => {
    // Navigate to article detail page when implemented
    console.log('Article clicked:', articleId);
  };

  const handleTopicClick = (topic: string) => {
    setFilters({ ...filters, tags: [topic] });
  };

  return (
    <DashboardPageLayout
      header={{
        title: 'Fantasy News',
        description: 'Latest updates and AI-generated content',
        icon: Newspaper,
        actions: (
          <div className="flex gap-2">
            <Button
              variant={contentType === 'platform' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setContentType('platform')}
            >
              Platform News
            </Button>
            <Button
              variant={contentType === 'league' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setContentType('league')}
            >
              League News
            </Button>
            <LeagueSwitcher />
          </div>
        ),
      }}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-4">
          <ContentFilters onFilterChange={setFilters} />
          
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {articles && articles.length > 0 ? (
                <>
                  {/* Featured Article */}
                  {articles[0] && (
                    <ArticleCard 
                      article={{
                        ...articles[0],
                        featured: true,
                      }} 
                      variant="featured"
                      onClick={() => handleArticleClick(articles[0].id)}
                    />
                  )}
                  
                  {/* Other Articles */}
                  {articles.slice(1).map((article: any) => (
                    <ArticleCard 
                      key={article.id} 
                      article={article}
                      onClick={() => handleArticleClick(article.id)}
                    />
                  ))}
                </>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Newspaper className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Articles Found</h3>
                    <p className="text-muted-foreground text-center">
                      {contentType === 'league' 
                        ? 'No league-specific content available yet'
                        : 'No platform content available'}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Trending Topics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Trending Topics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {trending ? (
                  trending.map((topic: any, index: number) => (
                    <Badge 
                      key={index} 
                      variant="outline" 
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => handleTopicClick(topic.name)}
                    >
                      {topic.name}
                      {topic.count && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({topic.count})
                        </span>
                      )}
                    </Badge>
                  ))
                ) : (
                  ['Injuries', 'Trades', 'Waivers', 'DFS', 'Dynasty'].map((topic) => (
                    <Badge 
                      key={topic} 
                      variant="outline" 
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => handleTopicClick(topic)}
                    >
                      {topic}
                    </Badge>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Content Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Content Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {schedule ? (
                  schedule.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between">
                      <span>{item.contentType}</span>
                      <span className="text-muted-foreground">{item.schedule}</span>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>Weekly Recap</span>
                      <span className="text-muted-foreground">Monday</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Power Rankings</span>
                      <span className="text-muted-foreground">Tuesday</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Matchup Preview</span>
                      <span className="text-muted-foreground">Thursday</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Start/Sit</span>
                      <span className="text-muted-foreground">Saturday</span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* AI Generation */}
          {contentType === 'league' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AI Content Generation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ContentDashboard />
              </CardContent>
            </Card>
          )}

          {/* Popular Articles */}
          <Card>
            <CardHeader>
              <CardTitle>Popular This Week</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {articles?.slice(0, 5).map((article: any, index: number) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      variant="compact"
                      onClick={() => handleArticleClick(article.id)}
                    />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardPageLayout>
  );
}
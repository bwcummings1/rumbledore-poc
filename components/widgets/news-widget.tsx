'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Newspaper, Clock, TrendingUp } from 'lucide-react';
import { useContent } from '@/hooks/api/use-content';
import { useLeagueContext } from '@/contexts/league-context';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';

export function NewsWidget() {
  const { currentLeague } = useLeagueContext();
  const { data: articles, isLoading } = useContent(
    currentLeague ? 'league' : 'platform',
    { limit: 5 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            Latest News
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getCategoryColor = (category?: string) => {
    switch (category?.toLowerCase()) {
      case 'news':
        return 'bg-blue-500/10 text-blue-500';
      case 'analysis':
        return 'bg-purple-500/10 text-purple-500';
      case 'betting':
        return 'bg-green-500/10 text-green-500';
      case 'fantasy':
        return 'bg-yellow-500/10 text-yellow-500';
      default:
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="h-5 w-5" />
          Latest News
          {currentLeague && (
            <Badge variant="outline" className="ml-auto text-xs">
              {currentLeague.name}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[250px]">
          {!articles || articles.length === 0 ? (
            <div className="text-center py-8">
              <Newspaper className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No news articles available
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {articles.map((article: any) => (
                <div
                  key={article.id}
                  className="group cursor-pointer rounded-lg p-2 hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium line-clamp-2 group-hover:text-primary">
                        {article.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${getCategoryColor(article.category)}`}
                        >
                          {article.category || 'News'}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {article.publishedAt 
                            ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })
                            : 'Just now'}
                        </span>
                      </div>
                    </div>
                    {article.trending && (
                      <TrendingUp className="h-4 w-4 text-orange-500 flex-shrink-0" />
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
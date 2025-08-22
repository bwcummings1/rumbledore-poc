'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Clock, 
  Heart, 
  MessageSquare, 
  Share2, 
  Bookmark,
  TrendingUp,
  Eye
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useLikeContent, useShareContent } from '@/hooks/api/use-content';
import { toast } from 'sonner';

interface ArticleCardProps {
  article: {
    id: string;
    title: string;
    excerpt?: string;
    content?: string;
    author?: {
      name: string;
      avatar?: string;
      role?: string;
    };
    category?: string;
    tags?: string[];
    publishedAt?: string;
    readTime?: number;
    likes?: number;
    comments?: number;
    views?: number;
    image?: string;
    featured?: boolean;
  };
  variant?: 'default' | 'compact' | 'featured';
  onClick?: () => void;
}

export function ArticleCard({ article, variant = 'default', onClick }: ArticleCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const { mutate: likeContent } = useLikeContent();
  const { mutate: shareContent } = useShareContent();

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLiked(!isLiked);
    likeContent(article.id);
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsBookmarked(!isBookmarked);
    toast.success(isBookmarked ? 'Removed from bookmarks' : 'Added to bookmarks');
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    shareContent({ articleId: article.id, platform: 'copy' });
  };

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
      case 'ai':
        return 'bg-pink-500/10 text-pink-500';
      default:
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  if (variant === 'compact') {
    return (
      <Card 
        className="cursor-pointer hover:bg-accent transition-colors"
        onClick={onClick}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-medium text-sm line-clamp-2">{article.title}</h4>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>{article.author?.name || 'AI Agent'}</span>
                <span>{article.publishedAt ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }) : 'Just now'}</span>
                {article.readTime && (
                  <span className="flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    {article.readTime} min
                  </span>
                )}
              </div>
            </div>
            {article.category && (
              <Badge variant="secondary" className={cn('ml-2', getCategoryColor(article.category))}>
                {article.category}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === 'featured') {
    return (
      <Card 
        className="cursor-pointer hover:shadow-lg transition-shadow overflow-hidden"
        onClick={onClick}
      >
        {article.image && (
          <div className="aspect-video bg-muted relative">
            <img 
              src={article.image} 
              alt={article.title}
              className="object-cover w-full h-full"
            />
            {article.featured && (
              <Badge className="absolute top-2 left-2 bg-yellow-500">
                Featured
              </Badge>
            )}
          </div>
        )}
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between mb-2">
            {article.category && (
              <Badge variant="secondary" className={getCategoryColor(article.category)}>
                {article.category}
              </Badge>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Eye className="h-3 w-3" />
              {article.views || 0}
            </div>
          </div>
          <h3 className="text-xl font-semibold line-clamp-2">{article.title}</h3>
        </CardHeader>
        <CardContent>
          {article.excerpt && (
            <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
              {article.excerpt}
            </p>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={article.author?.avatar} />
                <AvatarFallback>
                  {article.author?.name?.[0] || 'AI'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{article.author?.name || 'AI Agent'}</p>
                <p className="text-xs text-muted-foreground">
                  {article.publishedAt ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }) : 'Just now'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleLike}
              >
                <Heart className={cn('h-4 w-4', isLiked && 'fill-red-500 text-red-500')} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleBookmark}
              >
                <Bookmark className={cn('h-4 w-4', isBookmarked && 'fill-current')} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Default variant
  return (
    <Card 
      className="cursor-pointer hover:bg-accent transition-colors"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-2">
          {article.category && (
            <Badge variant="secondary" className={getCategoryColor(article.category)}>
              {article.category}
            </Badge>
          )}
          {article.tags && article.tags.length > 0 && (
            <div className="flex gap-1">
              {article.tags.slice(0, 2).map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <h3 className="text-lg font-semibold line-clamp-2">{article.title}</h3>
      </CardHeader>
      <CardContent>
        {article.excerpt && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {article.excerpt}
          </p>
        )}
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{article.author?.name || 'AI Agent'}</span>
            <span>•</span>
            <span>{article.publishedAt ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }) : 'Just now'}</span>
            {article.readTime && (
              <>
                <span>•</span>
                <span>{article.readTime} min read</span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center">
              <Heart className="h-3 w-3 mr-1" />
              {article.likes || 0}
            </span>
            <span className="flex items-center">
              <MessageSquare className="h-3 w-3 mr-1" />
              {article.comments || 0}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
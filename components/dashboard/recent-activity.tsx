'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  ArrowUpDown, 
  MessageSquare, 
  UserPlus, 
  UserMinus,
  DollarSign,
  Trophy,
  Activity
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface RecentActivityProps {
  transactions?: any[];
  isLoading?: boolean;
}

export function RecentActivity({ transactions, isLoading }: RecentActivityProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'trade':
        return <ArrowUpDown className="h-4 w-4" />;
      case 'add':
        return <UserPlus className="h-4 w-4" />;
      case 'drop':
        return <UserMinus className="h-4 w-4" />;
      case 'message':
        return <MessageSquare className="h-4 w-4" />;
      case 'bet':
        return <DollarSign className="h-4 w-4" />;
      case 'competition':
        return <Trophy className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'trade':
        return 'text-blue-500';
      case 'add':
        return 'text-green-500';
      case 'drop':
        return 'text-red-500';
      case 'message':
        return 'text-purple-500';
      case 'bet':
        return 'text-yellow-500';
      case 'competition':
        return 'text-orange-500';
      default:
        return 'text-gray-500';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-4 animate-pulse">
                <div className="h-10 w-10 bg-muted rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const activities = transactions || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recent activity
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity, index) => (
                <div key={index} className="flex items-start space-x-4">
                  <div className={`mt-1 ${getActivityColor(activity.type)}`}>
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {activity.description || activity.title}
                      </p>
                      <Badge variant="outline" className="text-xs">
                        {activity.type}
                      </Badge>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground">
                      {activity.user && (
                        <>
                          <Avatar className="h-4 w-4 mr-1">
                            <AvatarImage src={activity.user.avatar} />
                            <AvatarFallback>
                              {activity.user.name?.[0] || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="mr-2">{activity.user.name}</span>
                          •
                        </>
                      )}
                      <span className="ml-2">
                        {activity.timestamp 
                          ? formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })
                          : 'Just now'}
                      </span>
                    </div>
                    {activity.details && (
                      <p className="text-xs text-muted-foreground">
                        {activity.details}
                      </p>
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
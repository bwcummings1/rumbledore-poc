'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  DollarSign, 
  BarChart3, 
  Trophy, 
  MessageSquare, 
  TrendingUp,
  Users,
  Calendar,
  Settings
} from 'lucide-react';

export function QuickActions() {
  const router = useRouter();

  const actions = [
    {
      title: 'Place Bet',
      description: 'Browse odds and place your bets',
      icon: DollarSign,
      color: 'text-green-500',
      onClick: () => router.push('/rumble/betting'),
    },
    {
      title: 'View Stats',
      description: 'Check league statistics',
      icon: BarChart3,
      color: 'text-blue-500',
      onClick: () => router.push('/stats'),
    },
    {
      title: 'Join Competition',
      description: 'Enter betting competitions',
      icon: Trophy,
      color: 'text-yellow-500',
      onClick: () => router.push('/rumble/competitions'),
    },
    {
      title: 'AI Assistant',
      description: 'Chat with league AI agents',
      icon: MessageSquare,
      color: 'text-purple-500',
      onClick: () => router.push('/chat'),
    },
  ];

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Button
                key={index}
                variant="outline"
                className="h-auto flex-col py-4 hover:bg-accent"
                onClick={action.onClick}
              >
                <Icon className={`h-6 w-6 mb-2 ${action.color}`} />
                <span className="font-medium text-xs">{action.title}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
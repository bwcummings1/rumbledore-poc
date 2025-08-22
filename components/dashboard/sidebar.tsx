'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Home,
  BarChart3,
  DollarSign,
  Trophy,
  MessageSquare,
  Newspaper,
  Users,
  Settings,
  Calendar,
  TrendingUp,
  Award,
  LogOut,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { signOut } from 'next-auth/react';

const navigation = [
  {
    title: 'Main',
    items: [
      { name: 'Overview', href: '/', icon: Home },
      { name: 'Leagues', href: '/leagues', icon: Users },
      { name: 'Statistics', href: '/stats', icon: BarChart3 },
      { name: 'AI Assistant', href: '/chat', icon: MessageSquare },
    ],
  },
  {
    title: 'Rumble',
    items: [
      { name: 'Paper Betting', href: '/rumble/betting', icon: DollarSign },
      { name: 'Competitions', href: '/rumble/competitions', icon: Trophy },
    ],
  },
  {
    title: 'Content',
    items: [
      { name: 'Fantasy News', href: '/news', icon: Newspaper },
      { name: 'Schedule', href: '/schedule', icon: Calendar },
    ],
  },
  {
    title: 'League',
    items: [
      { name: 'My Teams', href: '/teams', icon: Users },
      { name: 'Matchups', href: '/matchups', icon: TrendingUp },
      { name: 'History', href: '/history', icon: Award },
    ],
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="flex h-screen flex-col gap-2 py-sides">
      <div className="px-3 py-2">
        <Link href="/" className="flex items-center space-x-2">
          <Trophy className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">Rumbledore</span>
        </Link>
      </div>

      <Separator className="mx-3" />

      <ScrollArea className="flex-1 px-3">
        <div className="space-y-6 py-2">
          {navigation.map((section) => (
            <div key={section.title}>
              <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </h3>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || 
                    (item.href !== '/' && pathname.startsWith(item.href));
                  
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Separator className="mx-3" />

      <div className="p-3 space-y-2">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            pathname === '/settings'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </Link>
        
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </Button>
      </div>
    </div>
  );
}
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
  History,
  Globe,
  Zap,
  Palette,
  User,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { signOut } from 'next-auth/react';

const navigation = [
  {
    title: 'Overview',
    items: [
      { name: 'Dashboard', href: '/', icon: Home },
    ],
  },
  {
    title: 'Fantasy News',
    items: [
      { name: 'Latest News', href: '/news', icon: Newspaper },
      { name: 'Player Updates', href: '/news/players', icon: Users },
      { name: 'NFL News', href: '/news/nfl', icon: TrendingUp },
    ],
  },
  {
    title: 'League Portals',
    items: [
      { name: 'My Leagues', href: '/leagues', icon: Users },
      { name: 'League History', href: '/leagues/history', icon: History },
    ],
  },
  {
    title: 'Rumble',
    items: [
      { name: 'League Competitions', href: '/rumble/league', icon: Trophy },
      { name: 'Platform Competitions', href: '/rumble/platform', icon: Globe },
      { name: 'Betting Dashboard', href: '/rumble/betting', icon: DollarSign },
      { name: 'Global Leaderboards', href: '/rumble/leaderboards', icon: BarChart3 },
    ],
  },
  {
    title: 'Wizkit',
    items: [
      { name: 'Profile Settings', href: '/wizkit/profile', icon: User },
      { name: 'League Settings', href: '/wizkit/leagues', icon: Settings },
      { name: 'UI Customization', href: '/wizkit/ui', icon: Palette },
      { name: 'AI Assistants', href: '/wizkit/ai', icon: MessageSquare },
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
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:translate-x-0.5'
                      )}
                    >
                      <Icon className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        isActive && "scale-110"
                      )} />
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
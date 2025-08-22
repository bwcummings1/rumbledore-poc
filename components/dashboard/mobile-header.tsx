'use client';

import { usePathname } from 'next/navigation';
import { Trophy, Bell, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { signOut } from 'next-auth/react';

// Map paths to page titles
const PAGE_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/leagues': 'Leagues',
  '/rumble': 'Rumble',
  '/rumble/betting': 'Paper Betting',
  '/rumble/competitions': 'Competitions',
  '/stats': 'Statistics',
  '/news': 'Fantasy News',
  '/chat': 'AI Assistant',
  '/schedule': 'Schedule',
  '/teams': 'My Teams',
  '/matchups': 'Matchups',
  '/history': 'History',
  '/settings': 'Settings',
  '/profile': 'Profile',
  '/help': 'Help & Support',
};

export function MobileHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  
  // Get current page title
  const getPageTitle = () => {
    // Check exact match first
    if (PAGE_TITLES[pathname]) {
      return PAGE_TITLES[pathname];
    }
    
    // Check for partial matches (e.g., /leagues/[id])
    for (const [path, title] of Object.entries(PAGE_TITLES)) {
      if (pathname.startsWith(path) && path !== '/') {
        return title;
      }
    }
    
    return 'Rumbledore';
  };

  const pageTitle = getPageTitle();
  const hasNotifications = false; // TODO: Connect to real notifications

  return (
    <div className="sticky top-0 z-40 lg:hidden">
      <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
        <div className="flex items-center justify-between h-14 px-4">
          {/* Left: Logo and Title */}
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">{pageTitle}</span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* League Switcher - Only show on relevant pages */}
            {(pathname === '/' || pathname.startsWith('/leagues')) && (
              <div className="hidden sm:block">
                <LeagueSwitcher compact />
              </div>
            )}

            {/* Notifications */}
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <div className="relative">
                <Bell className="h-4 w-4" />
                {hasNotifications && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-3 w-3 p-0"
                  />
                )}
              </div>
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={session?.user?.image || undefined} />
                    <AvatarFallback>
                      {session?.user?.name?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {session?.user?.name || 'User'}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {session?.user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => window.location.href = '/profile'}
                >
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => window.location.href = '/settings'}
                >
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="text-destructive"
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Compact League Switcher for mobile */}
        {(pathname === '/' || pathname.startsWith('/leagues')) && (
          <div className="px-4 pb-2 sm:hidden">
            <LeagueSwitcher compact fullWidth />
          </div>
        )}
      </div>
    </div>
  );
}

// Extend LeagueSwitcher props to support compact and fullWidth modes
interface LeagueSwitcherExtendedProps {
  compact?: boolean;
  fullWidth?: boolean;
}
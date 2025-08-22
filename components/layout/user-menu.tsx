'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  User, 
  Settings, 
  LogOut, 
  Trophy, 
  BarChart3, 
  CreditCard,
  MessageSquare,
  Shield,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '@/providers/websocket-provider';

export function UserMenu() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { connected } = useWebSocket();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Loading state
  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="hidden md:flex flex-col gap-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!session?.user) {
    return (
      <Button 
        variant="default" 
        onClick={() => router.push('/auth/login')}
      >
        Sign In
      </Button>
    );
  }

  const initials = session.user.name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U';

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    await signOut({ callbackUrl: '/auth/login' });
  };

  const isAdmin = session.user.roles?.includes('SUPER_ADMIN') || 
                  session.user.roles?.includes('LEAGUE_OWNER') ||
                  session.user.roles?.includes('LEAGUE_ADMIN');

  return (
    <div className="flex items-center gap-3">
      {/* Connection Status Indicator */}
      <div className="hidden md:flex items-center gap-2">
        <div className={`size-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
        <span className="text-xs text-muted-foreground">
          {connected ? 'Connected' : 'Offline'}
        </span>
      </div>

      {/* User Menu Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            className="relative h-10 rounded-full px-2 hover:bg-secondary/50"
          >
            <div className="flex items-center gap-2">
              <Avatar className="h-9 w-9">
                <AvatarImage 
                  src={session.user.image || ''} 
                  alt={session.user.name || ''} 
                />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium leading-none">
                  {session.user.name}
                </span>
                {isAdmin && (
                  <Badge variant="secondary" className="mt-1 h-4 px-1.5 text-[10px]">
                    Admin
                  </Badge>
                )}
              </div>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="end" forceMount>
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{session.user.name}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {session.user.email}
              </p>
              {session.user.roles && session.user.roles.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {session.user.roles.map((role) => (
                    <Badge key={role} variant="outline" className="text-[10px] px-1.5">
                      {role.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {/* Main Navigation */}
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => router.push('/profile')}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/leagues')}>
              <Trophy className="mr-2 h-4 w-4" />
              My Leagues
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/betting')}>
              <CreditCard className="mr-2 h-4 w-4" />
              Betting Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/chat')}>
              <MessageSquare className="mr-2 h-4 w-4" />
              League Chat
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/stats')}>
              <BarChart3 className="mr-2 h-4 w-4" />
              Statistics
            </DropdownMenuItem>
          </DropdownMenuGroup>
          
          <DropdownMenuSeparator />
          
          {/* Admin Section */}
          {isAdmin && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuItem 
                  onClick={() => router.push('/admin')}
                  className="text-primary"
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Admin Portal
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          
          {/* Settings & Support */}
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/help')}>
              <HelpCircle className="mr-2 h-4 w-4" />
              Help & Support
            </DropdownMenuItem>
          </DropdownMenuGroup>
          
          <DropdownMenuSeparator />
          
          {/* Logout */}
          <DropdownMenuItem 
            onClick={handleSignOut}
            className="text-destructive focus:text-destructive"
            disabled={isLoggingOut}
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing out...
              </>
            ) : (
              <>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
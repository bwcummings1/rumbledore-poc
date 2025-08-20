'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Database,
  Settings,
  Activity,
  Shield,
  BarChart3,
  AlertCircle,
  Mail,
  Key,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';
import { signOut } from 'next-auth/react';

interface AdminSidebarProps {
  user: any;
}

const navigation = [
  {
    title: 'Overview',
    items: [
      { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
      { name: 'Activity', href: '/admin/activity', icon: Activity },
    ],
  },
  {
    title: 'Management',
    items: [
      { name: 'Leagues', href: '/admin/leagues', icon: Shield },
      { name: 'Users', href: '/admin/users', icon: Users },
      { name: 'Data Sync', href: '/admin/sync', icon: Database },
      { name: 'Invitations', href: '/admin/invitations', icon: Mail },
    ],
  },
  {
    title: 'System',
    items: [
      { name: 'Configuration', href: '/admin/config', icon: Settings },
      { name: 'Permissions', href: '/admin/permissions', icon: Key },
      { name: 'Monitoring', href: '/admin/monitoring', icon: Activity },
      { name: 'Errors', href: '/admin/errors', icon: AlertCircle },
    ],
  },
];

export function AdminSidebar({ user }: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const handleSignOut = () => {
    signOut({ callbackUrl: '/admin/login' });
  };

  return (
    <div
      className={cn(
        'relative flex h-full flex-col border-r bg-card transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b">
        {!collapsed && (
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Admin Portal</p>
              <p className="text-xs text-muted-foreground">Rumbledore</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(collapsed && 'mx-auto')}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-6">
          {navigation.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h3>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'flex items-center rounded-lg px-2 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-accent hover:text-accent-foreground',
                        collapsed && 'justify-center'
                      )}
                      title={collapsed ? item.name : undefined}
                    >
                      <Icon className={cn('h-4 w-4', !collapsed && 'mr-3')} />
                      {!collapsed && item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* User section */}
      <div className="border-t p-4">
        {!collapsed ? (
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-semibold">
                  {user?.email?.[0]?.toUpperCase() || 'A'}
                </span>
              </div>
              <div className="flex-1 truncate">
                <p className="text-sm font-medium truncate">{user?.name || 'Admin'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="mx-auto"
            onClick={handleSignOut}
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
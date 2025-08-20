# Sprint 7: Admin Portal

## Sprint Overview
Build a comprehensive administrative interface for league management, system monitoring, data sync controls, and configuration management with role-based access control.

**Duration**: 2 weeks (Week 5-6 of Phase 2)  
**Dependencies**: Sprints 5-6 (Identity Resolution & Statistics) must be complete  
**Risk Level**: Medium - Security and access control critical

## Learning Outcomes
By the end of this sprint, you will have:
1. Implemented role-based access control (RBAC)
2. Built a secure admin dashboard
3. Created system monitoring interfaces
4. Developed data management tools
5. Mastered authentication and authorization patterns

## Technical Stack
- **Framework**: Next.js App Router with RSC
- **Auth**: NextAuth.js with JWT
- **Database**: PostgreSQL with Prisma
- **UI**: shadcn/ui components
- **Monitoring**: Custom telemetry
- **Security**: RBAC, audit logging

## Implementation Guide

### Step 1: Authentication & Authorization Setup

```typescript
// /lib/auth/auth-config.ts

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const LoginSchema = z.object({
          email: z.string().email(),
          password: z.string().min(8),
        });

        try {
          const { email, password } = LoginSchema.parse(credentials);

          const user = await prisma.user.findUnique({
            where: { email },
            include: {
              roles: {
                include: {
                  permissions: true,
                },
              },
            },
          });

          if (!user || !user.password) {
            return null;
          }

          const isValidPassword = await bcrypt.compare(password, user.password);
          if (!isValidPassword) {
            return null;
          }

          // Log successful login
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: 'LOGIN',
              entityType: 'USER',
              entityId: user.id,
              metadata: {
                ip: credentials?.ip || 'unknown',
                userAgent: credentials?.userAgent || 'unknown',
              },
            },
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            roles: user.roles.map(r => r.name),
            permissions: user.roles.flatMap(r => r.permissions.map(p => p.name)),
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.roles = user.roles;
        token.permissions = user.permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.roles = token.roles as string[];
        session.user.permissions = token.permissions as string[];
      }
      return session;
    },
  },
  pages: {
    signIn: '/admin/login',
    error: '/admin/error',
  },
};

// RBAC Middleware
export async function checkPermission(
  userId: string,
  permission: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          permissions: true,
        },
      },
    },
  });

  if (!user) return false;

  // Check if user has the required permission
  return user.roles.some(role =>
    role.permissions.some(p => p.name === permission)
  );
}

export async function requireRole(
  userId: string,
  roleName: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: true,
    },
  });

  if (!user) return false;

  return user.roles.some(role => role.name === roleName);
}
```

### Step 2: Database Schema for Admin Features

```sql
-- /prisma/migrations/add_admin_tables.sql

-- Users and authentication
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255),
  name VARCHAR(255),
  avatar_url VARCHAR(500),
  email_verified TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Roles for RBAC
CREATE TABLE roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Permissions
CREATE TABLE permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User-Role mapping
CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);

-- Role-Permission mapping
CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- League membership and roles
CREATE TABLE league_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_sandbox VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id VARCHAR(255),
  role VARCHAR(50) DEFAULT 'MEMBER', -- OWNER, ADMIN, MEMBER
  status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, INVITED, SUSPENDED
  invited_at TIMESTAMP,
  joined_at TIMESTAMP,
  invited_by UUID REFERENCES users(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(league_sandbox, user_id)
);

-- League settings
CREATE TABLE league_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_sandbox VARCHAR(255) UNIQUE NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  features JSONB DEFAULT '{"espn": true, "ai_content": false, "betting": false}',
  sync_config JSONB DEFAULT '{"auto_sync": true, "sync_interval": 3600}',
  notification_config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- System configuration
CREATE TABLE system_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  category VARCHAR(100),
  is_secret BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  old_value JSONB,
  new_value JSONB,
  metadata JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- System health metrics
CREATE TABLE system_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_type VARCHAR(100) NOT NULL,
  metric_name VARCHAR(255) NOT NULL,
  value DECIMAL(20,4) NOT NULL,
  unit VARCHAR(50),
  tags JSONB DEFAULT '{}',
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_system_metrics_lookup ON system_metrics(metric_type, metric_name, recorded_at DESC);

-- Data sync status
CREATE TABLE sync_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_sandbox VARCHAR(255) NOT NULL,
  sync_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sync_status_lookup ON sync_status(league_sandbox, sync_type, created_at DESC);

-- Invitations
CREATE TABLE invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_sandbox VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'MEMBER',
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(league_sandbox, email)
);

-- Insert default roles and permissions
INSERT INTO roles (name, description) VALUES
  ('SUPER_ADMIN', 'Full system access'),
  ('LEAGUE_OWNER', 'Full league control'),
  ('LEAGUE_ADMIN', 'League management'),
  ('LEAGUE_MEMBER', 'Basic member access');

INSERT INTO permissions (name, resource, action) VALUES
  ('system.manage', 'system', 'manage'),
  ('leagues.create', 'leagues', 'create'),
  ('leagues.delete', 'leagues', 'delete'),
  ('leagues.update', 'leagues', 'update'),
  ('leagues.view', 'leagues', 'view'),
  ('members.invite', 'members', 'invite'),
  ('members.remove', 'members', 'remove'),
  ('members.update', 'members', 'update'),
  ('sync.trigger', 'sync', 'trigger'),
  ('sync.view', 'sync', 'view'),
  ('stats.recalculate', 'stats', 'recalculate'),
  ('identity.manage', 'identity', 'manage'),
  ('settings.update', 'settings', 'update');

-- Assign permissions to roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'SUPER_ADMIN';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'LEAGUE_OWNER' AND p.resource IN ('leagues', 'members', 'sync', 'stats', 'identity', 'settings');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'LEAGUE_ADMIN' AND p.name IN ('members.invite', 'sync.trigger', 'sync.view', 'stats.recalculate');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'LEAGUE_MEMBER' AND p.name IN ('leagues.view', 'sync.view');
```

### Step 3: Admin Dashboard Layout

```tsx
// /app/admin/layout.tsx

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/auth-config';
import { AdminSidebar } from '@/components/admin/sidebar';
import { AdminHeader } from '@/components/admin/header';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/admin/login');
  }

  // Check if user has admin access
  const hasAdminAccess = session.user.roles?.some(role => 
    ['SUPER_ADMIN', 'LEAGUE_OWNER', 'LEAGUE_ADMIN'].includes(role)
  );

  if (!hasAdminAccess) {
    redirect('/unauthorized');
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <AdminSidebar user={session.user} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminHeader user={session.user} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

### Step 4: Admin Dashboard Components

```tsx
// /components/admin/dashboard.tsx

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  Database,
  Activity,
  Settings,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  leagueSandbox?: string;
}

export function AdminDashboard({ leagueSandbox }: DashboardProps) {
  const [metrics, setMetrics] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [leagueSandbox]);

  const fetchDashboardData = async () => {
    try {
      const [metricsRes, syncRes, healthRes] = await Promise.all([
        fetch(`/api/admin/metrics${leagueSandbox ? `?league=${leagueSandbox}` : ''}`),
        fetch(`/api/admin/sync-status${leagueSandbox ? `?league=${leagueSandbox}` : ''}`),
        fetch('/api/admin/health'),
      ]);

      const [metricsData, syncData, healthData] = await Promise.all([
        metricsRes.json(),
        syncRes.json(),
        healthRes.json(),
      ]);

      setMetrics(metricsData);
      setSyncStatus(syncData.recent || []);
      setSystemHealth(healthData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'IN_PROGRESS':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'FAILED':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              +{metrics?.newUsersThisWeek || 0} this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Leagues</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.activeLeagues || 0}</div>
            <p className="text-xs text-muted-foreground">
              {metrics?.totalLeagues || 0} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Points</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.totalDataPoints ? (metrics.totalDataPoints / 1000000).toFixed(1) + 'M' : '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all leagues
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getHealthColor(systemHealth?.score || 0)}`}>
              {systemHealth?.score || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {systemHealth?.status || 'Unknown'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sync" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sync">Data Sync</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Sync Operations</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchDashboardData}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {syncStatus.map((sync) => (
                  <div
                    key={sync.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(sync.status)}
                      <div>
                        <p className="font-medium">{sync.syncType}</p>
                        <p className="text-sm text-gray-500">
                          {sync.leagueSandbox}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {sync.recordsProcessed || 0} records
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(sync.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics?.performanceData || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="responseTime"
                      stroke="#8884d8"
                      name="Response Time (ms)"
                    />
                    <Line
                      type="monotone"
                      dataKey="cpuUsage"
                      stroke="#82ca9d"
                      name="CPU Usage (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics?.activityData || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="activeUsers"
                      stackId="1"
                      stroke="#8884d8"
                      fill="#8884d8"
                      name="Active Users"
                    />
                    <Area
                      type="monotone"
                      dataKey="apiCalls"
                      stackId="1"
                      stroke="#82ca9d"
                      fill="#82ca9d"
                      name="API Calls"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {metrics?.recentErrors?.map((error: any) => (
                  <div
                    key={error.id}
                    className="p-3 border border-red-200 rounded-lg bg-red-50"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-red-800">{error.type}</p>
                        <p className="text-sm text-red-600 mt-1">{error.message}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {error.context}
                        </p>
                      </div>
                      <Badge variant="destructive">{error.count}x</Badge>
                    </div>
                  </div>
                )) || (
                  <p className="text-gray-500 text-center py-4">No recent errors</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### Step 5: League Management Interface

```tsx
// /components/admin/league-management.tsx

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface LeagueManagementProps {
  leagueSandbox: string;
  settings: any;
  members: any[];
}

export function LeagueManagement({
  leagueSandbox,
  settings: initialSettings,
  members: initialMembers,
}: LeagueManagementProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [members, setMembers] = useState(initialMembers);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [saving, setSaving] = useState(false);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/leagues/${leagueSandbox}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        toast.success('Settings saved successfully');
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const inviteMember = async () => {
    try {
      const response = await fetch(`/api/admin/leagues/${leagueSandbox}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (response.ok) {
        toast.success('Invitation sent successfully');
        setInviteEmail('');
        // Refresh members list
        fetchMembers();
      } else {
        throw new Error('Failed to send invitation');
      }
    } catch (error) {
      toast.error('Failed to send invitation');
    }
  };

  const updateMemberRole = async (userId: string, newRole: string) => {
    try {
      const response = await fetch(
        `/api/admin/leagues/${leagueSandbox}/members/${userId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        }
      );

      if (response.ok) {
        toast.success('Member role updated');
        fetchMembers();
      } else {
        throw new Error('Failed to update member role');
      }
    } catch (error) {
      toast.error('Failed to update member role');
    }
  };

  const removeMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      const response = await fetch(
        `/api/admin/leagues/${leagueSandbox}/members/${userId}`,
        {
          method: 'DELETE',
        }
      );

      if (response.ok) {
        toast.success('Member removed');
        fetchMembers();
      } else {
        throw new Error('Failed to remove member');
      }
    } catch (error) {
      toast.error('Failed to remove member');
    }
  };

  const fetchMembers = async () => {
    const response = await fetch(`/api/admin/leagues/${leagueSandbox}/members`);
    const data = await response.json();
    setMembers(data);
  };

  const triggerSync = async (syncType: string) => {
    try {
      const response = await fetch(`/api/admin/leagues/${leagueSandbox}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: syncType }),
      });

      if (response.ok) {
        toast.success(`${syncType} sync started`);
      } else {
        throw new Error('Failed to start sync');
      }
    } catch (error) {
      toast.error('Failed to start sync');
    }
  };

  return (
    <Tabs defaultValue="settings" className="space-y-4">
      <TabsList>
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="members">Members</TabsTrigger>
        <TabsTrigger value="sync">Data Sync</TabsTrigger>
        <TabsTrigger value="features">Features</TabsTrigger>
      </TabsList>

      <TabsContent value="settings" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>League Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="league-name">League Name</Label>
              <Input
                id="league-name"
                value={settings.name || ''}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="league-description">Description</Label>
              <Input
                id="league-description"
                value={settings.description || ''}
                onChange={(e) =>
                  setSettings({ ...settings, description: e.target.value })
                }
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="public-league"
                checked={settings.isPublic || false}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, isPublic: checked })
                }
              />
              <Label htmlFor="public-league">Public League</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="auto-sync"
                checked={settings.syncConfig?.autoSync || false}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    syncConfig: { ...settings.syncConfig, autoSync: checked },
                  })
                }
              />
              <Label htmlFor="auto-sync">Automatic Data Sync</Label>
            </div>

            {settings.syncConfig?.autoSync && (
              <div className="space-y-2">
                <Label htmlFor="sync-interval">Sync Interval (hours)</Label>
                <Input
                  id="sync-interval"
                  type="number"
                  min="1"
                  max="24"
                  value={settings.syncConfig?.syncInterval || 1}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      syncConfig: {
                        ...settings.syncConfig,
                        syncInterval: parseInt(e.target.value),
                      },
                    })
                  }
                />
              </div>
            )}

            <Button onClick={saveSettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="members" className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>League Members</CardTitle>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Invite Member</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite New Member</DialogTitle>
                    <DialogDescription>
                      Send an invitation to join this league
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email Address</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invite-role">Role</Label>
                      <Select value={inviteRole} onValueChange={setInviteRole}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MEMBER">Member</SelectItem>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={inviteMember} className="w-full">
                      Send Invitation
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{member.user.name}</p>
                    <p className="text-sm text-gray-500">{member.user.email}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Select
                      value={member.role}
                      onValueChange={(value) => updateMemberRole(member.userId, value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OWNER">Owner</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="MEMBER">Member</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeMember(member.userId)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sync" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Data Synchronization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Button
                variant="outline"
                onClick={() => triggerSync('CURRENT_SEASON')}
                className="h-20"
              >
                <div className="text-center">
                  <p className="font-medium">Sync Current Season</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Update current season data from ESPN
                  </p>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => triggerSync('HISTORICAL')}
                className="h-20"
              >
                <div className="text-center">
                  <p className="font-medium">Sync Historical Data</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Import all historical seasons
                  </p>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => triggerSync('LIVE_SCORES')}
                className="h-20"
              >
                <div className="text-center">
                  <p className="font-medium">Sync Live Scores</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Update current week scores
                  </p>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => triggerSync('RECALCULATE_STATS')}
                className="h-20"
              >
                <div className="text-center">
                  <p className="font-medium">Recalculate Statistics</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Rebuild all statistics and records
                  </p>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="features" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Feature Toggles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">ESPN Integration</p>
                  <p className="text-sm text-gray-500">
                    Enable ESPN fantasy data synchronization
                  </p>
                </div>
                <Switch
                  checked={settings.features?.espn || false}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      features: { ...settings.features, espn: checked },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">AI Content Generation</p>
                  <p className="text-sm text-gray-500">
                    Enable AI-powered blog posts and analysis
                  </p>
                </div>
                <Switch
                  checked={settings.features?.aiContent || false}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      features: { ...settings.features, aiContent: checked },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Paper Betting</p>
                  <p className="text-sm text-gray-500">
                    Enable virtual betting with fake money
                  </p>
                </div>
                <Switch
                  checked={settings.features?.betting || false}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      features: { ...settings.features, betting: checked },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Live Chat</p>
                  <p className="text-sm text-gray-500">
                    Enable real-time chat for league members
                  </p>
                </div>
                <Switch
                  checked={settings.features?.chat || false}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      features: { ...settings.features, chat: checked },
                    })
                  }
                />
              </div>
            </div>

            <Button onClick={saveSettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save Features'}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
```

### Step 6: System Monitoring Service

```typescript
// /lib/services/system-monitor.ts

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import os from 'os';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);

export class SystemMonitor {
  private metricsInterval: NodeJS.Timeout | null = null;

  startMonitoring(intervalMs: number = 60000) {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);
  }

  stopMonitoring() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  private async collectMetrics() {
    const timestamp = new Date();

    // System metrics
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();
    const loadAverage = os.loadavg();

    // Database metrics
    const dbMetrics = await this.getDatabaseMetrics();

    // Redis metrics
    const redisMetrics = await this.getRedisMetrics();

    // Application metrics
    const appMetrics = await this.getApplicationMetrics();

    // Store metrics
    await this.storeMetrics({
      timestamp,
      cpu: {
        usage: cpuUsage,
        loadAverage,
      },
      memory: {
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
      },
      database: dbMetrics,
      redis: redisMetrics,
      application: appMetrics,
    });

    // Check for alerts
    await this.checkAlerts({
      cpuUsage: loadAverage[0],
      memoryUsage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      dbConnections: dbMetrics.activeConnections,
    });
  }

  private async getDatabaseMetrics() {
    const startTime = performance.now();

    // Test database connection
    const [connectionTest, dbStats] = await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      prisma.$queryRaw`
        SELECT 
          (SELECT count(*) FROM pg_stat_activity) as active_connections,
          (SELECT count(*) FROM users) as total_users,
          (SELECT count(*) FROM leagues) as total_leagues,
          (SELECT count(*) FROM matchups) as total_matchups,
          pg_database_size(current_database()) as database_size
      `,
    ]);

    const queryTime = performance.now() - startTime;

    return {
      responseTime: queryTime,
      activeConnections: dbStats[0]?.active_connections || 0,
      totalUsers: dbStats[0]?.total_users || 0,
      totalLeagues: dbStats[0]?.total_leagues || 0,
      totalMatchups: dbStats[0]?.total_matchups || 0,
      databaseSize: dbStats[0]?.database_size || 0,
    };
  }

  private async getRedisMetrics() {
    const info = await redis.info();
    const lines = info.split('\r\n');
    const metrics: any = {};

    lines.forEach((line) => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        metrics[key] = value;
      }
    });

    return {
      connectedClients: parseInt(metrics.connected_clients || '0'),
      usedMemory: parseInt(metrics.used_memory || '0'),
      totalCommandsProcessed: parseInt(metrics.total_commands_processed || '0'),
      instantaneousOpsPerSec: parseInt(metrics.instantaneous_ops_per_sec || '0'),
    };
  }

  private async getApplicationMetrics() {
    // Get recent sync status
    const recentSyncs = await prisma.syncStatus.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 3600000), // Last hour
        },
      },
    });

    const successRate = recentSyncs.length > 0
      ? (recentSyncs.filter(s => s.status === 'COMPLETED').length / recentSyncs.length) * 100
      : 100;

    // Get recent errors
    const recentErrors = await prisma.auditLog.findMany({
      where: {
        action: 'ERROR',
        createdAt: {
          gte: new Date(Date.now() - 3600000),
        },
      },
    });

    return {
      syncSuccessRate: successRate,
      recentErrorCount: recentErrors.length,
      activeSyncs: recentSyncs.filter(s => s.status === 'IN_PROGRESS').length,
    };
  }

  private async storeMetrics(metrics: any) {
    const metricEntries = [
      {
        metricType: 'SYSTEM',
        metricName: 'cpu_load_average',
        value: metrics.cpu.loadAverage[0],
        unit: 'load',
      },
      {
        metricType: 'SYSTEM',
        metricName: 'memory_usage',
        value: metrics.memory.heapUsed,
        unit: 'bytes',
      },
      {
        metricType: 'DATABASE',
        metricName: 'active_connections',
        value: metrics.database.activeConnections,
        unit: 'count',
      },
      {
        metricType: 'DATABASE',
        metricName: 'response_time',
        value: metrics.database.responseTime,
        unit: 'ms',
      },
      {
        metricType: 'REDIS',
        metricName: 'connected_clients',
        value: metrics.redis.connectedClients,
        unit: 'count',
      },
      {
        metricType: 'APPLICATION',
        metricName: 'sync_success_rate',
        value: metrics.application.syncSuccessRate,
        unit: 'percentage',
      },
    ];

    await prisma.systemMetric.createMany({
      data: metricEntries,
    });

    // Store in Redis for quick access
    await redis.setex(
      'metrics:current',
      300,
      JSON.stringify(metrics)
    );
  }

  private async checkAlerts(metrics: any) {
    const alerts = [];

    // CPU alert
    if (metrics.cpuUsage > 80) {
      alerts.push({
        type: 'HIGH_CPU_USAGE',
        severity: 'WARNING',
        message: `CPU usage at ${metrics.cpuUsage.toFixed(1)}%`,
      });
    }

    // Memory alert
    if (metrics.memoryUsage > 90) {
      alerts.push({
        type: 'HIGH_MEMORY_USAGE',
        severity: 'CRITICAL',
        message: `Memory usage at ${metrics.memoryUsage.toFixed(1)}%`,
      });
    }

    // Database connection alert
    if (metrics.dbConnections > 90) {
      alerts.push({
        type: 'HIGH_DB_CONNECTIONS',
        severity: 'WARNING',
        message: `Database connections at ${metrics.dbConnections}`,
      });
    }

    if (alerts.length > 0) {
      // Store alerts and potentially notify administrators
      for (const alert of alerts) {
        await prisma.auditLog.create({
          data: {
            action: 'SYSTEM_ALERT',
            entityType: 'SYSTEM',
            metadata: alert,
          },
        });
      }

      // Could send notifications here (email, Slack, etc.)
    }
  }

  async getHealthScore(): Promise<{ score: number; status: string; details: any }> {
    const metrics = await redis.get('metrics:current');
    if (!metrics) {
      return { score: 0, status: 'No data', details: {} };
    }

    const current = JSON.parse(metrics);
    let score = 100;
    const issues = [];

    // Check CPU
    if (current.cpu.loadAverage[0] > 4) {
      score -= 20;
      issues.push('High CPU usage');
    } else if (current.cpu.loadAverage[0] > 2) {
      score -= 10;
      issues.push('Moderate CPU usage');
    }

    // Check memory
    const memoryUsage = (current.memory.heapUsed / current.memory.heapTotal) * 100;
    if (memoryUsage > 90) {
      score -= 30;
      issues.push('Critical memory usage');
    } else if (memoryUsage > 70) {
      score -= 15;
      issues.push('High memory usage');
    }

    // Check database
    if (current.database.responseTime > 1000) {
      score -= 20;
      issues.push('Slow database response');
    } else if (current.database.responseTime > 500) {
      score -= 10;
      issues.push('Database response degraded');
    }

    // Check application
    if (current.application.syncSuccessRate < 50) {
      score -= 25;
      issues.push('Low sync success rate');
    } else if (current.application.syncSuccessRate < 80) {
      score -= 10;
      issues.push('Sync issues detected');
    }

    let status = 'Healthy';
    if (score < 50) status = 'Critical';
    else if (score < 70) status = 'Degraded';
    else if (score < 90) status = 'Warning';

    return {
      score: Math.max(0, score),
      status,
      details: {
        issues,
        metrics: current,
      },
    };
  }
}

// Initialize monitor
export const systemMonitor = new SystemMonitor();
```

## Testing Checklist

### Unit Tests
- [ ] Authentication flow
- [ ] RBAC permissions
- [ ] Audit logging
- [ ] System monitoring
- [ ] Data sync controls

### Integration Tests
- [ ] Admin login and session
- [ ] League management operations
- [ ] Member invitation flow
- [ ] Settings persistence
- [ ] System health checks

### Security Tests
- [ ] Permission enforcement
- [ ] SQL injection prevention
- [ ] XSS protection
- [ ] CSRF protection
- [ ] Rate limiting

## Deployment Steps

1. **Database Setup**
   ```bash
   npx prisma migrate dev --name add_admin_tables
   ```

2. **Create Admin User**
   ```bash
   npm run admin:create-super-user
   ```

3. **Start System Monitor**
   ```bash
   npm run monitor:start
   ```

4. **Configure Auth**
   ```bash
   # Add to .env.local
   NEXTAUTH_SECRET=your-secret-key
   NEXTAUTH_URL=http://localhost:3000
   ```

5. **Deploy Admin Portal**
   ```bash
   npm run build
   npm run start
   ```

## Success Criteria

- [ ] Admin authentication working
- [ ] RBAC properly enforced
- [ ] League settings manageable
- [ ] Members can be invited/removed
- [ ] Data sync controllable
- [ ] System metrics visible
- [ ] Audit logs recording
- [ ] Health monitoring active
- [ ] Performance acceptable

## Notes

- Implement rate limiting on admin endpoints
- Add two-factor authentication for admin accounts
- Consider implementing API keys for programmatic access
- Monitor audit logs for suspicious activity
- Set up alerting for critical system issues
- Regular security audits recommended
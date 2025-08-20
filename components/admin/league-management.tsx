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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Settings, 
  Users, 
  Database, 
  ToggleLeft,
  Mail,
  UserPlus,
  Shield,
  RefreshCw,
  Download,
  Activity,
  Zap,
} from 'lucide-react';

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
  const [settings, setSettings] = useState(initialSettings || {
    name: '',
    description: '',
    isPublic: false,
    syncConfig: { autoSync: true, syncInterval: 1 },
    features: {
      espn: true,
      aiContent: false,
      betting: false,
      chat: false,
    },
  });
  const [members, setMembers] = useState(initialMembers || []);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

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
    setSyncing(syncType);
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
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">League Management</h2>
          <p className="text-muted-foreground">
            {leagueSandbox || 'Select a league to manage'}
          </p>
        </div>
        <Badge variant="outline" className="px-3 py-1">
          <Shield className="mr-2 h-3 w-3" />
          League ID: {leagueSandbox}
        </Badge>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users className="mr-2 h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="sync">
            <Database className="mr-2 h-4 w-4" />
            Data Sync
          </TabsTrigger>
          <TabsTrigger value="features">
            <ToggleLeft className="mr-2 h-4 w-4" />
            Features
          </TabsTrigger>
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
                  placeholder="Enter league name"
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
                  placeholder="Enter league description"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="public-league">Public League</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow public viewing of league statistics
                  </p>
                </div>
                <Switch
                  id="public-league"
                  checked={settings.isPublic || false}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, isPublic: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-sync">Automatic Data Sync</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically sync data from ESPN
                  </p>
                </div>
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
              </div>

              {settings.syncConfig?.autoSync && (
                <div className="space-y-2">
                  <Label htmlFor="sync-interval">Sync Interval (hours)</Label>
                  <Select
                    value={String(settings.syncConfig?.syncInterval || 1)}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        syncConfig: {
                          ...settings.syncConfig,
                          syncInterval: parseInt(value),
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Every hour</SelectItem>
                      <SelectItem value="2">Every 2 hours</SelectItem>
                      <SelectItem value="4">Every 4 hours</SelectItem>
                      <SelectItem value="6">Every 6 hours</SelectItem>
                      <SelectItem value="12">Every 12 hours</SelectItem>
                      <SelectItem value="24">Once daily</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={saveSettings} disabled={saving} className="w-full">
                {saving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
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
                    <Button>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Invite Member
                    </Button>
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
                          placeholder="member@example.com"
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
                            <SelectItem value="OWNER">Owner</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={inviteMember} className="w-full">
                        <Mail className="mr-2 h-4 w-4" />
                        Send Invitation
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {members.length > 0 ? members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-semibold">
                          {member.user?.name?.[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{member.user?.name || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{member.user?.email}</p>
                      </div>
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
                )) : (
                  <p className="text-center text-muted-foreground py-8">
                    No members found
                  </p>
                )}
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
                <Card className="border-dashed">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center space-y-2">
                      <Activity className="h-8 w-8 text-muted-foreground" />
                      <h3 className="font-semibold">Sync Current Season</h3>
                      <p className="text-sm text-muted-foreground text-center">
                        Update current season data from ESPN
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => triggerSync('CURRENT_SEASON')}
                        disabled={syncing === 'CURRENT_SEASON'}
                        className="w-full"
                      >
                        {syncing === 'CURRENT_SEASON' ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Start Sync
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-dashed">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center space-y-2">
                      <Download className="h-8 w-8 text-muted-foreground" />
                      <h3 className="font-semibold">Historical Data</h3>
                      <p className="text-sm text-muted-foreground text-center">
                        Import all historical seasons
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => triggerSync('HISTORICAL')}
                        disabled={syncing === 'HISTORICAL'}
                        className="w-full"
                      >
                        {syncing === 'HISTORICAL' ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 h-4 w-4" />
                            Import History
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-dashed">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center space-y-2">
                      <Zap className="h-8 w-8 text-muted-foreground" />
                      <h3 className="font-semibold">Live Scores</h3>
                      <p className="text-sm text-muted-foreground text-center">
                        Update current week scores
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => triggerSync('LIVE_SCORES')}
                        disabled={syncing === 'LIVE_SCORES'}
                        className="w-full"
                      >
                        {syncing === 'LIVE_SCORES' ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <Zap className="mr-2 h-4 w-4" />
                            Update Scores
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-dashed">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center space-y-2">
                      <Database className="h-8 w-8 text-muted-foreground" />
                      <h3 className="font-semibold">Recalculate Stats</h3>
                      <p className="text-sm text-muted-foreground text-center">
                        Rebuild all statistics and records
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => triggerSync('RECALCULATE_STATS')}
                        disabled={syncing === 'RECALCULATE_STATS'}
                        className="w-full"
                      >
                        {syncing === 'RECALCULATE_STATS' ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Calculating...
                          </>
                        ) : (
                          <>
                            <Database className="mr-2 h-4 w-4" />
                            Recalculate
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
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
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-0.5">
                    <div className="flex items-center">
                      <Database className="mr-2 h-4 w-4 text-primary" />
                      <p className="font-medium">ESPN Integration</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
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

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-0.5">
                    <div className="flex items-center">
                      <Zap className="mr-2 h-4 w-4 text-yellow-500" />
                      <p className="font-medium">AI Content Generation</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
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

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-0.5">
                    <div className="flex items-center">
                      <Activity className="mr-2 h-4 w-4 text-green-500" />
                      <p className="font-medium">Paper Betting</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
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

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-0.5">
                    <div className="flex items-center">
                      <Mail className="mr-2 h-4 w-4 text-blue-500" />
                      <p className="font-medium">Live Chat</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
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

              <Button onClick={saveSettings} disabled={saving} className="w-full">
                {saving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Saving Features...
                  </>
                ) : (
                  'Save Feature Settings'
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
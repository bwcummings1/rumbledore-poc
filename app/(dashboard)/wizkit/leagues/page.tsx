'use client';

import { useLeagueContext } from '@/contexts/league-context';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import DashboardPageLayout from "@/components/dashboard/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Shield, Bell, Users, Globe, DollarSign, MessageSquare, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

export default function LeagueSettingsPage() {
  const { currentLeague } = useLeagueContext();
  const [isLoading, setIsLoading] = useState(false);

  const handleSaveSettings = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast.success('League settings updated');
    setIsLoading(false);
  };

  return (
    <DashboardPageLayout
      header={{
        title: "League Settings",
        description: currentLeague ? `Configure ${currentLeague.name}` : "Select a league to configure",
        icon: Settings,
        actions: <LeagueSwitcher />,
      }}
    >
      {!currentLeague ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Settings className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Please select a league to manage its settings</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="general" className="space-y-4">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>League Information</CardTitle>
                <CardDescription>Basic league configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>League Name</Label>
                    <p className="text-sm text-muted-foreground">{currentLeague.name}</p>
                  </div>
                  
                  <div className="grid gap-2">
                    <Label>ESPN League ID</Label>
                    <p className="text-sm text-muted-foreground">{currentLeague.espnLeagueId?.toString()}</p>
                  </div>

                  <div className="grid gap-2">
                    <Label>Season</Label>
                    <p className="text-sm text-muted-foreground">{currentLeague.season}</p>
                  </div>

                  <div className="grid gap-2">
                    <Label>Default League</Label>
                    <div className="flex items-center space-x-2">
                      <Switch id="default-league" />
                      <Label htmlFor="default-league" className="text-sm text-muted-foreground">
                        Set as my default league
                      </Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Data Sync</CardTitle>
                <CardDescription>ESPN data synchronization settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-sync</p>
                    <p className="text-sm text-muted-foreground">Automatically sync with ESPN</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Sync Frequency</p>
                    <p className="text-sm text-muted-foreground">Every 30 minutes during games</p>
                  </div>
                  <Button variant="outline" size="sm">Configure</Button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Last Sync</p>
                    <p className="text-sm text-muted-foreground">5 minutes ago</p>
                  </div>
                  <Button variant="outline" size="sm">Sync Now</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Platform Features</CardTitle>
                <CardDescription>Enable or disable features for this league</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">AI Chat Agents</p>
                        <p className="text-sm text-muted-foreground">Enable AI assistants for this league</p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <DollarSign className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Paper Betting</p>
                        <p className="text-sm text-muted-foreground">Virtual betting with weekly bankroll</p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Platform Competitions</p>
                        <p className="text-sm text-muted-foreground">Participate in cross-league competitions</p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Zap className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">AI Content Generation</p>
                        <p className="text-sm text-muted-foreground">Auto-generate league news and updates</p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Configure league notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Score Updates</p>
                      <p className="text-sm text-muted-foreground">Real-time scoring notifications</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Trade Notifications</p>
                      <p className="text-sm text-muted-foreground">Alerts for league trades</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Waiver Wire</p>
                      <p className="text-sm text-muted-foreground">Waiver claim results</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Competition Results</p>
                      <p className="text-sm text-muted-foreground">Betting and competition outcomes</p>
                    </div>
                    <Switch />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permissions">
            <Card>
              <CardHeader>
                <CardTitle>League Permissions</CardTitle>
                <CardDescription>Manage member permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium">League Commissioner</p>
                      <p className="text-sm text-muted-foreground">Full administrative access</p>
                    </div>
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Member Permissions</p>
                    <div className="space-y-3">
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked />
                        <span className="text-sm">View league statistics</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked />
                        <span className="text-sm">Participate in betting</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked />
                        <span className="text-sm">Use AI chat features</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" />
                        <span className="text-sm">Manage league settings</span>
                      </label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations">
            <Card>
              <CardHeader>
                <CardTitle>ESPN Integration</CardTitle>
                <CardDescription>ESPN Fantasy connection status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium">Connection Status</p>
                    <p className="text-sm text-green-500">Connected</p>
                  </div>
                  <Shield className="h-5 w-5 text-green-500" />
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Cookie expires in 28 days</p>
                  <Button variant="outline" size="sm">Refresh Cookies</Button>
                </div>

                <div className="pt-4 border-t">
                  <Button variant="destructive" size="sm">Disconnect ESPN</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {currentLeague && (
        <div className="flex justify-end">
          <Button onClick={handleSaveSettings} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save All Settings'}
          </Button>
        </div>
      )}
    </DashboardPageLayout>
  );
}
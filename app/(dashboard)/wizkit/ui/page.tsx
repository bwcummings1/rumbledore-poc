'use client';

import DashboardPageLayout from "@/components/dashboard/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, Moon, Sun, Monitor, Zap, Move, Layout } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { useState } from 'react';

export default function UICustomizationPage() {
  const { theme, setTheme } = useTheme();
  const [fontSize, setFontSize] = useState([16]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSaveSettings = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast.success('UI preferences saved');
    setIsLoading(false);
  };

  return (
    <DashboardPageLayout
      header={{
        title: "UI Customization",
        description: "Personalize your dashboard appearance",
        icon: Palette,
      }}
    >
      <Tabs defaultValue="theme" className="space-y-4">
        <TabsList>
          <TabsTrigger value="theme">Theme</TabsTrigger>
          <TabsTrigger value="layout">Layout</TabsTrigger>
          <TabsTrigger value="accessibility">Accessibility</TabsTrigger>
          <TabsTrigger value="animations">Animations</TabsTrigger>
        </TabsList>

        <TabsContent value="theme" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Choose your preferred color theme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label>Theme Mode</Label>
                <RadioGroup value={theme} onValueChange={setTheme}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="light" id="light" />
                    <Label htmlFor="light" className="flex items-center gap-2 cursor-pointer">
                      <Sun className="h-4 w-4" />
                      Light
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dark" id="dark" />
                    <Label htmlFor="dark" className="flex items-center gap-2 cursor-pointer">
                      <Moon className="h-4 w-4" />
                      Dark
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="system" id="system" />
                    <Label htmlFor="system" className="flex items-center gap-2 cursor-pointer">
                      <Monitor className="h-4 w-4" />
                      System
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-4">
                <Label>Accent Color</Label>
                <div className="grid grid-cols-6 gap-2">
                  {[
                    { name: 'Blue', class: 'bg-blue-500' },
                    { name: 'Purple', class: 'bg-purple-500' },
                    { name: 'Green', class: 'bg-green-500' },
                    { name: 'Red', class: 'bg-red-500' },
                    { name: 'Orange', class: 'bg-orange-500' },
                    { name: 'Pink', class: 'bg-pink-500' },
                  ].map((color) => (
                    <button
                      key={color.name}
                      className={`h-10 w-full rounded-md ${color.class} hover:opacity-80 transition-opacity`}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>High Contrast</Label>
                    <p className="text-sm text-muted-foreground">Increase color contrast</p>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="layout" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dashboard Layout</CardTitle>
              <CardDescription>Configure your dashboard layout preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Compact Mode</Label>
                    <p className="text-sm text-muted-foreground">Reduce spacing between elements</p>
                  </div>
                  <Switch />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Fixed Sidebar</Label>
                    <p className="text-sm text-muted-foreground">Keep sidebar always visible</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show Breadcrumbs</Label>
                    <p className="text-sm text-muted-foreground">Display navigation breadcrumbs</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Sticky Headers</Label>
                    <p className="text-sm text-muted-foreground">Keep headers visible when scrolling</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Widget Dashboard</CardTitle>
              <CardDescription>Configure your Overview page widgets</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Widget Customization</Label>
                    <p className="text-sm text-muted-foreground">Drag and drop widgets on Overview</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="space-y-2">
                  <Label>Default Widgets</Label>
                  <div className="space-y-2">
                    {['League Standings', 'Recent Activity', 'Upcoming Matchups', 'Betting Stats', 'News Feed'].map((widget) => (
                      <label key={widget} className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked />
                        <span className="text-sm">{widget}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accessibility" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Accessibility Options</CardTitle>
              <CardDescription>Make the platform easier to use</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label>Font Size</Label>
                  <p className="text-sm text-muted-foreground mb-3">Adjust text size: {fontSize[0]}px</p>
                  <Slider
                    value={fontSize}
                    onValueChange={setFontSize}
                    min={12}
                    max={24}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Reduce Motion</Label>
                    <p className="text-sm text-muted-foreground">Minimize animations</p>
                  </div>
                  <Switch />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Keyboard Navigation</Label>
                    <p className="text-sm text-muted-foreground">Enhanced keyboard shortcuts</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Screen Reader Support</Label>
                    <p className="text-sm text-muted-foreground">Optimized for screen readers</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Focus Indicators</Label>
                    <p className="text-sm text-muted-foreground">Show clear focus outlines</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="animations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Animation Settings</CardTitle>
              <CardDescription>Control animation behavior</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Animations</Label>
                    <p className="text-sm text-muted-foreground">Show smooth transitions</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Page Transitions</Label>
                    <p className="text-sm text-muted-foreground">Animate between pages</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Loading Animations</Label>
                    <p className="text-sm text-muted-foreground">Show loading spinners</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Hover Effects</Label>
                    <p className="text-sm text-muted-foreground">Interactive hover states</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div>
                  <Label>Animation Speed</Label>
                  <RadioGroup defaultValue="normal" className="mt-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="slow" id="slow" />
                      <Label htmlFor="slow">Slow</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="normal" id="normal" />
                      <Label htmlFor="normal">Normal</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="fast" id="fast" />
                      <Label htmlFor="fast">Fast</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleSaveSettings} disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </DashboardPageLayout>
  );
}
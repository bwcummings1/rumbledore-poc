'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Trophy, 
  Shield, 
  Download, 
  MousePointer, 
  Send, 
  CheckCircle,
  Info,
  TestTube,
  ExternalLink 
} from 'lucide-react';

export function ESPNSetup() {
  const [activeTab, setActiveTab] = useState('demo');

  return (
    <div className="container max-w-4xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <div className="size-20 bg-primary rounded-full flex items-center justify-center">
            <Trophy className="size-10 text-primary-foreground" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome to Rumbledore</h1>
        <p className="text-lg text-muted-foreground">
          Let's get you connected to your fantasy football leagues
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="demo">
            <TestTube className="mr-2 h-4 w-4" />
            Try Demo Mode
          </TabsTrigger>
          <TabsTrigger value="espn">
            <Shield className="mr-2 h-4 w-4" />
            Connect ESPN
          </TabsTrigger>
        </TabsList>

        <TabsContent value="demo" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Explore with Demo Data</CardTitle>
              <CardDescription>
                Test all features with sample leagues before connecting your ESPN account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Demo mode includes 2 sample leagues with simulated data so you can explore
                  all features including AI agents, betting system, and statistics.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <h3 className="font-medium">What's included:</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    The Championship League (12 teams)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Dynasty Warriors (10 teams)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Full season statistics
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    AI agents with league context
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Paper betting system
                  </li>
                </ul>
              </div>

              <Button 
                className="w-full" 
                size="lg"
                onClick={() => window.location.href = '/'}
              >
                <TestTube className="mr-2 h-5 w-5" />
                Start with Demo Mode
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="espn" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Connect Your ESPN League</CardTitle>
              <CardDescription>
                Use our browser extension to securely capture your ESPN cookies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Your ESPN password is never stored. We only capture session cookies
                  that expire naturally after 1 year.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-sm font-bold">1</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium mb-1">Install Browser Extension</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Download and install our Chrome extension for cookie capture
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <a href="/browser-extension" target="_blank">
                        <Download className="mr-2 h-4 w-4" />
                        Download Extension
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-sm font-bold">2</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium mb-1">Log into ESPN Fantasy</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Navigate to your fantasy league on ESPN
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <a href="https://fantasy.espn.com" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Go to ESPN Fantasy
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-sm font-bold">3</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium mb-1">Capture Cookies</h3>
                    <p className="text-sm text-muted-foreground">
                      Click the extension icon and press "Capture ESPN Cookies"
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-sm font-bold">4</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium mb-1">Send to Rumbledore</h3>
                    <p className="text-sm text-muted-foreground">
                      Enter your League ID and click "Send to Rumbledore"
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-medium mb-2">Need help?</h3>
                <p className="text-sm text-muted-foreground">
                  Check out our{' '}
                  <a href="/docs/espn-setup" className="text-primary hover:underline">
                    detailed setup guide
                  </a>{' '}
                  or start with demo mode to explore the platform first.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
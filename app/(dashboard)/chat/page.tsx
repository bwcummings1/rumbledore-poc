'use client';

import DashboardPageLayout from '@/components/dashboard/layout';
import { AgentChatEnhanced } from '@/components/chat/agent-chat-enhanced';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import { MessageSquare, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLeagueContext } from '@/contexts/league-context';
import { Badge } from '@/components/ui/badge';

export default function ChatPage() {
  const { currentLeague } = useLeagueContext();

  return (
    <DashboardPageLayout
      header={{
        title: 'AI Assistant',
        description: currentLeague 
          ? `Chat with AI agents about ${currentLeague.name}`
          : 'Select a league to start chatting',
        icon: MessageSquare,
        actions: <LeagueSwitcher />,
      }}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AgentChatEnhanced />
        </div>
        
        <div className="space-y-4">
          {/* Agent Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Available Agents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">Commissioner</span>
                    <Badge variant="outline" className="text-xs">Authority</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Official rulings, dispute resolution, league management
                  </p>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">Analyst</span>
                    <Badge variant="outline" className="text-xs">Data</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Statistics, trends, performance analysis
                  </p>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">Narrator</span>
                    <Badge variant="outline" className="text-xs">Storytelling</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Epic narratives, dramatic recaps
                  </p>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">Trash Talker</span>
                    <Badge variant="outline" className="text-xs">Humor</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Roasts, memes, friendly banter
                  </p>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">Betting Advisor</span>
                    <Badge variant="outline" className="text-xs">Strategy</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Odds analysis, betting strategies
                  </p>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">Historian</span>
                    <Badge variant="outline" className="text-xs">Memory</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    League history, past records
                  </p>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">Oracle</span>
                    <Badge variant="outline" className="text-xs">Predictions</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Future predictions, upset detection
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tips Card */}
          <Card>
            <CardHeader>
              <CardTitle>Pro Tips</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Use "/" to see available commands</li>
                <li>• Each agent has unique expertise</li>
                <li>• Agents remember your conversation</li>
                <li>• Try multi-agent discussions</li>
                <li>• Ask for specific analysis or predictions</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardPageLayout>
  );
}
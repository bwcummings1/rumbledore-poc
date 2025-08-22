'use client';

import DashboardPageLayout from "@/components/dashboard/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Bot, Sparkles, Brain, TrendingUp, DollarSign, Trophy, History, Eye } from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from 'sonner';
import { useState } from 'react';

const agents = [
  {
    name: 'Commissioner',
    description: 'League authority for rules and disputes',
    icon: Trophy,
    temperature: 0.6,
    traits: ['Authoritative', 'Fair', 'Knowledgeable'],
    specialties: ['Rules clarification', 'Dispute resolution', 'League management'],
  },
  {
    name: 'Analyst',
    description: 'Statistical insights and performance metrics',
    icon: TrendingUp,
    temperature: 0.4,
    traits: ['Analytical', 'Data-driven', 'Precise'],
    specialties: ['Player analysis', 'Trend identification', 'Statistical predictions'],
  },
  {
    name: 'Narrator',
    description: 'Epic storytelling and dramatic commentary',
    icon: Sparkles,
    temperature: 0.8,
    traits: ['Creative', 'Dramatic', 'Engaging'],
    specialties: ['Match recaps', 'Season narratives', 'Player stories'],
  },
  {
    name: 'Trash Talker',
    description: 'Humor and friendly roasting',
    icon: MessageSquare,
    temperature: 0.9,
    traits: ['Funny', 'Bold', 'Entertaining'],
    specialties: ['Roasts', 'Memes', 'League banter'],
  },
  {
    name: 'Betting Advisor',
    description: 'Strategic betting recommendations',
    icon: DollarSign,
    temperature: 0.3,
    traits: ['Strategic', 'Calculated', 'Risk-aware'],
    specialties: ['Odds analysis', 'Bankroll management', 'Value identification'],
  },
  {
    name: 'League Historian',
    description: 'Historical context and records',
    icon: History,
    temperature: 0.5,
    traits: ['Knowledgeable', 'Detail-oriented', 'Nostalgic'],
    specialties: ['Historical comparisons', 'Record tracking', 'Legacy analysis'],
  },
  {
    name: 'Oracle',
    description: 'Predictions and forecasting',
    icon: Eye,
    temperature: 0.6,
    traits: ['Predictive', 'Insightful', 'Mysterious'],
    specialties: ['Game predictions', 'Upset detection', 'Season forecasting'],
  },
];

export default function AIAssistantsPage() {
  const [selectedAgent, setSelectedAgent] = useState(agents[0]);
  const [temperature, setTemperature] = useState([0.6]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSaveSettings = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast.success('AI Assistant preferences saved');
    setIsLoading(false);
  };

  return (
    <DashboardPageLayout
      header={{
        title: "AI Assistants",
        description: "Configure and manage AI chat agents",
        icon: Bot,
      }}
    >
      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agents">Available Agents</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="multi-chat">Multi-Chat View</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => {
              const Icon = agent.icon;
              return (
                <Card 
                  key={agent.name} 
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    selectedAgent.name === agent.name ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedAgent(agent)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <Icon className="h-8 w-8 text-primary" />
                      <Badge variant="outline">Active</Badge>
                    </div>
                    <CardTitle>{agent.name}</CardTitle>
                    <CardDescription>{agent.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Traits</p>
                      <div className="flex flex-wrap gap-1">
                        {agent.traits.map((trait) => (
                          <Badge key={trait} variant="secondary" className="text-xs">
                            {trait}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Specialties</p>
                      <ul className="text-xs space-y-1">
                        {agent.specialties.map((specialty) => (
                          <li key={specialty} className="flex items-center gap-1">
                            <span className="w-1 h-1 bg-muted-foreground rounded-full" />
                            {specialty}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Temperature</span>
                        <span className="font-mono">{agent.temperature}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Global AI Settings</CardTitle>
              <CardDescription>Configure AI assistant behavior</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable AI Assistants</Label>
                    <p className="text-sm text-muted-foreground">Allow AI agents in chat</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-Suggestions</Label>
                    <p className="text-sm text-muted-foreground">Proactive agent responses</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Multi-Agent Collaboration</Label>
                    <p className="text-sm text-muted-foreground">Allow agents to work together</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Streaming Responses</Label>
                    <p className="text-sm text-muted-foreground">Show responses as they generate</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Response Settings</CardTitle>
              <CardDescription>Fine-tune agent responses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>Response Creativity (Temperature)</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Current: {temperature[0]} - {temperature[0] < 0.3 ? 'Very Focused' : temperature[0] < 0.7 ? 'Balanced' : 'Creative'}
                </p>
                <Slider
                  value={temperature}
                  onValueChange={setTemperature}
                  min={0}
                  max={1}
                  step={0.1}
                  className="w-full"
                />
              </div>

              <div>
                <Label>Response Length</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <Button variant="outline" size="sm">Concise</Button>
                  <Button variant="default" size="sm">Normal</Button>
                  <Button variant="outline" size="sm">Detailed</Button>
                </div>
              </div>

              <div>
                <Label>Default Agents</Label>
                <p className="text-sm text-muted-foreground mb-2">Select your preferred agents</p>
                <div className="space-y-2">
                  {agents.slice(0, 4).map((agent) => (
                    <label key={agent.name} className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked />
                      <span className="text-sm">{agent.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversations">
          <Card>
            <CardHeader>
              <CardTitle>Conversation History</CardTitle>
              <CardDescription>Your recent AI assistant interactions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { agent: 'Analyst', topic: 'Week 10 player recommendations', time: '2 hours ago' },
                  { agent: 'Betting Advisor', topic: 'Sunday slate analysis', time: '1 day ago' },
                  { agent: 'Commissioner', topic: 'Trade deadline rules', time: '3 days ago' },
                  { agent: 'Trash Talker', topic: 'Roast my opponent', time: '1 week ago' },
                ].map((conv, i) => (
                  <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{conv.agent}</p>
                        <p className="text-xs text-muted-foreground">{conv.topic}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{conv.time}</p>
                      <Button variant="ghost" size="sm">View</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="multi-chat">
          <Card>
            <CardHeader>
              <CardTitle>Multi-Chat View</CardTitle>
              <CardDescription>Talk to multiple agents simultaneously</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Open multiple chat windows to interact with different AI agents at the same time. 
                Perfect for getting diverse perspectives on your league decisions.
              </p>
              
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-dashed">
                  <CardContent className="p-6 text-center">
                    <Bot className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium mb-2">Chat Window 1</p>
                    <Button variant="outline" size="sm">Open Analyst</Button>
                  </CardContent>
                </Card>
                
                <Card className="border-dashed">
                  <CardContent className="p-6 text-center">
                    <Bot className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium mb-2">Chat Window 2</p>
                    <Button variant="outline" size="sm">Open Betting Advisor</Button>
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-center pt-4">
                <Button>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Launch Multi-Chat Mode
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleSaveSettings} disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save AI Settings'}
        </Button>
      </div>
    </DashboardPageLayout>
  );
}
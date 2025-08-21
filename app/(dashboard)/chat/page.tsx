"use client";

import DashboardPageLayout from "@/components/dashboard/layout";
import { AgentChat } from "@/components/chat/agent-chat";
import { AgentSelector } from "@/components/ai/agent-selector";
import CuteRobotIcon from "@/components/icons/cute-robot";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ChatPage() {
  return (
    <DashboardPageLayout
      header={{
        title: "AI Agent Chat",
        description: "Chat with your league's AI agents",
        icon: CuteRobotIcon,
      }}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="h-[600px]">
            <CardHeader>
              <CardTitle>Chat</CardTitle>
              <CardDescription>
                Ask questions, get analysis, or just have fun with the AI agents
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[500px]">
              <AgentChat />
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Select Agent</CardTitle>
              <CardDescription>
                Choose an AI agent to chat with
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentSelector />
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardPageLayout>
  );
}
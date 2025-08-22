import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MobileHeader } from "@/components/dashboard/mobile-header";
import { MobileNav } from "@/components/navigation/mobile-nav";
import { OfflineIndicator } from "@/components/offline-indicator";
import type { Metadata } from "next";
import ChatWindow from "@/components/chat/chat-window";
import { MobileChat } from "@/components/chat/mobile-chat";

export const metadata: Metadata = {
  title: "Rumbledore - Fantasy Football Platform",
  description: "AI-powered fantasy football with paper betting and real-time insights",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider>
      {/* Offline Indicator */}
      <OfflineIndicator />

      {/* Mobile Header - only visible on mobile */}
      <MobileHeader />

      {/* Desktop Layout with three columns */}
      <div className="w-full h-screen flex relative">
        {/* Left Sidebar - Desktop Only */}
        <aside className="hidden lg:flex lg:flex-shrink-0 lg:w-64 bg-sidebar border-r border-border">
          <DashboardSidebar />
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 overflow-y-auto pb-16 lg:pb-0 bg-background">
          {children}
        </main>

        {/* Right Sidebar for Chat & Activity - Desktop Only */}
        <aside className="hidden lg:block lg:flex-shrink-0 lg:w-80 bg-muted/20 border-l border-border">
          <div className="h-full flex flex-col">
            <div className="p-4 border-b bg-muted/50">
              <h3 className="font-semibold text-lg">Chat & Activity</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {/* Activity Feed */}
              <div className="space-y-4">
                <div className="rounded-lg border p-3 bg-card">
                  <p className="text-sm font-medium mb-2">Recent Activity</p>
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      • League sync completed
                    </div>
                    <div className="text-xs text-muted-foreground">
                      • New content generated
                    </div>
                    <div className="text-xs text-muted-foreground">
                      • Trade processed
                    </div>
                  </div>
                </div>
                
                <div className="rounded-lg border p-3 bg-card">
                  <p className="text-sm font-medium mb-2">League Chat</p>
                  <p className="text-xs text-muted-foreground">
                    No new messages
                  </p>
                </div>
                
                <div className="rounded-lg border p-3 bg-card">
                  <p className="text-sm font-medium mb-2">AI Agents</p>
                  <p className="text-xs text-muted-foreground">
                    Click the chat button to interact with AI agents
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Desktop Chat Window - Bottom Right Corner Floating */}
      <ChatWindow />

      {/* Mobile Bottom Navigation - only visible on mobile */}
      <MobileNav />

      {/* Mobile Chat - floating CTA with drawer */}
      <MobileChat />
    </SidebarProvider>
  );
}

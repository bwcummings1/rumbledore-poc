import Notifications from "@/components/dashboard/notifications";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MobileHeader } from "@/components/dashboard/mobile-header";
import { MobileNav } from "@/components/navigation/mobile-nav";
import { OfflineIndicator } from "@/components/offline-indicator";
import type { Metadata } from "next";
import Chat from "@/components/chat";
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

      {/* Desktop Layout */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-gap lg:px-sides pb-16 lg:pb-0">
        <div className="hidden lg:block col-span-2 top-0 relative">
          <DashboardSidebar />
        </div>
        <div className="col-span-1 lg:col-span-10">{children}</div>
      </div>

      {/* Mobile Bottom Navigation - only visible on mobile */}
      <MobileNav />

      {/* Mobile Chat - floating CTA with drawer */}
      <MobileChat />
    </SidebarProvider>
  );
}

import Notifications from "@/components/dashboard/notifications";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import Widget from "@/components/dashboard/widget";
import { MobileHeader } from "@/components/dashboard/mobile-header";
import mockDataJson from "@/mock.json";
import type { MockData } from "@/types/dashboard";
import type { Metadata } from "next";
import Chat from "@/components/chat";
import { MobileChat } from "@/components/chat/mobile-chat";

const mockData = mockDataJson as MockData;

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Dashboard for Rebels",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider>
      {/* Mobile Header - only visible on mobile */}
      <MobileHeader mockData={mockData} />

      {/* Desktop Layout */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-gap lg:px-sides">
        <div className="hidden lg:block col-span-2 top-0 relative">
          <DashboardSidebar />
        </div>
        <div className="col-span-1 lg:col-span-7">{children}</div>
        <div className="col-span-3 hidden lg:block">
          <div className="space-y-gap py-sides min-h-screen max-h-screen sticky top-0 overflow-clip">
            <Widget widgetData={mockData.widgetData} />
            <Notifications initialNotifications={mockData.notifications} />
            <Chat />
          </div>
        </div>
      </div>

      {/* Mobile Chat - floating CTA with drawer */}
      <MobileChat />
    </SidebarProvider>
  );
}

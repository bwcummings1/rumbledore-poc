"use client"

import type * as React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import BracketsIcon from "@/components/icons/brackets"
import AtomIcon from "@/components/icons/atom"
import ProcessorIcon from "@/components/icons/proccesor"
import CuteRobotIcon from "@/components/icons/cute-robot"
import EmailIcon from "@/components/icons/email"
import GearIcon from "@/components/icons/gear"
import MonkeyIcon from "@/components/icons/monkey"
import DotsVerticalIcon from "@/components/icons/dots-vertical"
import { Bullet } from "@/components/ui/bullet"
import LockIcon from "@/components/icons/lock"
import Image from "next/image"

const data = {
  navMain: [
    {
      title: "",
      items: [
        {
          title: "Overview",
          url: "/dashboard",
          icon: MonkeyIcon,
          isActive: true,
        },
      ],
    },
    {
      title: "League Portals",
      items: [
        {
          title: "My Leagues",
          url: "/dashboard/my-leagues",
          icon: BracketsIcon,
          isActive: false,
        },
        {
          title: "League Browser",
          url: "/dashboard/league-browser",
          icon: AtomIcon,
          isActive: false,
        },
        {
          title: "Create League",
          url: "/dashboard/create-league",
          icon: ProcessorIcon,
          isActive: false,
        },
      ],
    },
    {
      title: "League History",
      items: [
        {
          title: "Season Archives",
          url: "/dashboard/season-archives",
          icon: BracketsIcon,
          isActive: false,
        },
        {
          title: "Championship History",
          url: "/dashboard/championship-history",
          icon: CuteRobotIcon,
          isActive: false,
        },
        {
          title: "Trade History",
          url: "/dashboard/trade-history",
          icon: EmailIcon,
          isActive: false,
        },
      ],
    },
    {
      title: "Rumble",
      items: [
        {
          title: "Spread Betting",
          url: "/dashboard/spread-betting",
          icon: AtomIcon,
          isActive: false,
        },
        {
          title: "Over/Under",
          url: "/dashboard/over-under",
          icon: ProcessorIcon,
          isActive: false,
        },
        {
          title: "Player Props",
          url: "/dashboard/player-props",
          icon: CuteRobotIcon,
          isActive: false,
        },
        {
          title: "Parlays",
          url: "/dashboard/parlays",
          icon: EmailIcon,
          isActive: false,
        },
        {
          title: "Live Betting",
          url: "/dashboard/live-betting",
          icon: BracketsIcon,
          isActive: false,
        },
      ],
    },
    {
      title: "Wizkit",
      items: [
        {
          title: "Account Connections",
          url: "/dashboard/account-connections",
          icon: GearIcon,
          isActive: false,
        },
        {
          title: "ESPN Integration",
          url: "/dashboard/espn-integration",
          icon: AtomIcon,
          isActive: false,
        },
        {
          title: "Yahoo! Sports",
          url: "/dashboard/yahoo-sports",
          icon: ProcessorIcon,
          isActive: false,
        },
        {
          title: "Sleeper Integration",
          url: "/dashboard/sleeper-integration",
          icon: CuteRobotIcon,
          isActive: false,
        },
        {
          title: "Profile Settings",
          url: "/dashboard/profile-settings",
          icon: GearIcon,
          isActive: false,
        },
        {
          title: "Preferences",
          url: "/dashboard/preferences",
          icon: EmailIcon,
          isActive: false,
        },
      ],
    },
  ],
  desktop: {
    title: "Desktop (Online)",
    status: "online",
  },
  user: {
    name: "KRIMSON",
    email: "krimson@joyco.studio",
    avatar: "/avatars/user_krimson.png",
  },
}

export function DashboardSidebar({ className, ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props} className={cn("py-sides", className)}>
      <SidebarHeader className="rounded-t-lg flex gap-3 flex-row rounded-b-none">
        <div className="flex overflow-clip size-12 shrink-0 items-center justify-center rounded bg-sidebar-primary-foreground/10 transition-colors group-hover:bg-sidebar-primary text-sidebar-primary-foreground">
          <MonkeyIcon className="size-10 group-hover:scale-[1.7] origin-top-left transition-transform" />
        </div>
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="text-2xl font-display">Rumbledore</span>
          <span className="text-xs uppercase">Pro Dashboard</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {data.navMain.map((group, i) => (
          <SidebarGroup className={cn(i === 0 && "rounded-t-none")} key={`${group.title}-${i}`}>
            {group.title && (
              <SidebarGroupLabel>
                <Bullet className="mr-2" />
                {group.title}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem
                    key={item.title}
                    className={cn(item.locked && "pointer-events-none opacity-50")}
                    data-disabled={item.locked}
                  >
                    <SidebarMenuButton
                      asChild={!item.locked}
                      isActive={item.isActive}
                      disabled={item.locked}
                      className={cn("disabled:cursor-not-allowed", item.locked && "pointer-events-none")}
                    >
                      {item.locked ? (
                        <div className="flex items-center gap-3 w-full">
                          <item.icon className="size-5" />
                          <span>{item.title}</span>
                        </div>
                      ) : (
                        <a href={item.url}>
                          <item.icon className="size-5" />
                          <span>{item.title}</span>
                        </a>
                      )}
                    </SidebarMenuButton>
                    {item.locked && (
                      <SidebarMenuBadge>
                        <LockIcon className="size-5 block" />
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-0">
        <SidebarGroup>
          <SidebarGroupLabel>
            <Bullet className="mr-2" />
            User
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Popover>
                  <PopoverTrigger className="flex gap-0.5 w-full group cursor-pointer">
                    <div className="shrink-0 flex size-14 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground overflow-clip">
                      <Image
                        src={data.user.avatar || "/placeholder.svg"}
                        alt={data.user.name}
                        width={120}
                        height={120}
                      />
                    </div>
                    <div className="group/item pl-3 pr-1.5 pt-2 pb-1.5 flex-1 flex bg-sidebar-accent hover:bg-sidebar-accent-active/75 items-center rounded group-data-[state=open]:bg-sidebar-accent-active group-data-[state=open]:hover:bg-sidebar-accent-active group-data-[state=open]:text-sidebar-accent-foreground">
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate text-xl font-display">{data.user.name}</span>
                        <span className="truncate text-xs uppercase opacity-50 group-hover/item:opacity-100">
                          {data.user.email}
                        </span>
                      </div>
                      <DotsVerticalIcon className="ml-auto size-4" />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-0" side="bottom" align="end" sideOffset={4}>
                    <div className="flex flex-col">
                      <button className="flex items-center px-4 py-2 text-sm hover:bg-accent">
                        <MonkeyIcon className="mr-2 h-4 w-4" />
                        Account
                      </button>
                      <button className="flex items-center px-4 py-2 text-sm hover:bg-accent">
                        <GearIcon className="mr-2 h-4 w-4" />
                        Settings
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

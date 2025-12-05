"use client"

import * as React from "react"
import { Database, Search, FileText, Settings, Sparkles, Moon, Sun, Languages, HelpCircle } from "lucide-react"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    SidebarSeparator,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
    activeTab: string
    setActiveTab: (tab: string) => void
    isDarkMode: boolean
    toggleDarkMode: () => void
}

export function AppSidebar({
    activeTab,
    setActiveTab,
    isDarkMode,
    toggleDarkMode,
    ...props
}: AppSidebarProps) {
    return (
        <Sidebar {...props} className="border-r border-border/50 bg-sidebar/50 backdrop-blur-xl">
            <SidebarHeader className="p-4">
                <div className="flex items-center gap-3 px-2">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                        <Database className="h-6 w-6" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-lg tracking-tight">DocuFind</span>
                        <span className="text-xs text-muted-foreground">v1.3.0</span>
                    </div>
                </div>
            </SidebarHeader>
            <SidebarSeparator className="mx-4 opacity-50" />
            <SidebarContent className="px-2 py-4">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            isActive={activeTab === "search"}
                            onClick={() => setActiveTab("search")}
                            tooltip="Search"
                            className="h-10 px-4 rounded-lg transition-all duration-200 hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-md"
                        >
                            <Search className="h-4 w-4" />
                            <span className="font-medium">Search</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            isActive={activeTab === "files"}
                            onClick={() => setActiveTab("files")}
                            tooltip="File Library"
                            className="h-10 px-4 rounded-lg transition-all duration-200 hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-md"
                        >
                            <FileText className="h-4 w-4" />
                            <span className="font-medium">File Library</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            isActive={activeTab === "settings"}
                            onClick={() => setActiveTab("settings")}
                            tooltip="Settings"
                            className="h-10 px-4 rounded-lg transition-all duration-200 hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-md"
                        >
                            <Settings className="h-4 w-4" />
                            <span className="font-medium">Settings</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            isActive={activeTab === "help"}
                            onClick={() => setActiveTab("help")}
                            tooltip="Help & About"
                            className="h-10 px-4 rounded-lg transition-all duration-200 hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-md"
                        >
                            <HelpCircle className="h-4 w-4" />
                            <span className="font-medium">Help & About</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarContent>
            <SidebarRail />
        </Sidebar>
    )
}

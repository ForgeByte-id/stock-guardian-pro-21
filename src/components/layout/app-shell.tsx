import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 h-14 flex items-center justify-between border-b bg-background/80 backdrop-blur px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <span className="font-semibold text-sm tracking-tight">Stok Akurat · Rekonsiliasi stok</span>
            </div>
            <UserMenu />
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

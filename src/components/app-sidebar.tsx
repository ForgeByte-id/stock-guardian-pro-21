import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, ShoppingCart, ClipboardList, Undo2, Gift, ClipboardCheck,
  PlusCircle, PackageSearch, Boxes, ScanLine, Settings2, LineChart, Users,
  ShieldCheck, UserCircle,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { OnboardingHelpButton } from "@/components/onboarding/OnboardingHelpButton";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Ringkasan",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Stok",
    items: [
      { title: "Stock Ledger", url: "/movements", icon: ClipboardList },
      { title: "Stock Opname", url: "/reconciliation/opname", icon: ClipboardCheck },
      { title: "Input Manual", url: "/movements/new", icon: PlusCircle },
      { title: "Cek Konsistensi", url: "/reconciliation/daily", icon: ScanLine },
      { title: "Laporan Selisih", url: "/reconciliation/report", icon: LineChart },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { title: "Simulasi Marketplace", url: "/simulation", icon: ShoppingCart },
      { title: "Retur", url: "/returns", icon: Undo2 },
      { title: "Aturan Promo", url: "/promo-rules", icon: Gift },
    ],
  },
  {
    label: "Data",
    items: [
      { title: "Produk & Batch", url: "/products", icon: PackageSearch },
      { title: "Resep Bundle", url: "/products/bundles", icon: Boxes },
      { title: "Channel & Alasan", url: "/products/reference-data", icon: Settings2 },
    ],
  },
  {
    label: "Akun",
    items: [
      { title: "Kelola Pengguna", url: "/users", icon: Users },
      { title: "Profil", url: "/profile", icon: UserCircle },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const active = (u: string) => pathname === u || pathname.startsWith(u + "/");

  const renderGroup = (label: string, items: Item[]) => (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={active(item.url)} tooltip={item.title}>
                <Link to={item.url} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold leading-tight truncate">Stok Akurat</span>
                <span className="text-[10px] text-sidebar-foreground/70 truncate">Rekonsiliasi Stok</span>
              </div>
            )}
          </div>
          {!collapsed && <OnboardingHelpButton />}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {GROUPS.map((g) => renderGroup(g.label, g.items))}
      </SidebarContent>
    </Sidebar>
  );
}

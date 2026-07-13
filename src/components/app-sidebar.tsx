import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, ClipboardList, PlusCircle, ShoppingCart, PackageSearch,
  Boxes, Layers, Settings2, ScanLine, ClipboardCheck, LineChart, Users,
  ShieldCheck, UserCircle,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

const OPERATIONAL: Item[] = [
  { title: "Dashboard Stok", url: "/dashboard", icon: LayoutDashboard },
  { title: "Catat Pergerakan", url: "/movements/new", icon: PlusCircle },
  { title: "Riwayat Jurnal", url: "/movements", icon: ClipboardList },
  { title: "Simulasi Pesanan", url: "/simulation", icon: ShoppingCart },
];

const MASTER: Item[] = [
  { title: "Produk & Batch", url: "/products", icon: PackageSearch },
  { title: "Resep Bundle", url: "/products/bundles", icon: Boxes },
  { title: "Channel & Alasan", url: "/products/reference-data", icon: Settings2 },
];

const RECON: Item[] = [
  { title: "Cek Konsistensi", url: "/reconciliation/daily", icon: ScanLine },
  { title: "Stok Opname", url: "/reconciliation/opname", icon: ClipboardCheck },
  { title: "Laporan Selisih", url: "/reconciliation/report", icon: LineChart },
];

const ACCESS: Item[] = [
  { title: "Kelola Pengguna", url: "/users", icon: Users },
  { title: "Profil", url: "/profile", icon: UserCircle },
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
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">Stok Akurat</span>
              <span className="text-[10px] text-sidebar-foreground/70">Rekonsiliasi Stok</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {renderGroup("Operasional", OPERATIONAL)}
        {renderGroup("Manajemen Produk", MASTER)}
        {renderGroup("Rekonsiliasi", RECON)}
        {renderGroup("Akses & Keamanan", ACCESS)}
      </SidebarContent>
    </Sidebar>
  );
}

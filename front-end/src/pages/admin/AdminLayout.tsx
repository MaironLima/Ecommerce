import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, FileSearch, MessageSquare, Package, ScrollText, ShoppingBag, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useStore } from "@/stores/store";
import { isAdminRole, roleOf } from "@/lib/auth";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: BarChart3, end: true },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/reviews", label: "Reviews", icon: MessageSquare },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
  { to: "/admin/logs", label: "Logs", icon: FileSearch },
];

function AdminLayout() {
  const accessToken = useStore((s) => s.accessToken);
  const location = useLocation();

  if (!accessToken) return null; // the route loader handles anonymous access

  if (!isAdminRole(roleOf(accessToken))) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="global-card-error">403 — You don't have access to the admin area.</div>
      </div>
    );
  }

  return (
    <SidebarProvider className="min-h-0">
      <Sidebar collapsible="none" className="hidden md:flex border-r border-b">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="font-bold">Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map(({ to, label, icon: Icon, end }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton
                      asChild
                      isActive={end ? location.pathname === to : location.pathname.startsWith(to)}
                    >
                      <NavLink to={to} end={end}>
                        <Icon size={16} /> {label}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <nav className="md:hidden flex gap-1 overflow-x-auto border-b border-border p-2" aria-label="Admin sections">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                "flex items-center gap-1 rounded-xl px-3 py-2 text-sm whitespace-nowrap " +
                (isActive ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted")
              }
            >
              <Icon size={14} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col gap-4 p-4 md:p-6 w-full max-w-7xl">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default AdminLayout;

import { Search, CircleUser, ShoppingCart, Bell, LayoutDashboard, Package, User, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ModeToggle } from "./ModeToggle";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useCartStore } from "@/stores/cartStore";
import { useStore } from "@/stores/store";
import { isAdminRole, roleOf } from "@/lib/auth";
import { useLogout } from "@/hooks/use-logout";
import privateAPI from "@/services/api/privateApi";

interface NotificationItem {
  id: string;
  read: boolean;
}

// Icon buttons sit on the primary bar, so they use a translucent white hover instead of the accent color.
const barButton = "relative text-primary-foreground hover:bg-white/15 hover:text-primary-foreground";

function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <Badge
      variant="destructive"
      aria-label={`${count} ${label}`}
      className="absolute -top-1 -right-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px] shadow-none"
    >
      {count > 99 ? "99+" : count}
    </Badge>
  );
}

function Header() {
  const [searchParams] = useSearchParams();
  const [valor, setValor] = useState(searchParams.get("q") ?? "");
  const navigate = useNavigate();
  const logout = useLogout();
  const cartCount = useCartStore((s) => s.items.length);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const { accessToken, appName, name } = useStore();
  const isAdmin = isAdminRole(roleOf(accessToken));

  const { data: unread = 0 } = useQuery({
    queryKey: ["notifications"],
    enabled: !!accessToken,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data } = await privateAPI.get<{ notifications: NotificationItem[] }>("/notifications");
      return data.notifications;
    },
    select: (list) => list.filter((n) => !n.read).length,
  });

  useEffect(() => {
    if (accessToken) void fetchCart();
  }, [accessToken, fetchCart]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = valor.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : "/");
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-primary text-primary-foreground shadow-md">
      {/* Phones: logo + icons on the first row, search full width below. sm and up: one row. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 sm:h-16 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-0">
        <Link to="/" onClick={() => setValor("")} className="flex shrink-0 items-center gap-2" aria-label="Home">
          <img src="/vite.svg" alt="Logo" className="h-9" />
          <span className="text-lg font-bold tracking-tight sm:hidden lg:inline">{appName}</span>
        </Link>

        <form onSubmit={handleSubmit} role="search" className="relative order-last w-full sm:order-none sm:mx-auto sm:w-auto min-w-0 sm:flex-1 sm:max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-70" />
          <Input
            type="search"
            placeholder="Search products..."
            aria-label="Search products"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="h-10 rounded-full border-white/20 bg-white/15 pl-9 text-primary-foreground placeholder:text-primary-foreground/70 focus-visible:bg-white/20 focus-visible:ring-white/60"
          />
        </form>

        <nav className="ml-auto flex shrink-0 items-center gap-0.5 sm:ml-0 sm:gap-1" aria-label="Account">
          <ModeToggle variant="ghost" className={barButton} />

          {accessToken && (
            <Button variant="ghost" size="icon" className={barButton} title="Notifications" aria-label="Notifications" onClick={() => navigate("/profile?tab=notifications")}>
              <Bell />
              <CountBadge count={unread} label="unread notifications" />
            </Button>
          )}

          <Button variant="ghost" size="icon" className={barButton} title="Cart" aria-label="Cart" onClick={() => navigate("/cart")}>
            <ShoppingCart />
            <CountBadge count={cartCount} label="items in cart" />
          </Button>

          {accessToken ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={barButton} title="Account" aria-label="Account menu">
                  <CircleUser />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">{name || "My account"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile?tab=account")}>
                  <User /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/profile?tab=orders")}>
                  <Package /> My orders
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/profile?tab=notifications")}>
                  <Bell /> Notifications
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/admin")}>
                    <LayoutDashboard /> Admin dashboard
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void logout()} className="text-destructive focus:text-destructive">
                  <LogOut /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              className="ml-1 h-9 rounded-xl bg-primary-foreground px-4 font-semibold text-primary shadow-sm hover:bg-primary-foreground/90"
              onClick={() => navigate("/auth/login")}
            >
              <CircleUser /> Sign in
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Header;

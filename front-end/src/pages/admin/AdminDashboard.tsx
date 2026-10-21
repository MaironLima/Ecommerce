import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { DollarSign, FileSearch, Percent, Receipt, ShoppingBag, Users } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import privateAPI from "@/services/api/privateApi";
import { apiError, money } from "@/lib/shared";

interface Analytics {
  summary: {
    revenue: number;
    paidOrders: number;
    totalOrders: number;
    users: number;
    averageOrderValue: number;
    conversionRate: number;
  };
  salesByDay: { date: string; revenue: number; orders: number }[];
  salesByMonth: { month: string; revenue: number; orders: number }[];
  topProducts: { productId: string; title: string; units: number; revenue: number }[];
  lowStock: { variantId: string; productId: string; title: string; attributes: Record<string, string>; stock: number }[];
  revenueByCategory: { category: string; revenue: number }[];
}

// Chart colors come from the theme tokens so light/dark mode stay consistent.
const COLOR = { main: "hsl(var(--chart-3))", soft: "hsl(var(--chart-1))", alt: "hsl(var(--chart-5))" };
const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 12 };
const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 12,
    color: "hsl(var(--popover-foreground))",
  },
  formatter: (v: number) => money(v),
};

function Kpi({ label, value, icon: Icon }: { label: string; value: string; icon: typeof DollarSign }) {
  return (
    <div className="global-card flex items-center gap-3">
      <div className="rounded-xl bg-primary/10 text-primary p-2">
        <Icon size={20} />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-xl font-bold text-foreground truncate">{value}</span>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="global-card flex flex-col gap-3 min-w-0">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="h-64">{children}</div>
    </div>
  );
}

function AdminDashboard() {
  const { data, isLoading, error } = useQuery<Analytics>({
    queryKey: ["admin", "analytics"],
    queryFn: async () => (await privateAPI.get("/admin/analytics")).data,
  });

  if (isLoading) return <div className="global-card animate-pulse text-muted-foreground">Loading analytics...</div>;
  if (error || !data) return <div className="global-card-error">{apiError(error)}</div>;

  const { summary } = data;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="global-title">Dashboard</h1>
        <Link to="/admin/logs" className="global-btn flex items-center gap-2">
          <FileSearch size={16} /> View logs
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi label="Revenue" value={money(summary.revenue)} icon={DollarSign} />
        <Kpi label="Paid orders" value={String(summary.paidOrders)} icon={ShoppingBag} />
        <Kpi label="Avg. order value" value={money(summary.averageOrderValue)} icon={Receipt} />
        <Kpi label="Checkout conversion" value={`${summary.conversionRate}%`} icon={Percent} />
        <Kpi label="Users" value={String(summary.users)} icon={Users} />
      </div>

      <ChartCard title="Sales — last 30 days">
        <ResponsiveContainer>
          <AreaChart data={data.salesByDay}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR.main} stopOpacity={0.4} />
                <stop offset="100%" stopColor={COLOR.main} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} {...axis} />
            <YAxis {...axis} width={50} />
            <Tooltip {...tooltipStyle} />
            <Area type="monotone" dataKey="revenue" name="Revenue" stroke={COLOR.main} fill="url(#rev)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Sales history — by month">
          <ResponsiveContainer>
            <BarChart data={data.salesByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(2)} {...axis} />
              <YAxis {...axis} width={50} />
              <Tooltip {...tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
              <Bar dataKey="revenue" name="Revenue" fill={COLOR.main} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue by category">
          <ResponsiveContainer>
            <BarChart data={data.revenueByCategory} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" {...axis} />
              <YAxis type="category" dataKey="category" {...axis} width={80} className="capitalize" />
              <Tooltip {...tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
              <Bar dataKey="revenue" name="Revenue" fill={COLOR.alt} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="global-card flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Best sellers</h2>
          {data.topProducts.length === 0 && <p className="text-sm text-muted-foreground">No sales yet.</p>}
          <ol className="flex flex-col divide-y divide-border">
            {data.topProducts.map((p, i) => (
              <li key={p.productId} className="py-2 flex items-center gap-3 text-sm">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate capitalize">{p.title}</span>
                <span className="text-muted-foreground whitespace-nowrap">{p.units} sold</span>
                <span className="font-semibold w-24 text-right">{money(p.revenue)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="global-card flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Low stock (≤ 5)</h2>
          {data.lowStock.length === 0 && <p className="text-sm text-muted-foreground">All variants are well stocked.</p>}
          <ul className="flex flex-col divide-y divide-border">
            {data.lowStock.map((v) => (
              <li key={v.variantId} className="py-2 flex items-center gap-3 text-sm">
                <span className="flex-1 min-w-0 truncate capitalize">
                  {v.title}{" "}
                  <span className="text-muted-foreground">
                    · {Object.entries(v.attributes ?? {}).map(([k, val]) => `${k}: ${val}`).join(", ")}
                  </span>
                </span>
                <span className={"shrink-0 text-xs px-2 py-1 rounded-full border " + (v.stock === 0 ? "bg-red-500/15 text-red-600 border-red-500/30" : "bg-amber-500/15 text-amber-600 border-amber-500/30")}>
                  {v.stock === 0 ? "Sold out" : `${v.stock} left`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

export default AdminDashboard;

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquare, Search, Trash2 } from "lucide-react";
import privateAPI from "@/services/api/privateApi";
import StarRating from "@/components/StarRating";
import { useStore } from "@/stores/store";
import { roleOf, userIdOf } from "@/lib/auth";
import {
  ORDER_STATUS_STYLES,
  RETURN_REASONS,
  RETURN_STATUS_STYLES,
  apiError,
  money,
  type OrderStatus,
  type ReturnReason,
  type ReturnStatus,
} from "@/lib/shared";

const th = "p-3 font-medium";
const td = "p-3";

function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="global-card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground border-b border-border">
          <tr>
            {head.map((h) => (
              <th key={h} className={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {children}
          {empty && (
            <tr>
              <td colSpan={head.length} className={td + " text-muted-foreground"}>Nothing here.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const Loading = () => <div className="global-card animate-pulse text-muted-foreground">Loading...</div>;

// ---------- Orders ----------

interface AdminOrder {
  id: string;
  status: OrderStatus;
  total: number;
  created_at: string;
  customer: { name: string; email: string };
  items: { quantity: number; product_title_snapshot: string }[];
  shipping_address: { city: string | null; state: string | null } | null;
}

const STATUSES: OrderStatus[] = ["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"];

export function AdminOrders() {
  const [status, setStatus] = useState("");
  const { data: orders, isLoading, error } = useQuery<AdminOrder[]>({
    queryKey: ["admin", "orders", status],
    queryFn: async () => (await privateAPI.get("/admin/orders", { params: status ? { status } : {} })).data.orders,
  });

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="global-title">Orders</h1>
        <select className="global-input sm:w-48" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      {error && <div className="global-card-error">{apiError(error)}</div>}
      {isLoading ? (
        <Loading />
      ) : (
        <Table head={["Order", "Customer", "Items", "Ship to", "Date", "Total", "Status"]} empty={orders?.length === 0}>
          {orders?.map((o) => (
            <tr key={o.id} className="hover:bg-muted/40">
              <td className={td + " font-mono text-xs"}>#{o.id.slice(0, 8)}</td>
              <td className={td}>
                <div className="flex flex-col">
                  <span>{o.customer.name}</span>
                  <span className="text-xs text-muted-foreground">{o.customer.email}</span>
                </div>
              </td>
              <td className={td + " max-w-64"}>
                <span className="line-clamp-2 capitalize">{o.items.map((i) => `${i.quantity}× ${i.product_title_snapshot}`).join(", ")}</span>
              </td>
              <td className={td + " text-muted-foreground whitespace-nowrap"}>
                {o.shipping_address ? `${o.shipping_address.city ?? ""}/${o.shipping_address.state ?? ""}` : "—"}
              </td>
              <td className={td + " whitespace-nowrap text-muted-foreground"}>{new Date(o.created_at).toLocaleDateString()}</td>
              <td className={td + " whitespace-nowrap font-semibold"}>{money(o.total)}</td>
              <td className={td}>
                <span className={`text-xs px-2 py-1 rounded-full border ${ORDER_STATUS_STYLES[o.status]}`}>{o.status}</span>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

// ---------- Users ----------

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  orders: number;
  created_at: string;
}

export function AdminUsers() {
  const queryClient = useQueryClient();
  const accessToken = useStore((s) => s.accessToken);
  const isSuper = roleOf(accessToken) === "SUPERADMIN";
  const me = userIdOf(accessToken);
  const [search, setSearch] = useState("");

  const { data: users, isLoading, error } = useQuery<AdminUser[]>({
    queryKey: ["admin", "users"],
    queryFn: async () => (await privateAPI.get("/admin/users")).data.users,
  });

  // ponytail: filters the list the API already returns in full; move to a server-side ?q= when users need pagination.
  const term = search.trim().toLowerCase();
  const visible = term ? users?.filter((u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)) : users;

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => privateAPI.patch(`/admin/users/${id}/role`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
    onError: (e) => alert(apiError(e)),
  });

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="global-title">Users</h1>
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            className="global-input pl-9"
            placeholder="Search by name or email"
            aria-label="Search users by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {!isSuper && <p className="text-sm text-muted-foreground">Only a SUPERADMIN can change roles.</p>}
      {error && <div className="global-card-error">{apiError(error)}</div>}
      {isLoading ? (
        <Loading />
      ) : (
        <Table head={["Name", "Email", "Orders", "Joined", "Role"]} empty={visible?.length === 0}>
          {visible?.map((u) => (
            <tr key={u.id} className="hover:bg-muted/40">
              <td className={td}>{u.name}</td>
              <td className={td + " text-muted-foreground"}>{u.email}</td>
              <td className={td}>{u.orders}</td>
              <td className={td + " text-muted-foreground whitespace-nowrap"}>{new Date(u.created_at).toLocaleDateString()}</td>
              <td className={td}>
                {isSuper && u.id !== me ? (
                  <select
                    className="global-input w-36 py-1"
                    aria-label={`Role of ${u.name}`}
                    value={u.role}
                    onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value })}
                  >
                    <option value="CUSTOMER">CUSTOMER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="SUPERADMIN">SUPERADMIN</option>
                  </select>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">{u.role}</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

// ---------- Reviews moderation ----------

interface PendingReview {
  id: string;
  rating: number;
  title: string;
  comment: string | null;
  created_at: string;
  id_sync: { name: string };
  product_sync: { id: string; title: string };
}

export function AdminReviews() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: reviews, isLoading, error } = useQuery<PendingReview[]>({
    queryKey: ["admin", "reviews"],
    queryFn: async () => (await privateAPI.get("/product/reviews")).data.reviews,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
  const approve = useMutation({ mutationFn: (id: string) => privateAPI.put(`/product/${id}/validation/review`), onSuccess: () => void refresh() });
  const remove = useMutation({ mutationFn: (id: string) => privateAPI.delete(`/product/${id}/review`), onSuccess: () => void refresh() });

  return (
    <>
      <h1 className="global-title">Reviews</h1>
      <p className="text-sm text-muted-foreground">Reviews only appear on the store after approval.</p>
      {error && <div className="global-card-error">{apiError(error)}</div>}
      {isLoading && <Loading />}
      {reviews?.length === 0 && (
        <div className="global-card flex flex-col items-center gap-3 text-muted-foreground">
          <MessageSquare size={32} />
          No reviews waiting for moderation.
        </div>
      )}
      {reviews?.map((r) => (
        <div key={r.id} className="global-card flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex flex-col gap-1 min-w-0">
            <button type="button" className="text-left text-sm text-primary hover:underline capitalize" onClick={() => navigate(`/product/${r.product_sync.id}`)}>
              {r.product_sync.title}
            </button>
            <div className="flex items-center gap-2">
              <span className="font-medium">{r.id_sync.name}</span>
              <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
            <StarRating value={r.rating} />
            <p className="font-semibold">{r.title}</p>
            {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
          </div>
          <div className="flex sm:flex-col gap-2 shrink-0">
            <button type="button" className="global-btn flex items-center gap-2" onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>
              <Check size={16} /> Approve
            </button>
            <button
              type="button"
              className="global-btn flex items-center gap-2 bg-destructive hover:bg-destructive/90"
              onClick={() => confirm("Delete this review?") && remove.mutate(r.id)}
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

// ---------- Audit log ----------

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  actor_sync: { name: string; role: string } | null;
}

const describe = (m: Record<string, unknown> | null) =>
  m ? Object.entries(m).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ") : "";

export function AdminAudit() {
  const { data: logs, isLoading, error } = useQuery<AuditEntry[]>({
    queryKey: ["admin", "audit"],
    queryFn: async () => (await privateAPI.get("/admin/audit")).data.logs,
  });

  return (
    <>
      <h1 className="global-title">Audit log</h1>
      {error && <div className="global-card-error">{apiError(error)}</div>}
      {isLoading ? (
        <Loading />
      ) : (
        <Table head={["When", "Who", "Action", "Entity", "Details"]} empty={logs?.length === 0}>
          {logs?.map((l) => (
            <tr key={l.id} className="hover:bg-muted/40">
              <td className={td + " whitespace-nowrap text-muted-foreground"}>{new Date(l.created_at).toLocaleString()}</td>
              <td className={td + " whitespace-nowrap"}>
                {l.actor_sync ? <>{l.actor_sync.name} <span className="text-xs text-muted-foreground">({l.actor_sync.role})</span></> : "system"}
              </td>
              <td className={td}>
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">{l.action}</span>
              </td>
              <td className={td + " text-muted-foreground"}>
                {l.entity_type} {l.entity_id && <span className="font-mono text-xs">#{l.entity_id.slice(0, 8)}</span>}
              </td>
              <td className={td + " text-xs text-muted-foreground max-w-72 truncate"} title={describe(l.metadata)}>{describe(l.metadata) || "—"}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

// ---------- Returns & refunds ----------

interface AdminReturn {
  id: string;
  order_id: string;
  status: ReturnStatus;
  reason: ReturnReason;
  comment: string | null;
  admin_note: string | null;
  refund_amount: number;
  created_at: string;
  customer: { name: string };
  items: { quantity: number; title: string }[];
}

const RETURN_STATUSES: ReturnStatus[] = ["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED", "REJECTED", "CANCELLED"];

// The next step for each status: REQUESTED -> approve (or reject), APPROVED -> received, RECEIVED -> refund.
const NEXT: Partial<Record<ReturnStatus, { path: string; label: string; method: "patch" | "post" }>> = {
  REQUESTED: { path: "approve", label: "Approve", method: "patch" },
  APPROVED: { path: "received", label: "Mark received", method: "patch" },
  RECEIVED: { path: "refund", label: "Refund", method: "post" },
};

export function AdminReturns() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("REQUESTED");
  const { data: returns, isLoading, error } = useQuery<AdminReturn[]>({
    queryKey: ["admin", "returns", status],
    queryFn: async () => (await privateAPI.get("/admin/returns", { params: status ? { status } : {} })).data.returns,
  });

  const act = useMutation({
    mutationFn: ({ id, path, method, body }: { id: string; path: string; method: "patch" | "post"; body?: object }) =>
      privateAPI[method](`/admin/returns/${id}/${path}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "returns"] }),
    onError: (e) => alert(apiError(e)),
  });

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="global-title">Returns</h1>
        <select className="global-input sm:w-48" aria-label="Filter returns by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {RETURN_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <p className="text-sm text-muted-foreground">Stock goes back when an item is marked received. Refunds go to the original card through Stripe.</p>
      {error && <div className="global-card-error">{apiError(error)}</div>}
      {isLoading ? (
        <Loading />
      ) : (
        <Table head={["Order", "Customer", "Items", "Reason", "Requested", "Refund", "Status", "Actions"]} empty={returns?.length === 0}>
          {returns?.map((r) => {
            const next = NEXT[r.status];
            return (
              <tr key={r.id} className="hover:bg-muted/40 align-top">
                <td className={td + " font-mono text-xs"}>#{r.order_id.slice(0, 8)}</td>
                <td className={td + " whitespace-nowrap"}>{r.customer.name}</td>
                <td className={td + " max-w-56"}>
                  <span className="line-clamp-2 capitalize">{r.items.map((i) => `${i.quantity}× ${i.title}`).join(", ")}</span>
                </td>
                <td className={td + " max-w-64"}>
                  <div className="flex flex-col">
                    <span>{RETURN_REASONS[r.reason]}</span>
                    {r.comment && <span className="text-xs text-muted-foreground line-clamp-3">{r.comment}</span>}
                    {r.admin_note && <span className="text-xs text-destructive line-clamp-2">Note: {r.admin_note}</span>}
                  </div>
                </td>
                <td className={td + " whitespace-nowrap text-muted-foreground"}>{new Date(r.created_at).toLocaleDateString()}</td>
                <td className={td + " whitespace-nowrap font-semibold"}>{money(r.refund_amount)}</td>
                <td className={td}>
                  <span className={`text-xs px-2 py-1 rounded-full border ${RETURN_STATUS_STYLES[r.status]}`}>{r.status}</span>
                </td>
                <td className={td}>
                  <div className="flex gap-2 whitespace-nowrap">
                    {next && (
                      <button
                        type="button"
                        className="global-btn py-1 text-xs disabled:opacity-50"
                        disabled={act.isPending}
                        onClick={() =>
                          (next.path !== "refund" || confirm(`Refund ${money(r.refund_amount)} to the customer's card?`)) &&
                          act.mutate({ id: r.id, path: next.path, method: next.method })
                        }
                      >
                        {next.label}
                      </button>
                    )}
                    {r.status === "REQUESTED" && (
                      <button
                        type="button"
                        className="global-btn py-1 text-xs bg-destructive hover:bg-destructive/90 disabled:opacity-50"
                        disabled={act.isPending}
                        onClick={() => {
                          const note = prompt("Why is this return rejected? The customer will see this.");
                          if (note?.trim()) act.mutate({ id: r.id, path: "reject", method: "patch", body: { admin_note: note.trim() } });
                        }}
                      >
                        Reject
                      </button>
                    )}
                    {!next && r.status !== "REQUESTED" && <span className="text-muted-foreground">—</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}

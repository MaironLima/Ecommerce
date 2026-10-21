import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquare, Trash2 } from "lucide-react";
import privateAPI from "@/services/api/privateApi";
import StarRating from "@/components/StarRating";
import { useStore } from "@/stores/store";
import { roleOf, userIdOf } from "@/lib/auth";
import { ORDER_STATUS_STYLES, apiError, money, type OrderStatus } from "@/lib/shared";

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
  shipping_address: { city?: string; state?: string } | null;
}

const STATUSES: OrderStatus[] = ["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED"];

export function AdminOrders() {
  const [status, setStatus] = useState("");
  const { data: orders, isLoading, error } = useQuery<AdminOrder[]>({
    queryKey: ["admin", "orders", status],
    queryFn: async () => (await privateAPI.get("/admin/orders", { params: status ? { status } : {} })).data.orders,
  });

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="global-title">Orders</h1>
        <select className="global-input w-48" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
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

  const { data: users, isLoading, error } = useQuery<AdminUser[]>({
    queryKey: ["admin", "users"],
    queryFn: async () => (await privateAPI.get("/admin/users")).data.users,
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => privateAPI.patch(`/admin/users/${id}/role`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
    onError: (e) => alert(apiError(e)),
  });

  return (
    <>
      <h1 className="global-title">Users</h1>
      {!isSuper && <p className="text-sm text-muted-foreground">Only a SUPERADMIN can change roles.</p>}
      {error && <div className="global-card-error">{apiError(error)}</div>}
      {isLoading ? (
        <Loading />
      ) : (
        <Table head={["Name", "Email", "Orders", "Joined", "Role"]} empty={users?.length === 0}>
          {users?.map((u) => (
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
  actor_sync: { name: string; email: string } | null;
}

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
        <Table head={["When", "Who", "Action", "Entity"]} empty={logs?.length === 0}>
          {logs?.map((l) => (
            <tr key={l.id} className="hover:bg-muted/40">
              <td className={td + " whitespace-nowrap text-muted-foreground"}>{new Date(l.created_at).toLocaleString()}</td>
              <td className={td}>{l.actor_sync?.name ?? "system"}</td>
              <td className={td}>
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">{l.action}</span>
              </td>
              <td className={td + " text-muted-foreground"}>
                {l.entity_type} {l.entity_id && <span className="font-mono text-xs">#{l.entity_id.slice(0, 8)}</span>}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

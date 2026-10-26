import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Package, CreditCard, Loader2, Star, Undo2 } from "lucide-react";
import UniversalBreadcrum from "@/components/UniversalBreadcrum";
import { useStore } from "@/stores/store";
import type { AxiosError } from "axios";
import publicAPI from "@/services/api/publicApi";
import privateAPI from "@/services/api/privateApi";

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

interface OrderItem {
  id: string;
  cart_item_id: string | null;
  variant_id: string;
  quantity: number;
  unit_price_snapshot: number;
  product_title_snapshot: string;
  variant_attributes_snapshot: Record<string, string>;
  product_id: string;
  main_image?: string | null;
}

interface Order {
  id: string;
  status: OrderStatus;
  total: number;
  currency: string;
  created_at: string;
  items: OrderItem[];
  returnable: boolean;
  return_deadline: string;
  remaining: Record<string, number>;
  returns: { id: string; status: ReturnStatus; refund_amount: number; admin_note: string | null; created_at: string }[];
}

// Inline form under the order: pick units per item, a reason and an optional comment.
function ReturnForm({ order, onDone, onCancel }: { order: Order; onDone: () => void; onCancel: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason>("REGRET");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picked = Object.entries(qty).filter(([, q]) => q > 0);
  const total = picked.reduce((sum, [id, q]) => sum + (order.items.find((i) => i.id === id)?.unit_price_snapshot ?? 0) * q, 0);

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border p-3"
      aria-label="Request return"
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        setError(null);
        try {
          await privateAPI.post(`/orders/${order.id}/returns`, {
            items: picked.map(([order_item_id, quantity]) => ({ order_item_id, quantity })),
            reason,
            comment: comment.trim() || undefined,
          });
          onDone();
        } catch (err) {
          setError(apiError(err));
          setSending(false);
        }
      }}
    >
      <span className="text-sm font-semibold">Which items are you returning?</span>
      {order.items.map((item) => {
        const max = order.remaining[item.id] ?? 0;
        return (
          <label key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate capitalize">{item.product_title_snapshot}</span>
            <select
              className="global-input w-24 py-1"
              aria-label={`Units of ${item.product_title_snapshot} to return`}
              value={qty[item.id] ?? 0}
              disabled={max === 0}
              onChange={(e) => setQty({ ...qty, [item.id]: Number(e.target.value) })}
            >
              {Array.from({ length: max + 1 }, (_, n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        );
      })}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Reason</span>
        <select className="global-input" value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)}>
          {Object.entries(RETURN_REASONS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Comment (optional)</span>
        <textarea className="global-input min-h-20" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error && <span className="text-sm text-destructive">{error}</span>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="global-btn disabled:opacity-50" disabled={picked.length === 0 || sending}>
          {sending ? "Sending..." : `Request refund of ${money(total)}`}
        </button>
        <button type="button" className="global-btn bg-secondary text-secondary-foreground" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function OrdersPage({ embedded = false }: { embedded?: boolean }) {
  const accessToken = useStore((s) => s.accessToken);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paidId = searchParams.get("paid");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const refresh = () => setReload((n) => n + 1);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await privateAPI.get<Order[]>("/orders");
        if (cancelled) return;
        setOrders(Array.isArray(data) ? data : []);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        const err = e as AxiosError<{ error?: string }>;
        setError(err?.response?.data?.error ?? "Failed to load orders");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, reload]);

  return (
    <div className={embedded ? "flex flex-col" : "min-h-svh flex flex-col bg-background"}>
      {!embedded && (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 p-4">
          <UniversalBreadcrum labels={[{ label: "Cart", to: "/cart" }, "Orders"]} />
        </div>
      )}
      <div className={embedded ? "flex flex-col gap-4" : "flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pb-6 flex flex-col gap-4"}>
        {paidId && (
          <div className="global-card border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            Payment received — order #{paidId.slice(0, 8)} is now PAID.
          </div>
        )}

        {!accessToken && (
          <div className="global-card-error">
            Please log in to view your orders.
          </div>
        )}
        {accessToken && loading && (
          <div className="global-card text-muted-foreground">
            Loading orders...
          </div>
        )}
        {error && (
          <div className="global-card-error">
            {error}
          </div>
        )}

        {accessToken && !loading && !error && orders.length === 0 && (
          <div className="global-card flex flex-col items-center gap-4">
            <Package size={32} className="text-muted-foreground" />
            <p className="text-muted-foreground">You have no orders yet.</p>
          </div>
        )}

        {accessToken && !loading && !error && orders.length > 0 && (
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
              <div key={order.id} className="global-card flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-foreground">
                      {`Order #${order.id.slice(0, 8)}`}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full border ${ORDER_STATUS_STYLES[order.status] ?? ""}`}
                    >
                      {order.status}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="flex flex-col gap-3 border-t border-border pt-3">
                  {order.items.map((item) => {
                    const title = item.product_title_snapshot;
                    const mainImage = item.main_image ?? undefined;
                    const attrs = item.variant_attributes_snapshot;
                    const attrsLabel = attrs
                      ? Object.entries(attrs)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")
                      : "";
                    return (
                      <div
                        key={item.id}
                        className="flex gap-3 text-sm border-b border-border pb-3"
                      >
                        {mainImage && (
                          <img
                            src={`${publicAPI.defaults.baseURL}/uploads?path=${encodeURIComponent(mainImage)}`}
                            alt={title ?? "product"}
                            className="w-16 h-16 rounded object-cover border border-border shrink-0"
                          />
                        )}
                        <div className="flex flex-col min-w-0 flex-1">
                          {title && (
                            <span className="font-medium text-foreground line-clamp-2 break-words">
                              {title}
                            </span>
                          )}
                          {attrsLabel && (
                            <span className="text-muted-foreground">
                              {attrsLabel}
                            </span>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">
                              quantity: {item.quantity}
                            </span>
                            {(order.status === "PAID" || order.status === "PARTIALLY_REFUNDED") && item.product_id && (
                              <button
                                type="button"
                                className="text-xs text-primary flex items-center gap-1 hover:underline"
                                onClick={() => navigate(`/product/${item.product_id}`)}
                                title="Review this product"
                              >
                                <Star size={12} /> Review
                              </button>
                            )}
                            <span className="text-muted-foreground">
                              $ {(item.unit_price_snapshot * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-xl font-bold text-primary">
                    $ {Number(order.total).toFixed(2)}
                  </span>
                </div>

                {order.returns[0] && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Return:</span>
                    <span className={`text-xs px-2 py-1 rounded-full border ${RETURN_STATUS_STYLES[order.returns[0].status]}`}>
                      {order.returns[0].status}
                    </span>
                    <span className="text-muted-foreground">{money(order.returns[0].refund_amount)}</span>
                    {order.returns[0].admin_note && (
                      <span className="w-full text-xs text-muted-foreground">{order.returns[0].admin_note}</span>
                    )}
                    {order.returns[0].status === "REQUESTED" && (
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline"
                        onClick={async () => {
                          try {
                            await privateAPI.post(`/returns/${order.returns[0]!.id}/cancel`);
                            refresh();
                          } catch (e) {
                            setError(apiError(e));
                          }
                        }}
                      >
                        Cancel request
                      </button>
                    )}
                  </div>
                )}

                {order.returnable && returningId !== order.id && (
                  <button
                    type="button"
                    className="global-btn bg-secondary text-secondary-foreground flex items-center gap-2 w-fit"
                    onClick={() => setReturningId(order.id)}
                  >
                    <Undo2 size={16} /> Request return
                    <span className="text-xs opacity-70">until {new Date(order.return_deadline).toLocaleDateString()}</span>
                  </button>
                )}
                {returningId === order.id && (
                  <ReturnForm
                    order={order}
                    onCancel={() => setReturningId(null)}
                    onDone={() => {
                      setReturningId(null);
                      refresh();
                    }}
                  />
                )}

                {order.status === "PENDING" && (
                  <button
                    className="global-btn flex items-center justify-center gap-2 w-fit disabled:opacity-50"
                    disabled={resumingId === order.id}
                    onClick={async () => {
                      setResumingId(order.id);
                      try {
                        const { data } = await privateAPI.post<{ cart_item_ids: string[] }>(
                          `/orders/${order.id}/resume`,
                        );
                        navigate("/checkout", { state: { cartItemIds: data.cart_item_ids } });
                      } catch (e) {
                        const err = e as AxiosError<{ error?: string }>;
                        setResumingId(null);
                        setError(
                          err?.response?.data?.error ??
                            "Failed to resume checkout. Please try again.",
                        );
                      }
                    }}
                    title="Resume checkout for this order"
                  >
                    {resumingId === order.id ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Resuming...
                      </>
                    ) : (
                      <>
                        <CreditCard size={16} /> Resume checkout
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!embedded && (
          <button
            className="global-btn bg-secondary text-secondary-foreground flex items-center justify-center gap-2 w-fit"
            onClick={() => (window.history.length > 1 ? history.back() : undefined)}
            title="Back"
          >
            <ArrowLeft size={16} /> Back
          </button>
        )}
      </div>
    </div>
  );
}

export default OrdersPage;
import { useEffect, useState } from "react";
import { Plus, Minus, Trash2, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import UniversalBreadcrum from "@/components/UniversalBreadcrum";
import { useCartStore } from "@/stores/cartStore";
import { useStore } from "@/stores/store";
import publicAPI from "@/services/api/publicApi";

interface ProductInfo {
  title?: string;
  main_image?: string;
}

function CartPage() {
  const navigate = useNavigate();
  const accessToken = useStore((s) => s.accessToken);
  const {
    items,
    loading,
    error,
    fetchCart,
    updateItem,
    removeItem,
  } = useCartStore();

  const [unchecked, setUnchecked] = useState<Record<string, boolean>>({});
  const [productInfo, setProductInfo] = useState<Record<string, ProductInfo>>({});

  useEffect(() => {
    if (accessToken) void fetchCart();
  }, [accessToken, fetchCart]);

  useEffect(() => {
    if (items.length === 0) return;
    void (async () => {
      const info: Record<string, ProductInfo> = {};
      const productIds = Array.from(
        new Set(
          items
            .map((i) => i.variant_sync?.product_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const results = await Promise.all(
        productIds.map(async (pid): Promise<readonly [string, ProductInfo]> => {
          try {
            const res = await publicAPI.get(`/products/${pid}`);
            const result = res.data?.result ?? res.data;
            return [
              pid,
              {
                title: (result?.title as string | undefined) ?? undefined,
                main_image: (result?.main_image as string | undefined) ?? undefined,
              },
            ];
          } catch {
            return [pid, {}];
          }
        }),
      );
      for (const [pid, p] of results) {
        if (p.title || p.main_image) info[pid as string] = p;
      }
      setProductInfo(info);
    })();
  }, [items]);

  const isChecked = (id: string) => !unchecked[id];
  const total = items
    .filter((i) => isChecked(i.id))
    .reduce((sum, i) => sum + i.unit_price_snapshot * i.quantity, 0);
  const checkedCount = items.filter((i) => isChecked(i.id)).length;
  const allChecked = items.length > 0 && items.every((i) => isChecked(i.id));

  const toggleAll = () => {
    const nextChecked = !allChecked;
    setUnchecked(() => {
      const next: Record<string, boolean> = {};
      for (const i of items) next[i.id] = !nextChecked;
      return next;
    });
  };

  const toggleOne = (id: string) =>
    setUnchecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleCheckout = () => {
    const selectedIds = items.filter((i) => isChecked(i.id)).map((i) => i.id);
    if (selectedIds.length === 0) return;
    navigate("/checkout", { state: { cartItemIds: selectedIds } });
  };

  if (!accessToken) {
    return (
      <div className="min-h-svh flex flex-col bg-background">
        
        <div className="flex-1 flex items-center justify-center">
          <div className="global-card-error">
            Please log in to view your cart.
          </div>
        </div>
      </div>
    );
  }

  if (loading && items.length === 0) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        
        <div className="global-card text-muted-foreground">
          Loading cart...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-svh flex flex-col bg-background">
        
        <div className="flex-1 flex items-center justify-center">
          <div className="global-card-error">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-svh flex flex-col bg-background">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <UniversalBreadcrum labels={["Cart"]} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="global-card flex flex-col items-center gap-4">
            <p className="text-muted-foreground">Your cart is empty.</p>
            <button
              className="global-btn"
              onClick={() => navigate("/")}
              title="Continue shopping"
            >
              Continue shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh flex flex-col bg-background">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 p-4">
        <UniversalBreadcrum labels={[{ label: "Cart", to: "/" }, "Choose Products"]} />
      </div>
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pb-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="global-card flex items-center gap-3">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="w-4 h-4 accent-primary"
              title="Select all"
            />
            <span className="text-sm text-muted-foreground">
              {allChecked ? "Deselect all" : "Select all"}
            </span>
          </div>

          {items.map((item) => {
            const pid = item.variant_sync?.product_id;
            const info = pid ? productInfo[pid] : undefined;
            const title = info?.title;
            const mainImage = info?.main_image;
            const attrs = item.variant_sync.attributes;
            const attrsLabel = attrs
              ? Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(" · ")
              : "";
            const itemChecked = isChecked(item.id);
            return (
              <div key={item.id} className="global-card flex flex-wrap items-center gap-3">
                <input
                  type="checkbox"
                  checked={itemChecked}
                  onChange={() => toggleOne(item.id)}
                  className="w-5 h-5 accent-primary shrink-0"
                  title="Select item"
                />

                {mainImage && (
                  <img
                    src={`${publicAPI.defaults.baseURL}/uploads?path=${encodeURIComponent(mainImage)}`}
                    alt={title ?? "product"}
                    className="w-16 h-16 rounded object-cover border border-border shrink-0"
                  />
                )}

                <div className="flex flex-col min-w-0 flex-1 gap-1 text-sm">
                  {title && (
                    <span
                      className="font-medium text-foreground line-clamp-2 break-words"
                      title={title}
                    >
                      {title}
                    </span>
                  )}
                  {attrsLabel && (
                    <span className="text-muted-foreground">{attrsLabel}</span>
                  )}
                  <span className="text-foreground font-medium">
                    $ {item.unit_price_snapshot.toFixed(2)}
                  </span>
                  <p
                    className={
                      "text-xs " +
                      (item.variant_sync.stock <= 5
                        ? "text-destructive"
                        : "text-muted-foreground")
                    }
                  >
                    Stock: {item.variant_sync.stock}
                  </p>
                </div>

                <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:shrink-0">
                  <div className="inline-flex items-center bg-muted border border-border rounded-full  gap-2 w-fit">
                    <button
                      className="global-btn bg-secondary text-secondary-foreground rounded-full w-8 h-8 flex items-center justify-center p-0 disabled:opacity-50"
                      onClick={() =>
                        updateItem(item.id, Math.max(1, item.quantity - 1))
                      }
                      disabled={item.quantity <= 1}
                      title="Decrease quantity"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="min-w-[2rem] text-center text-foreground font-semibold px-2">
                      {item.quantity}
                    </span>
                    <button
                      className="global-btn bg-secondary text-secondary-foreground rounded-full w-8 h-8 flex items-center justify-center p-0"
                      onClick={() => updateItem(item.id, item.quantity + 1)}
                      title="Increase quantity"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <button
                    className="global-btn bg-destructive text-destructive-foreground rounded-full w-8 h-8 flex items-center justify-center p-0"
                    onClick={() => removeItem(item.id)}
                    title="Remove from cart"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="global-card flex flex-col gap-4 sticky top-4">
          <h2 className="global-title text-2xl">Summary</h2>
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span>
              {checkedCount} of {items.length} item(s) selected
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="text-2xl font-bold text-primary">
              $ {total.toFixed(2)}
            </span>
          </div>
          <button
            className="global-btn flex items-center justify-center gap-2 disabled:opacity-50"
            onClick={handleCheckout}
            disabled={checkedCount === 0}
            title="Proceed to checkout"
          >
            Checkout
          </button>
          <button
            className="global-btn bg-secondary text-secondary-foreground flex items-center justify-center gap-2"
            onClick={() => navigate("/orders")}
            title="View your orders"
          >
            <Package size={16} /> My orders
          </button>
          <button
            className="global-btn bg-secondary text-secondary-foreground flex items-center justify-center gap-2"
            onClick={() => navigate("/")}
            title="Continue shopping"
          >
            Back to Shopping
          </button>
        </div>
      </div>
    </div>
  );
}

export default CartPage;
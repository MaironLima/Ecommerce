import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { ArrowLeft, Loader2, MapPin } from "lucide-react";
import UniversalBreadcrum from "@/components/UniversalBreadcrum";
import privateAPI from "@/services/api/privateApi";
import { getStripe } from "@/services/api/stripe";
import { useCartStore } from "@/stores/cartStore";
import { useStore } from "@/stores/store";
import { formatAddress, type Address } from "@/lib/shared";

interface CheckoutSessionResponse {
  order_id: string;
  client_secret: string;
  order_status: string;
  total: number | string;
  currency: string;
}

interface OrderStatusResponse {
  id: string;
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
  total: number | string;
  currency: string;
}

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 60000;

function CheckoutForm({
  orderId,
  total,
  onSessionStale,
}: {
  orderId: string;
  total: number;
  onSessionStale: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const pollOrderStatus = async () => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const { data } = await privateAPI.get<OrderStatusResponse>(
          `/checkout/${orderId}/status`,
        );
        if (data.status === "PAID") {
          navigate(`/orders?paid=${orderId}`);
          return;
        }
        if (data.status === "FAILED" || data.status === "CANCELLED") {
          setMessage(
            `Payment ${data.status.toLowerCase()}. Please try again or contact support.`,
          );
          setSubmitting(false);
          return;
        }
      } catch {
        // ignore transient errors and keep polling
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    setMessage(
      "Payment is taking longer than expected. Check your orders page shortly.",
    );
    setSubmitting(false);
  };

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => {
      if (!ready) setLoadError(true);
    }, 8000);
    return () => clearTimeout(t);
  }, [ready]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stripe || !elements || !ready) {
      setMessage("Payment form is still loading. Please wait a moment.");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error) {
      setMessage(error.message ?? "Payment failed");
      setSubmitting(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === "succeeded") {
      try {
        const { data } = await privateAPI.post<OrderStatusResponse>(
          `/checkout/${orderId}/confirm`,
        );
        if (data.status === "PAID") {
          navigate(`/orders?paid=${orderId}`);
          return;
        }
      } catch {
        // fall back to polling if the confirm call fails
      }
      await pollOrderStatus();
    } else if (paymentIntent && paymentIntent.status === "processing") {
      setMessage("Payment is still processing. Redirecting...");
      await pollOrderStatus();
    } else if (paymentIntent && paymentIntent.status === "requires_action") {
      setMessage("Additional authentication required. Please retry with the same card.");
      setSubmitting(false);
      onSessionStale();
    } else if (paymentIntent) {
      setMessage(
        `Payment status: ${paymentIntent.status}. You can check your orders page.`,
      );
      setSubmitting(false);
      onSessionStale();
    }
  };

  if (loadError) {
    return (
      <div className="flex flex-col gap-3 items-center text-center">
        <p className="text-sm text-destructive" role="alert">
          The payment form failed to load. Refreshing your checkout session...
        </p>
        <button
          type="button"
          className="global-btn flex items-center justify-center gap-2"
          onClick={onSessionStale}
        >
          <Loader2 size={16} className="animate-spin" /> Try again
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement onReady={() => setReady(true)} />
      <button
        type="submit"
        disabled={!stripe || !ready || submitting}
        className="global-btn flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Processing...
          </>
        ) : (
          `Pay $${total.toFixed(2)}`
        )}
      </button>
      {message && (
        <p
          className={
            "text-sm " +
            (message.toLowerCase().includes("succeed")
              ? "text-primary"
              : "text-destructive")
          }
          role="alert"
        >
          {message}
        </p>
      )}
    </form>
  );
}

function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const accessToken = useStore((s) => s.accessToken);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const clearLocal = useCartStore((s) => s.clearLocal);

  const cartItemIds = (location.state as { cartItemIds?: string[] } | null)?.cartItemIds;
  const [addressId, setAddressId] = useState<string | null>(null);

  const { data: addresses, isLoading: loadingAddresses } = useQuery<Address[]>({
    queryKey: ["addresses"],
    enabled: !!accessToken,
    queryFn: async () => (await privateAPI.get("/users/me/addresses")).data.addresses,
  });
  const address = addresses?.find((a) => a.id === addressId) ?? addresses?.[0] ?? null;

  const { data: session, isLoading, error, refetch } = useQuery<CheckoutSessionResponse>({
    queryKey: ["checkout-session", accessToken, cartItemIds, address?.id],
    enabled: !!accessToken && !!address,
    queryFn: async () => {
      await fetchCart();
      const cartNow = useCartStore.getState().items;
      if (cartNow.length === 0) {
        throw new Error("Your cart is empty.");
      }
      if (cartItemIds && cartItemIds.length === 0) {
        throw new Error("No items selected. Please select items to checkout.");
      }
      const validIds = cartItemIds
        ? cartItemIds.filter((id) => cartNow.some((i) => i.id === id))
        : null;
      if (cartItemIds && validIds && validIds.length === 0) {
        throw new Error("Selected items are no longer in your cart.");
      }
      const { data } = await privateAPI.post<CheckoutSessionResponse>(
        "/checkout/session",
        {
          currency: "usd",
          ...(address ? { shipping_address: address } : {}),
          ...(validIds ? { cart_item_ids: validIds } : {}),
        },
      );
      return data;
    },
    retry: false,
  });

  const stripePromise = useMemo(() => getStripe(), []);
  const total = session ? Number(session.total) : 0;
  const currency = session?.currency ?? "usd";
  const options = session?.client_secret
    ? { clientSecret: session.client_secret, locale: "en" as const }
    : null;

  const axiosErr = error as AxiosError<{ error?: string; code?: string }> | null;
  const errorCode = axiosErr?.response?.data?.code ?? axiosErr?.response?.data?.error;

  // Already-paid cart → redirect to orders instead of showing an inline error.
  useEffect(() => {
    if (errorCode === "ORDER_ALREADY_PAID") {
      navigate("/orders");
    }
  }, [errorCode, navigate]);

  const errorMessage =
    !accessToken
      ? "Please log in to checkout."
      : axiosErr?.response?.data?.error ?? error?.message ??
        "Failed to start checkout. Please retry.";

  if (accessToken && !loadingAddresses && !address) {
    return (
      <div className="min-h-svh flex flex-col bg-background">
        <div className="w-full max-w-7xl mx-auto px-6 pt-4">
          <UniversalBreadcrum labels={[{ label: "Cart", to: "/cart" }, "Checkout"]} />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <div className="global-card flex flex-col items-center gap-3 text-center">
            <MapPin size={32} className="text-muted-foreground" />
            <p className="text-muted-foreground">Add a shipping address before paying.</p>
            <button className="global-btn" onClick={() => navigate("/profile?tab=addresses")}>
              Add address
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || loadingAddresses) {
    return (
      <div className="min-h-svh flex flex-col bg-background">
        <div className="flex-1 flex items-center justify-center">
          <div className="global-card animate-pulse text-muted-foreground">
            Preparing checkout...
          </div>
        </div>
      </div>
    );
  }

  if (error || !session || !options) {
    return (
      <div className="min-h-svh flex flex-col bg-background">
        <div className="w-full max-w-7xl mx-auto px-6 pt-4">
          <UniversalBreadcrum labels={["Checkout"]} />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="global-card-error">
            {errorMessage}
          </div>
          <button
            className="global-btn bg-secondary text-secondary-foreground flex items-center gap-2"
            onClick={() => {
              clearLocal();
              navigate("/cart");
            }}
          >
            <ArrowLeft size={16} /> Back to cart
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh flex flex-col bg-background">
      <div className="w-full max-w-7xl mx-auto px-6 pt-4">
        <UniversalBreadcrum labels={[{ label: "Cart", to: "/cart" }, "Checkout"]} />
      </div>
      <div className="flex-1 w-full max-w-3xl mx-auto px-6 pb-6 grid grid-cols-1 gap-6 items-start">
        <div className="global-card flex flex-col gap-4">
          <h1 className="global-title">Checkout</h1>
          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-muted-foreground">Order</span>
            <span className="text-sm text-foreground">
              #{session.order_id.slice(0, 8)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="text-2xl font-bold text-primary">
              ${total.toFixed(2)} {currency.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="global-card flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <MapPin size={16} /> Ship to
          </h2>
          {addresses && addresses.length > 1 ? (
            <select
              className="global-input"
              aria-label="Shipping address"
              value={address?.id}
              onChange={(e) => setAddressId(e.target.value)}
            >
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {formatAddress(a)}
                </option>
              ))}
            </select>
          ) : (
            address && (
              <p className="text-sm text-foreground">
                <span className="font-medium">{address.label}</span> — {formatAddress(address)}
              </p>
            )
          )}
        </div>

        <div className="global-card">
          <Elements
            key={session.client_secret}
            stripe={stripePromise}
            options={options}
          >
            <CheckoutForm
              orderId={session.order_id}
              total={total}
              onSessionStale={refetch}
            />
          </Elements>
        </div>

        <button
          className="global-btn bg-secondary text-secondary-foreground flex items-center justify-center gap-2"
          onClick={() => navigate("/cart")}
        >
          <ArrowLeft size={16} /> Back to cart
        </button>
      </div>
    </div>
  );
}

export default CheckoutPage;
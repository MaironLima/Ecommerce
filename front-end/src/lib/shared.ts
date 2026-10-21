import type { AxiosError } from "axios";
import publicAPI from "@/services/api/publicApi";

export type OrderStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  PAID: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  FAILED: "bg-red-500/15 text-red-600 border-red-500/30",
  CANCELLED: "bg-gray-500/15 text-gray-600 border-gray-500/30",
  REFUNDED: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

export interface Address {
  id: string;
  label: string;
  street: string;
  number: string;
  complement: string | null;
  district: string | null;
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

export const formatAddress = (a: Address) =>
  `${a.street}, ${a.number}${a.complement ? ` - ${a.complement}` : ""} · ${a.city}/${a.state} · ${a.zip_code}`;

export const apiError = (e: unknown) =>
  (e as AxiosError<{ error?: string }>)?.response?.data?.error ?? (e as Error)?.message ?? "Something went wrong";

export const imageUrl = (path: string) => `${publicAPI.defaults.baseURL}/uploads?path=${encodeURIComponent(path)}`;

export const money = (n: number | string) => `$ ${Number(n).toFixed(2)}`;

// "color=black, size=M" <-> { color: "black", size: "M" }
export const parseAttrs = (text: string) =>
  Object.fromEntries(
    text
      .split(",")
      .map((pair) => pair.split("=").map((s) => s.trim()))
      .filter(([k, v]) => k && v),
  );
export const formatAttrs = (attrs: Record<string, string> | null) =>
  Object.entries(attrs ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

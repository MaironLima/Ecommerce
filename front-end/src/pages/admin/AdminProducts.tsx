import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import privateAPI from "@/services/api/privateApi";
import publicAPI from "@/services/api/publicApi";
import { apiError, formatAttrs, imageUrl, money, parseAttrs } from "@/lib/shared";

interface ProductRow {
  id: string;
  title: string;
  description: string;
  base_price: string | number;
  main_image: string;
}

interface Variant {
  id: string;
  attributes: Record<string, string> | null;
  stock: number;
  priceOverride: string | number | null;
}

const PAGE_SIZE = 20;

const multipart = { headers: { "Content-Type": "multipart/form-data" } };

function AdminProducts() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);

  const { data: products = [], isLoading } = useQuery<ProductRow[]>({
    queryKey: ["admin", "products", page],
    queryFn: async () =>
      (await publicAPI.get("/products", { params: { sort: "most recent", category: "all", page } })).data.results,
  });

  const remove = useMutation({
    mutationFn: (id: string) => privateAPI.delete(`/products/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "products"] }),
    onError: (e) => alert(apiError(e)),
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="global-title">Products</h1>
        <button type="button" className="global-btn flex items-center gap-2" onClick={() => setEditing("new")}>
          <Plus size={16} /> New product
        </button>
      </div>

      {editing && <ProductForm product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      <div className="global-card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b border-border">
            <tr>
              <th className="p-3 font-medium">Product</th>
              <th className="p-3 font-medium">Price</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td colSpan={3} className="p-3 text-muted-foreground animate-pulse">Loading...</td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-muted/40">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <img src={imageUrl(p.main_image)} crossOrigin="anonymous" alt="" className="w-12 h-12 rounded object-cover border border-border" />
                    <span className="capitalize line-clamp-2">{p.title}</span>
                  </div>
                </td>
                <td className="p-3 whitespace-nowrap">{money(p.base_price)}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" className="global-btn p-2" title="Edit product" onClick={() => setEditing(p)}>
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="global-btn p-2 bg-destructive hover:bg-destructive/90"
                      title="Delete product"
                      onClick={() => confirm(`Delete "${p.title}"?`) && remove.mutate(p.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button type="button" className="global-btn flex items-center gap-1 disabled:opacity-40" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft size={16} /> Prev
        </button>
        <span className="text-sm text-muted-foreground">Page {page}</span>
        <button type="button" className="global-btn flex items-center gap-1 disabled:opacity-40" disabled={products.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>
          Next <ChevronRight size={16} />
        </button>
      </div>
    </>
  );
}

function ProductForm({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isNew = !product;
  const [fields, setFields] = useState({
    title: product?.title ?? "",
    description: product?.description ?? "",
    basePrice: product ? String(Number(product.base_price)) : "",
    category: "",
    stock: "",
    attributes: "",
  });
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [extraImages, setExtraImages] = useState<FileList | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      Object.entries(fields).forEach(([k, v]) => {
        if (k === "attributes") return;
        if (v !== "") form.append(k, v);
      });
      if (isNew) form.append("attributes", JSON.stringify(parseAttrs(fields.attributes)));
      if (mainImage) form.append("mainImage", mainImage);
      Array.from(extraImages ?? []).forEach((f) => form.append("extraImages", f));
      return isNew ? privateAPI.post("/products", form, multipart) : privateAPI.put(`/products/${product.id}`, form, multipart);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      if (product) void queryClient.invalidateQueries({ queryKey: ["product", product.id] });
      onClose();
    },
  });

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields({ ...fields, [k]: e.target.value });

  return (
    <div className="global-card flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{isNew ? "New product" : "Edit product"}</h2>
        <button type="button" title="Close" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={18} />
        </button>
      </div>
      <form
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Title *" className="sm:col-span-2">
          <input className="global-input" value={fields.title} onChange={set("title")} minLength={3} required />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea className="global-input min-h-24" value={fields.description} onChange={set("description")} maxLength={1800} required={isNew} />
        </Field>
        <Field label="Base price *">
          <input className="global-input" type="number" step="0.01" min="0.01" value={fields.basePrice} onChange={set("basePrice")} required />
        </Field>
        <Field label={isNew ? "Category *" : "Category (leave empty to keep)"}>
          <input className="global-input" value={fields.category} onChange={set("category")} minLength={3} required={isNew} />
        </Field>
        {isNew && (
          <>
            <Field label="Initial stock *">
              <input className="global-input" type="number" min="1" value={fields.stock} onChange={set("stock")} required />
            </Field>
            <Field label="First variant attributes *">
              <input className="global-input" placeholder="color=black, size=M" value={fields.attributes} onChange={set("attributes")} required />
            </Field>
          </>
        )}
        <Field label={isNew ? "Main image *" : "Main image (optional)"}>
          <input className="global-input" type="file" accept="image/*" required={isNew} onChange={(e) => setMainImage(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Extra images (replace gallery)">
          <input className="global-input" type="file" accept="image/*" multiple onChange={(e) => setExtraImages(e.target.files)} />
        </Field>
        {save.isError && <span className="text-sm text-destructive sm:col-span-2">{apiError(save.error)}</span>}
        <button type="submit" className="global-btn w-fit disabled:opacity-50" disabled={save.isPending}>
          {save.isPending ? "Saving..." : "Save product"}
        </button>
      </form>

      {product && <VariantsEditor productId={product.id} />}
    </div>
  );
}

function VariantsEditor({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ attributes: "", stock: "", priceOverride: "" });

  const { data: variants = [] } = useQuery<Variant[]>({
    queryKey: ["variants", productId],
    queryFn: async () => (await publicAPI.get(`/variants/${productId}`)).data.variants,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["variants", productId] });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; stock?: string; priceOverride?: string }) => privateAPI.put(`/variants/${id}`, body),
    onSuccess: () => void refresh(),
    onError: (e) => alert(apiError(e)),
  });

  const add = useMutation({
    mutationFn: () => privateAPI.post(`/variants/${productId}`, { ...draft, attributes: JSON.stringify(parseAttrs(draft.attributes)) }),
    onSuccess: () => {
      setDraft({ attributes: "", stock: "", priceOverride: "" });
      void refresh();
    },
  });

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Variants</h3>
      {variants.map((v) => (
        <div key={v.id} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_140px] gap-2 items-center text-sm">
          <span className="capitalize">{formatAttrs(v.attributes) || "default"}</span>
          <input
            className="global-input"
            type="number"
            min="0"
            aria-label="Stock"
            defaultValue={v.stock}
            onBlur={(e) => e.target.value !== String(v.stock) && update.mutate({ id: v.id, stock: e.target.value })}
          />
          <input
            className="global-input"
            type="number"
            step="0.01"
            min="0.01"
            aria-label="Price"
            defaultValue={v.priceOverride ? Number(v.priceOverride) : ""}
            onBlur={(e) => e.target.value && e.target.value !== String(Number(v.priceOverride)) && update.mutate({ id: v.id, priceOverride: e.target.value })}
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Stock and price save when the field loses focus.</p>
      <form
        className="grid grid-cols-1 sm:grid-cols-[1fr_120px_140px_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <input className="global-input" placeholder="color=red, size=L" value={draft.attributes} required onChange={(e) => setDraft({ ...draft, attributes: e.target.value })} />
        <input className="global-input" type="number" min="1" placeholder="Stock" value={draft.stock} required onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
        <input className="global-input" type="number" step="0.01" min="0.01" placeholder="Price" value={draft.priceOverride} required onChange={(e) => setDraft({ ...draft, priceOverride: e.target.value })} />
        <button type="submit" className="global-btn flex items-center gap-1 disabled:opacity-50" disabled={add.isPending}>
          <Plus size={16} /> Add
        </button>
      </form>
      {add.isError && <span className="text-sm text-destructive">{apiError(add.error)}</span>}
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={"flex flex-col gap-1 text-sm " + className}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export default AdminProducts;

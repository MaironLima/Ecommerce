import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, LogOut, MapPin, Package, Pencil, Plus, Trash2, User } from "lucide-react";
import UniversalBreadcrum from "@/components/UniversalBreadcrum";
import privateAPI from "@/services/api/privateApi";
import { useStore } from "@/stores/store";
import { useLogout } from "@/hooks/use-logout";
import OrdersPage from "./OrdersPage";
import { apiError, formatAddress, type Address } from "@/lib/shared";

const TABS = [
  { id: "orders", label: "Orders", icon: Package },
  { id: "account", label: "Personal data", icon: User },
  { id: "addresses", label: "Addresses", icon: MapPin },
  { id: "notifications", label: "Notifications", icon: Bell },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ProfilePage() {
  const accessToken = useStore((s) => s.accessToken);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === searchParams.get("tab"))?.id ?? "orders") as TabId;

  const logout = useLogout();

  if (!accessToken) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="global-card-error">Please log in to view your profile.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-background">
      <div className="w-full max-w-7xl mx-auto px-6 p-4">
        <UniversalBreadcrum labels={[{ label: "Products", to: "/" }, "Profile"]} />
      </div>
      <div className="w-full max-w-7xl mx-auto px-6 pb-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-start">
        <nav className="global-card p-2 flex md:flex-col gap-1 overflow-x-auto" aria-label="Profile sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSearchParams({ tab: id })}
              aria-current={tab === id ? "page" : undefined}
              className={
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-left transition-colors whitespace-nowrap " +
                (tab === id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground")
              }
            >
              <Icon size={16} /> {label}
            </button>
          ))}
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-destructive hover:bg-destructive/10 md:mt-2 md:border-t md:border-border"
          >
            <LogOut size={16} /> Log out
          </button>
        </nav>

        <section className="min-w-0">
          {tab === "orders" && <OrdersPage embedded />}
          {tab === "account" && <AccountTab />}
          {tab === "addresses" && <AddressesTab />}
          {tab === "notifications" && <NotificationsTab />}
        </section>
      </div>
    </div>
  );
}

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

function AccountTab() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery<Me>({ queryKey: ["me"], queryFn: async () => (await privateAPI.get("/users/me")).data });
  const [name, setName] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const saveName = useMutation({
    mutationFn: async () => (await privateAPI.patch("/users/me", { name })).data,
    onSuccess: (data: Me) => {
      queryClient.setQueryData(["me"], (old: Me | undefined) => (old ? { ...old, name: data.name } : old));
      useStore.getState().setName(data.name);
      setName(null);
    },
  });

  const changePassword = useMutation({
    mutationFn: async () => privateAPI.patch("/users/me/password", { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
    },
  });

  if (!me) return <div className="global-card text-muted-foreground animate-pulse">Loading...</div>;

  return (
    <div className="flex flex-col gap-4">
      <form
        className="global-card flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveName.mutate();
        }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Personal data</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Name</span>
          <input className="global-input" value={name ?? me.name} minLength={3} maxLength={64} required onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Email</span>
          <input className="global-input opacity-70" value={me.email} disabled />
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Role</span>
          <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">{me.role}</span>
          <span className="text-xs text-muted-foreground ml-auto">Member since {new Date(me.created_at).toLocaleDateString()}</span>
        </div>
        {saveName.isError && <span className="text-sm text-destructive">{apiError(saveName.error)}</span>}
        {saveName.isSuccess && <span className="text-sm text-primary">Saved!</span>}
        <button type="submit" className="global-btn w-fit disabled:opacity-50" disabled={name === null || saveName.isPending}>
          Save
        </button>
      </form>

      <form
        className="global-card flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          changePassword.mutate();
        }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Change password</h2>
        <input className="global-input" type="password" placeholder="Current password" aria-label="Current password" autoComplete="current-password" value={currentPassword} required onChange={(e) => setCurrentPassword(e.target.value)} />
        <input className="global-input" type="password" placeholder="New password (min. 6)" aria-label="New password" autoComplete="new-password" value={newPassword} minLength={6} required onChange={(e) => setNewPassword(e.target.value)} />
        {changePassword.isError && <span className="text-sm text-destructive">{apiError(changePassword.error)}</span>}
        {changePassword.isSuccess && <span className="text-sm text-primary">Password changed!</span>}
        <button type="submit" className="global-btn w-fit disabled:opacity-50" disabled={changePassword.isPending}>
          Change password
        </button>
      </form>
    </div>
  );
}

const EMPTY_ADDRESS = { label: "Home", street: "", number: "", complement: "", district: "", city: "", state: "", zip_code: "", country: "BR" };

const ADDRESS_FIELDS: { key: keyof typeof EMPTY_ADDRESS; label: string; required?: boolean; span?: boolean }[] = [
  { key: "label", label: "Label", required: true },
  { key: "zip_code", label: "ZIP code", required: true },
  { key: "street", label: "Street", required: true, span: true },
  { key: "number", label: "Number", required: true },
  { key: "complement", label: "Complement" },
  { key: "district", label: "District" },
  { key: "city", label: "City", required: true },
  { key: "state", label: "State", required: true },
  { key: "country", label: "Country", required: true },
];

function AddressesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_ADDRESS);

  const { data: addresses = [], isLoading } = useQuery<Address[]>({
    queryKey: ["addresses"],
    queryFn: async () => (await privateAPI.get("/users/me/addresses")).data.addresses,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["addresses"] });

  const save = useMutation({
    mutationFn: async () => {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ""));
      return editing === "new"
        ? privateAPI.post("/users/me/addresses", body)
        : privateAPI.put(`/users/me/addresses/${editing}`, body);
    },
    onSuccess: () => {
      setEditing(null);
      void refresh();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => privateAPI.delete(`/users/me/addresses/${id}`),
    onSuccess: () => void refresh(),
  });

  const startEdit = (a?: Address) => {
    setEditing(a ? a.id : "new");
    setForm(a ? { ...EMPTY_ADDRESS, ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v ?? ""])) } : EMPTY_ADDRESS);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="global-card flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Addresses</h2>
        <button type="button" className="global-btn flex items-center gap-2" onClick={() => startEdit()}>
          <Plus size={16} /> Add address
        </button>
      </div>

      {editing && (
        <form
          className="global-card grid grid-cols-1 sm:grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {ADDRESS_FIELDS.map(({ key, label, required, span }) => (
            <label key={key} className={"flex flex-col gap-1 text-sm " + (span ? "sm:col-span-2" : "")}>
              <span className="text-muted-foreground">
                {label}
                {required && " *"}
              </span>
              <input className="global-input" value={form[key]} required={required} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </label>
          ))}
          {save.isError && <span className="text-sm text-destructive sm:col-span-2">{apiError(save.error)}</span>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="global-btn disabled:opacity-50" disabled={save.isPending}>
              Save address
            </button>
            <button type="button" className="global-btn bg-secondary text-secondary-foreground" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading && <div className="global-card text-muted-foreground animate-pulse">Loading...</div>}
      {!isLoading && addresses.length === 0 && !editing && (
        <div className="global-card flex flex-col items-center gap-3 text-muted-foreground">
          <MapPin size={32} />
          No addresses saved yet.
        </div>
      )}
      {addresses.map((a) => (
        <div key={a.id} className="global-card flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1 text-sm min-w-0">
            <span className="font-semibold text-foreground">{a.label}</span>
            <span className="text-muted-foreground break-words">{formatAddress(a)}</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" className="global-btn p-2" title="Edit address" onClick={() => startEdit(a)}>
              <Pencil size={16} />
            </button>
            <button type="button" className="global-btn p-2 bg-destructive hover:bg-destructive/90" title="Delete address" onClick={() => remove.mutate(a.id)}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

function NotificationsTab() {
  const queryClient = useQueryClient();
  const { data: notifications = [], isLoading } = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: async () => (await privateAPI.get("/notifications")).data.notifications,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const markRead = useMutation({ mutationFn: (id: string) => privateAPI.patch(`/notifications/${id}/read`), onSuccess: () => void refresh() });
  const markAll = useMutation({ mutationFn: () => privateAPI.patch("/notifications/read-all"), onSuccess: () => void refresh() });

  return (
    <div className="flex flex-col gap-4">
      <div className="global-card flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Notifications</h2>
        <button
          type="button"
          className="global-btn flex items-center gap-2 disabled:opacity-50"
          disabled={!notifications.some((n) => !n.read)}
          onClick={() => markAll.mutate()}
        >
          <CheckCheck size={16} /> Mark all as read
        </button>
      </div>
      {isLoading && <div className="global-card text-muted-foreground animate-pulse">Loading...</div>}
      {!isLoading && notifications.length === 0 && (
        <div className="global-card flex flex-col items-center gap-3 text-muted-foreground">
          <Bell size={32} />
          You have no notifications.
        </div>
      )}
      {notifications.map((n) => (
        <div key={n.id} className={"global-card flex items-start justify-between gap-4 " + (n.read ? "opacity-60" : "border-primary/40")}>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-foreground">{n.message}</span>
            <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
          </div>
          {!n.read && (
            <button type="button" className="text-xs text-primary hover:underline shrink-0" onClick={() => markRead.mutate(n.id)}>
              Mark as read
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default ProfilePage;

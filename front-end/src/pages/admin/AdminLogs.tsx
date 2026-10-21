import { Fragment, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RefreshCw, Search, ShieldAlert, X } from "lucide-react";
import privateAPI from "@/services/api/privateApi";
import { useStore } from "@/stores/store";
import { roleOf } from "@/lib/auth";
import { apiError } from "@/lib/shared";

interface LogEntry {
  timestamp?: string;
  level?: string;
  message?: string;
  event?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  uid?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface LogResponse {
  range: { from: string; to: string };
  total: number;
  page: number;
  pages: number;
  entries: LogEntry[];
  facets: { events: { value: string; total: number }[]; levels: { value: string; total: number }[] };
}

const LEVEL_STYLES: Record<string, string> = {
  error: "bg-red-500/15 text-red-600 border-red-500/30",
  warn: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  info: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  http: "bg-gray-500/15 text-gray-600 border-gray-500/30",
};

const FILTER_KEYS = ["source", "from", "to", "level", "event", "status", "method", "requestId", "uid", "q"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

// One-click presets for the most common investigations.
const PRESETS: { label: string; params: Partial<Record<FilterKey, string>> }[] = [
  { label: "Errors", params: { level: "error" } },
  { label: "Server errors (5xx)", params: { status: "5xx" } },
  { label: "Client errors (4xx)", params: { status: "4xx" } },
  { label: "Failed logins", params: { event: "auth.login.failed" } },
  { label: "Access denied", params: { event: "security.forbidden" } },
  { label: "Rate limited", params: { event: "security.rate_limited" } },
  { label: "Payments", params: { q: "order.paid" } },
];

const label = "flex flex-col gap-1 text-xs text-muted-foreground";

function AdminLogs() {
  const [params, setParams] = useSearchParams();
  const isSuper = roleOf(useStore((s) => s.accessToken)) === "SUPERADMIN";
  const [expanded, setExpanded] = useState<number | null>(null);
  // Free-text fields are edited locally and applied on submit, so typing doesn't fire a request per key.
  const [draft, setDraft] = useState({ q: params.get("q") ?? "", requestId: params.get("requestId") ?? "", uid: params.get("uid") ?? "", status: params.get("status") ?? "" });

  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ""]).filter(([, v]) => v)) as Partial<Record<FilterKey, string>>;
  const page = Number(params.get("page") ?? 1);

  const { data, isFetching, error, refetch } = useQuery<LogResponse>({
    queryKey: ["admin", "logs", filters, page],
    queryFn: async () => (await privateAPI.get("/admin/logs", { params: { ...filters, page, limit: 50 } })).data,
    placeholderData: keepPreviousData,
  });

  const apply = (next: Partial<Record<FilterKey | "page", string>>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v);
      else merged.delete(k);
    }
    if (!("page" in next)) merged.delete("page");
    setExpanded(null);
    setParams(merged);
  };

  const clearAll = () => {
    setDraft({ q: "", requestId: "", uid: "", status: "" });
    setExpanded(null);
    setParams({});
  };

  const activeCount = Object.keys(filters).filter((k) => k !== "source").length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="global-title">Logs</h1>
          <p className="text-sm text-muted-foreground">
            Structured logs with personal data masked (LGPD). Click a request id or user to follow it.
          </p>
        </div>
        <button type="button" className="global-btn flex items-center gap-2" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <form
        className="global-card flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <label className={label}>
            Source
            <select className="global-input" value={filters.source ?? "app"} onChange={(e) => apply({ source: e.target.value === "app" ? "" : e.target.value })}>
              <option value="app">Application</option>
              <option value="error">Errors only</option>
              {isSuper && <option value="access">Access (full IP)</option>}
            </select>
          </label>
          <label className={label}>
            From
            <input className="global-input" type="date" value={filters.from ?? data?.range.from ?? ""} onChange={(e) => apply({ from: e.target.value })} />
          </label>
          <label className={label}>
            To
            <input className="global-input" type="date" value={filters.to ?? data?.range.to ?? ""} onChange={(e) => apply({ to: e.target.value })} />
          </label>
          <label className={label}>
            Level
            <select className="global-input" value={filters.level ?? ""} onChange={(e) => apply({ level: e.target.value })}>
              <option value="">All levels</option>
              {(data?.facets.levels ?? []).map((l) => (
                <option key={l.value} value={l.value}>
                  {l.value} ({l.total})
                </option>
              ))}
            </select>
          </label>
          <label className={label + " col-span-2"}>
            Event
            <select className="global-input" value={filters.event ?? ""} onChange={(e) => apply({ event: e.target.value })}>
              <option value="">All events</option>
              {(data?.facets.events ?? []).map((ev) => (
                <option key={ev.value} value={ev.value}>
                  {ev.value} ({ev.total})
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Method
            <select className="global-input" value={filters.method ?? ""} onChange={(e) => apply({ method: e.target.value })}>
              <option value="">Any</option>
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Status
            <input className="global-input" placeholder="404 or 4xx" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} />
          </label>
          <label className={label}>
            Request ID
            <input className="global-input" placeholder="uuid" value={draft.requestId} onChange={(e) => setDraft({ ...draft, requestId: e.target.value })} />
          </label>
          <label className={label}>
            User (pseudonym)
            <input className="global-input" placeholder="u_…" value={draft.uid} onChange={(e) => setDraft({ ...draft, uid: e.target.value })} />
          </label>
          <label className={label + " col-span-2"}>
            Text search
            <input className="global-input" placeholder="path, message, reason…" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="global-btn flex items-center gap-2">
            <Search size={16} /> Search
          </button>
          {activeCount > 0 && (
            <button type="button" className="global-btn flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={clearAll}>
              <X size={16} /> Clear filters ({activeCount})
            </button>
          )}
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="text-xs px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
              onClick={() => {
                setDraft({ q: p.params.q ?? "", requestId: "", uid: "", status: p.params.status ?? "" });
                apply({ level: "", event: "", status: "", q: "", requestId: "", uid: "", method: "", ...p.params });
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </form>

      {filters.source === "access" && (
        <div className="global-card flex items-center gap-2 text-sm border-amber-500/30 bg-amber-500/10">
          <ShieldAlert size={16} className="text-amber-600" />
          The access log keeps full IP addresses (Marco Civil, art. 15). Your consultation is recorded in the audit log.
        </div>
      )}

      {error && <div className="global-card-error">{apiError(error)}</div>}

      {data && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {data.total} {data.total === 1 ? "entry" : "entries"} · {data.range.from} → {data.range.to}
          </span>
          <span>
            Page {data.page} of {data.pages}
          </span>
        </div>
      )}

      <div className="global-card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b border-border">
            <tr>
              <th className="p-3 font-medium">Time</th>
              <th className="p-3 font-medium">Level</th>
              <th className="p-3 font-medium">Event</th>
              <th className="p-3 font-medium">Request</th>
              <th className="p-3 font-medium">User</th>
              <th className="p-3 font-medium">Request ID</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!data && !error && (
              <tr>
                <td colSpan={7} className="p-3 text-muted-foreground animate-pulse">Loading logs...</td>
              </tr>
            )}
            {data?.entries.length === 0 && (
              <tr>
                <td colSpan={7} className="p-3 text-muted-foreground">No log entries match these filters.</td>
              </tr>
            )}
            {data?.entries.map((e, i) => (
              <Fragment key={`${e.timestamp}-${i}`}>
                <tr className="hover:bg-muted/40 align-top">
                  <td className="p-3 whitespace-nowrap text-muted-foreground font-mono text-xs">
                    {e.timestamp ? new Date(e.timestamp).toLocaleString() : "—"}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded-full border ${LEVEL_STYLES[e.level ?? ""] ?? LEVEL_STYLES.http}`}>{e.level}</span>
                  </td>
                  <td className="p-3 max-w-72">
                    <button type="button" className="text-left font-medium hover:text-primary" title="Filter by this event" onClick={() => apply({ event: e.event ?? e.message })}>
                      {e.event ?? e.message}
                    </button>
                    {e.event && e.message !== e.event && <p className="text-xs text-muted-foreground truncate">{e.message}</p>}
                    {typeof e.reason === "string" && <p className="text-xs text-destructive truncate">{e.reason}</p>}
                  </td>
                  <td className="p-3 whitespace-nowrap font-mono text-xs">
                    {e.method && <span className="font-semibold">{e.method} </span>}
                    {e.path && <span>{e.path} </span>}
                    {e.status !== undefined && (
                      <span className={Number(e.status) >= 500 ? "text-red-600" : Number(e.status) >= 400 ? "text-amber-600" : "text-emerald-600"}>{e.status}</span>
                    )}
                    {e.durationMs !== undefined && <span className="text-muted-foreground"> · {e.durationMs}ms</span>}
                  </td>
                  <td className="p-3 font-mono text-xs">
                    {e.uid ? (
                      <button type="button" className="text-primary hover:underline" title="Filter by this user" onClick={() => { setDraft({ ...draft, uid: e.uid! }); apply({ uid: e.uid }); }}>
                        {e.uid}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">anonymous</span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs">
                    {e.requestId && (
                      <button type="button" className="text-primary hover:underline" title="Show everything from this request" onClick={() => { setDraft({ ...draft, requestId: e.requestId! }); apply({ requestId: e.requestId }); }}>
                        {e.requestId.slice(0, 8)}
                      </button>
                    )}
                  </td>
                  <td className="p-3">
                    <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={expanded === i ? "Hide details" : "Show details"} onClick={() => setExpanded(expanded === i ? null : i)}>
                      {expanded === i ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </td>
                </tr>
                {expanded === i && (
                  <tr className="bg-muted/30">
                    <td colSpan={7} className="p-3">
                      <pre className="text-xs whitespace-pre-wrap break-all font-mono">{JSON.stringify(e, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" className="global-btn flex items-center gap-1 disabled:opacity-40" disabled={page <= 1} onClick={() => apply({ page: String(page - 1) })}>
            <ChevronLeft size={16} /> Prev
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {data.pages}
          </span>
          <button type="button" className="global-btn flex items-center gap-1 disabled:opacity-40" disabled={page >= data.pages} onClick={() => apply({ page: String(page + 1) })}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </>
  );
}

export default AdminLogs;

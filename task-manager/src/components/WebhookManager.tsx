"use client";

import { useState, useEffect, useCallback } from "react";

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  deliveryCount: number;
  createdAt: string;
}

interface Delivery {
  id: string;
  event: string;
  statusCode: number | null;
  status: string;
  attempts: number;
  maxAttempts: number;
  deliveredAt: string | null;
  nextRetryAt: string | null;
  createdAt: string;
}

const allEvents = ["task.created", "task.updated", "task.deleted"] as const;

const statusColors: Record<string, string> = {
  delivered: "text-green-500",
  pending: "text-yellow-500",
  failed: "text-red-500",
};

export default function WebhookManager() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([...allEvents]);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch("/api/webhooks");
      if (res.ok) setWebhooks(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/webhooks");
        if (res.ok && !cancelled) setWebhooks(await res.json());
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, events }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create webhook");
      return;
    }

    setUrl("");
    setEvents([...allEvents]);
    setShowForm(false);
    await fetchWebhooks();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this webhook?")) return;
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    if (expandedId === id) setExpandedId(null);
    await fetchWebhooks();
  }

  async function handleToggle(id: string, active: boolean) {
    await fetch(`/api/webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    await fetchWebhooks();
  }

  async function handleExpand(wh: Webhook) {
    if (expandedId === wh.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(wh.id);
    try {
      const res = await fetch(`/api/webhooks/${wh.id}`);
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries || []);
      }
    } catch {
      /* ignore */
    }
  }

  function toggleEvent(event: string) {
    setEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event]
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Webhooks
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {showForm ? "Cancel" : "+ New Webhook"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Payload URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://your-endpoint.com/webhook"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Events
            </label>
            <div className="flex flex-wrap gap-2">
              {allEvents.map((event) => (
                <button
                  key={event}
                  type="button"
                  onClick={() => toggleEvent(event)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    events.includes(event)
                      ? "bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-zinc-300 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
                  }`}
                >
                  {event}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={events.length === 0}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create Webhook
          </button>
        </form>
      )}

      {webhooks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No webhooks registered. Create one to receive HTTP callbacks on task events.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              className={`group rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${
                !wh.active ? "opacity-60" : ""
              }`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => handleExpand(wh)}
                      className="block text-left"
                    >
                      <p className="truncate text-sm font-medium text-zinc-900 hover:text-blue-500 dark:text-zinc-100 dark:hover:text-blue-400">
                        {wh.url}
                      </p>
                    </button>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      {wh.events.map((event) => (
                        <span
                          key={event}
                          className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800"
                        >
                          {event}
                        </span>
                      ))}
                      <span>{wh.deliveryCount} deliveries</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleToggle(wh.id, wh.active)}
                      className="rounded p-1 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
                      title={wh.active ? "Disable" : "Enable"}
                    >
                      {wh.active ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="6 3 20 12 6 21 6 3" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(wh.id)}
                      className="rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      title="Delete"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {expandedId === wh.id && (
                <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800/50">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Recent Deliveries
                  </p>
                  {deliveries.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      No deliveries yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {deliveries.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-medium ${statusColors[d.status] || "text-zinc-400"}`}
                            >
                              {d.status}
                            </span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {d.event}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-zinc-400">
                            {d.statusCode && (
                              <span>HTTP {d.statusCode}</span>
                            )}
                            <span>
                              {d.attempts}/{d.maxAttempts} attempts
                            </span>
                            <span>
                              {new Date(d.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

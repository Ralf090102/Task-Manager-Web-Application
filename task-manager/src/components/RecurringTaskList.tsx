"use client";

import { useState, useEffect, useCallback } from "react";

interface RecurringTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  cron: string;
  nextRun: string;
  lastRun: string | null;
  active: boolean;
  createdAt: string;
}

const cronPresets: Record<string, string> = {
  "Every minute": "* * * * *",
  "Hourly": "0 * * * *",
  "Daily (9 AM)": "0 9 * * *",
  "Weekly (Mon 9 AM)": "0 9 * * 1",
  "Monthly (1st, 9 AM)": "0 9 1 * *",
};

const priorityColors: Record<string, string> = {
  LOW: "text-zinc-400",
  MEDIUM: "text-yellow-500",
  HIGH: "text-red-500",
};

export default function RecurringTaskList() {
  const [recurring, setRecurring] = useState<RecurringTask[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [cron, setCron] = useState("0 9 * * *");
  const [cronPreset, setCronPreset] = useState("Daily (9 AM)");
  const [error, setError] = useState("");

  const fetchRecurring = useCallback(async () => {
    try {
      const res = await fetch("/api/recurring");
      if (res.ok) setRecurring(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/recurring");
        if (res.ok && !cancelled) setRecurring(await res.json());
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, priority, cron }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create recurring task");
      return;
    }

    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setCron("0 9 * * *");
    setCronPreset("Daily (9 AM)");
    setShowForm(false);
    await fetchRecurring();
  }

  async function handleToggle(id: string, active: boolean) {
    await fetch(`/api/recurring/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    await fetchRecurring();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this recurring task?")) return;
    await fetch(`/api/recurring/${id}`, { method: "DELETE" });
    await fetchRecurring();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Recurring Tasks
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {showForm ? "Cancel" : "+ New Recurring Task"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={2}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Schedule
              </label>
              <select
                value={cronPreset}
                onChange={(e) => {
                  setCronPreset(e.target.value);
                  setCron(cronPresets[e.target.value] || "* * * * *");
                }}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {Object.keys(cronPresets).map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
                <option value="custom">Custom cron...</option>
              </select>
            </div>
          </div>

          {cronPreset === "custom" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Cron Expression
              </label>
              <input
                type="text"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="* * * * *"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <p className="mt-1 text-xs text-zinc-400">
                Format: minute hour day-of-month month day-of-week
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create
          </button>
        </form>
      )}

      {recurring.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No recurring tasks yet. Create one to automate task creation on a schedule.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {recurring.map((rt) => (
            <div
              key={rt.id}
              className={`group rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${
                !rt.active ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                    {rt.title}
                  </h3>
                  {rt.description && (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {rt.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                    <span className="font-mono">{rt.cron}</span>
                    <span className={`font-medium ${priorityColors[rt.priority] || ""}`}>
                      {rt.priority}
                    </span>
                    <span>
                      Next:{" "}
                      {rt.active
                        ? new Date(rt.nextRun).toLocaleString()
                        : "Paused"}
                    </span>
                    {rt.lastRun && (
                      <span>
                        Last: {new Date(rt.lastRun).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => handleToggle(rt.id, rt.active)}
                    className="rounded p-1 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
                    title={rt.active ? "Pause" : "Resume"}
                  >
                    {rt.active ? (
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
                    onClick={() => handleDelete(rt.id)}
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
          ))}
        </div>
      )}
    </div>
  );
}

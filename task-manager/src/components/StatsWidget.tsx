"use client";

import { useEffect, useState } from "react";

interface StatsData {
  summary: {
    statusCounts: Record<string, number>;
    completionRate: number;
    totalTasks: number;
    completedTasks: number;
    dailyHistory: { date: string; count: number }[];
  } | null;
  productivity: {
    byPriority: {
      priority: string;
      total: number;
      completed: number;
      rate: number;
    }[];
  } | null;
}

export default function StatsWidget() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          setData(await res.json());
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-400">Loading analytics...</p>
      </div>
    );
  }

  if (error || !data?.summary) {
    return null;
  }

  const { summary, productivity } = data;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Total Tasks
        </p>
        <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {summary.totalTasks}
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Completed
        </p>
        <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
          {summary.completedTasks}
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Completion Rate
        </p>
        <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
          {summary.completionRate}%
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          By Priority
        </p>
        <div className="mt-1 space-y-0.5">
          {productivity?.byPriority.map((p) => (
            <div
              key={p.priority}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-zinc-600 dark:text-zinc-400">
                {p.priority}
              </span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {p.completed}/{p.total}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

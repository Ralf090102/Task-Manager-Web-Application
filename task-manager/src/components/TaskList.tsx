"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import TaskCard from "./TaskCard";
import TaskForm from "./TaskForm";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
}

type FilterStatus = "ALL" | "TODO" | "IN_PROGRESS" | "COMPLETED";

interface TaskListProps {
  initialTasks: Task[];
}

export default function TaskList({ initialTasks }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [live, setLive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Task[] | null>(null);

  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/tasks/search?q=${encodeURIComponent(searchQuery.trim())}`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setSearchResults(data.hits || []);
        }
      } catch {
        /* ignore */
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const refreshRef = useRef(refreshTasks);

  useEffect(() => {
    refreshRef.current = refreshTasks;
  }, [refreshTasks]);

  useEffect(() => {
    let socket: ReturnType<typeof io> | null = null;

    async function connect() {
      try {
        const res = await fetch("/api/ws-token");
        if (!res.ok) return;
        const { token } = await res.json();

        socket = io({ path: "/socket.io/", auth: { token } });

        socket.on("connect", () => setLive(true));
        socket.on("disconnect", () => setLive(false));
        socket.on("task:created", () => refreshRef.current());
        socket.on("task:updated", () => refreshRef.current());
        socket.on("task:deleted", () => refreshRef.current());
      } catch {
        /* real-time is optional */
      }
    }

    connect();

    return () => {
      socket?.disconnect();
    };
  }, []);

  async function handleCreate(data: {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
  }) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create task");
    }

    setShowForm(false);
    await refreshTasks();
  }

  async function handleStatusChange(id: string, status: string) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) throw new Error("Failed to update task");
    await refreshTasks();
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete task");
    await refreshTasks();
  }

  const filteredTasks =
    filter === "ALL" ? tasks : tasks.filter((t) => t.status === filter);

  const statusCounts = {
    ALL: tasks.length,
    TODO: tasks.filter((t) => t.status === "TODO").length,
    IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    COMPLETED: tasks.filter((t) => t.status === "COMPLETED").length,
  };

  const isSearching = searchQuery.trim().length > 0;
  const displayedTasks = isSearching ? (searchResults ?? []) : filteredTasks;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Tasks
          </h2>
          {live && (
            <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Live
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {showForm ? "Cancel" : "+ New Task"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <TaskForm onSubmit={handleCreate} />
        </div>
      )}

      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-9 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
      </div>

      {!searchResults && (
        <div className="flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
          {(
            [
              ["ALL", "All"],
              ["TODO", "To Do"],
              ["IN_PROGRESS", "In Progress"],
              ["COMPLETED", "Completed"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === value
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {label} ({statusCounts[value]})
            </button>
          ))}
        </div>
      )}

      {displayedTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {searchResults
              ? "No search results found."
              : tasks.length === 0
                ? "No tasks yet. Create your first task!"
                : "No tasks match this filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {displayedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

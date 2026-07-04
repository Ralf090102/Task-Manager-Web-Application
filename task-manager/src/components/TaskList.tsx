"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import TaskCard from "./TaskCard";
import TaskForm from "./TaskForm";

interface TaskBoardInfo {
  id: string;
  name: string;
  color: string;
}

interface BoardOption {
  id: string;
  name: string;
  color: string;
  teamName: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  recurringTaskId?: string | null;
  board?: TaskBoardInfo | null;
}

const COLUMNS = [
  {
    key: "TODO",
    label: "To Do",
    accent: "border-t-zinc-400",
    bg: "bg-zinc-50 dark:bg-zinc-900/50",
  },
  {
    key: "IN_PROGRESS",
    label: "In Progress",
    accent: "border-t-blue-500",
    bg: "bg-blue-50/50 dark:bg-blue-950/20",
  },
  {
    key: "COMPLETED",
    label: "Completed",
    accent: "border-t-green-500",
    bg: "bg-green-50/50 dark:bg-green-950/20",
  },
] as const;

interface TaskListProps {
  initialTasks: Task[];
  boards?: BoardOption[];
}

export default function TaskList({ initialTasks, boards = [] }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [showForm, setShowForm] = useState(false);
  const [live, setLive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Task[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

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
    boardId?: string | null;
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
    setExpandedId(null);
    await refreshTasks();
  }

  const isSearching = searchQuery.trim().length > 0;
  const activeTasks = isSearching ? (searchResults ?? []) : tasks;

  const tasksByStatus = (status: string) =>
    activeTasks.filter((t) => t.status === status);

  async function handleDrop(status: string) {
    if (!draggedId) return;
    const task = tasks.find((t) => t.id === draggedId);
    if (!task || task.status === status) {
      setDraggedId(null);
      setDragOverCol(null);
      return;
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === draggedId ? { ...t, status } : t))
    );
    setDraggedId(null);
    setDragOverCol(null);

    try {
      await fetch(`/api/tasks/${draggedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: task.status } : t
        )
      );
    }
    await refreshTasks();
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
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

      {/* New task form */}
      {showForm && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <TaskForm onSubmit={handleCreate} boards={boards} />
        </div>
      )}

      {/* Search bar */}
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

      {/* Kanban board */}
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTasks = tasksByStatus(col.key);
          return (
            <div
              key={col.key}
              className={`flex max-h-[calc(100vh-22rem)] flex-col rounded-lg border-t-2 ${col.accent} ${col.bg} transition-colors ${
                dragOverCol === col.key ? "ring-2 ring-blue-400" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(col.key);
              }}
              onDragLeave={() => {
                if (dragOverCol === col.key) setDragOverCol(null);
              }}
              onDrop={() => handleDrop(col.key)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {col.label}
                </h3>
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {colTasks.length}
                </span>
              </div>

              {/* Scrollable card list */}
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {colTasks.map((task) =>
                  expandedId === task.id ? (
                    <div
                      key={task.id}
                      className="rounded-md border-2 border-blue-400 bg-white dark:bg-zinc-900"
                    >
                      <div className="mb-1 flex items-center justify-between px-2 pt-1.5">
                        <span className="text-xs font-medium text-blue-500">
                          Expanded
                        </span>
                        <button
                          onClick={() => setExpandedId(null)}
                          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                        >
                          Collapse
                        </button>
                      </div>
                      <TaskCard
                        task={task}
                        onStatusChange={handleStatusChange}
                        onDelete={handleDelete}
                      />
                    </div>
                  ) : (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onStatusChange={handleStatusChange}
                      onDelete={handleDelete}
                      compact
                      onExpand={() => setExpandedId(task.id)}
                      draggable
                      onDragStart={() => setDraggedId(task.id)}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDragOverCol(null);
                      }}
                      isDragging={draggedId === task.id}
                    />
                  )
                )}

                {colTasks.length === 0 && (
                  <p className="py-6 text-center text-xs text-zinc-400">
                    {isSearching
                      ? "No results"
                      : "Drop tasks here"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {activeTasks.length === 0 && !isSearching && tasks.length > 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 py-8 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No tasks match this filter.
          </p>
        </div>
      )}
    </div>
  );
}

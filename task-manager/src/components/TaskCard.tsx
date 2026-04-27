"use client";

import { useState } from "react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
}

interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const statusLabels: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};

const statusColors: Record<string, string> = {
  TODO:
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  IN_PROGRESS:
    "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  COMPLETED:
    "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

const priorityColors: Record<string, string> = {
  LOW: "text-zinc-400",
  MEDIUM: "text-yellow-500",
  HIGH: "text-red-500",
};

export default function TaskCard({
  task,
  onStatusChange,
  onDelete,
}: TaskCardProps) {
  const [loading, setLoading] = useState(false);

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setLoading(true);
    try {
      await onStatusChange(task.id, e.target.value);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this task?")) return;
    setLoading(true);
    try {
      await onDelete(task.id);
    } finally {
      setLoading(false);
    }
  }

  const isOverdue =
    task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    task.status !== "COMPLETED";

  return (
    <div className="group rounded-lg border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className={`font-medium text-zinc-900 dark:text-zinc-100 ${
              task.status === "COMPLETED" ? "line-through opacity-60" : ""
            }`}
          >
            {task.title}
          </h3>
          {task.description && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">
              {task.description}
            </p>
          )}
        </div>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="shrink-0 rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 disabled:opacity-0"
          title="Delete task"
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
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={task.status}
          onChange={handleStatusChange}
          disabled={loading}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            statusColors[task.status] || statusColors.TODO
          } border-0 focus:ring-1 focus:ring-zinc-500`}
        >
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <span
          className={`text-xs font-medium ${priorityColors[task.priority] || ""}`}
        >
          {task.priority}
        </span>

        {task.dueDate && (
          <span
            className={`text-xs ${
              isOverdue
                ? "font-medium text-red-500"
                : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {isOverdue && "Overdue: "}
            {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

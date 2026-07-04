"use client";

import { useState } from "react";
import TaskAttachments from "./TaskAttachments";

interface BoardInfo {
  id: string;
  name: string;
  color: string;
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
  board?: BoardInfo | null;
}

interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  compact?: boolean;
  onExpand?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
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

const priorityBadges: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  MEDIUM: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  LOW: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export default function TaskCard({
  task,
  onStatusChange,
  onDelete,
  compact = false,
  onExpand,
  draggable = false,
  onDragStart,
  onDragEnd,
  isDragging = false,
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

  if (compact) {
    return (
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onExpand}
        className={`group cursor-pointer rounded-md border border-zinc-200 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 ${
          isDragging ? "opacity-50" : ""
        } ${task.status === "COMPLETED" ? "opacity-70" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          <h4
            className={`text-sm font-medium text-zinc-900 dark:text-zinc-100 ${
              task.status === "COMPLETED" ? "line-through" : ""
            }`}
          >
            {task.title}
          </h4>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            disabled={loading}
            className="shrink-0 rounded p-0.5 text-zinc-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 disabled:opacity-0"
            title="Delete task"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
        {task.description && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
            {task.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
              priorityBadges[task.priority] || priorityBadges.LOW
            }`}
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
              {isOverdue && "\u26A0 "}
              {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          {task.recurringTaskId && (
            <span className="text-xs text-purple-500 dark:text-purple-400" title="Created from recurring template">
              {"\u21BB"}
            </span>
          )}
          {task.board && (
            <span className="flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: task.board.color }}
              />
              {task.board.name}
            </span>
          )}
        </div>
      </div>
    );
  }

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
          className={`text-xs font-medium ${
            task.priority === "HIGH"
              ? "text-red-500"
              : task.priority === "MEDIUM"
                ? "text-yellow-500"
                : "text-zinc-400"
          }`}
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

        {task.recurringTaskId && (
          <span
            className="flex items-center gap-0.5 text-xs text-purple-500 dark:text-purple-400"
            title="Created from recurring template"
          >
            {"\u21BB"} Recurring
          </span>
        )}

        {task.board && (
          <span className="flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: task.board.color }}
            />
            {task.board.name}
          </span>
        )}
      </div>

      <TaskAttachments taskId={task.id} />
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  dueDate: string | null;
  createdAt: string;
}

interface Board {
  id: string;
  name: string;
  color: string;
  tasks: BoardTask[];
}

const COLUMNS = [
  { key: "TODO", label: "To Do", color: "bg-zinc-100 dark:bg-zinc-800" },
  { key: "IN_PROGRESS", label: "In Progress", color: "bg-blue-50 dark:bg-blue-950/30" },
  { key: "COMPLETED", label: "Completed", color: "bg-green-50 dark:bg-green-950/30" },
] as const;

export default function BoardView({
  board: initialBoard,
  teamId,
  teamName,
  canEdit,
}: {
  board: Board;
  teamId: string;
  teamName: string;
  canEdit: boolean;
}) {
  const [board, setBoard] = useState(initialBoard);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const tasksByStatus = (status: string) =>
    board.tasks.filter((t) => t.status === status);

  const moveTask = useCallback(
    async (taskId: string, newStatus: string) => {
      const task = board.tasks.find((t) => t.id === taskId);
      if (!task || task.status === newStatus) return;

      setBoard((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t
        ),
      }));

      try {
        await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
      } catch {
        setBoard((prev) => ({
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === taskId ? { ...t, status: task.status } : t
          ),
        }));
      }
    },
    [board.tasks]
  );

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/teams/${teamId}`}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {"\u2190"} {teamName}
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: board.color }}
          />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {board.name}
          </h1>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className={`rounded-lg p-3 ${col.color}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (draggedId && canEdit) {
                moveTask(draggedId, col.key);
                setDraggedId(null);
              }
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {col.label}
              </h2>
              <span className="text-xs text-zinc-400">
                {tasksByStatus(col.key).length}
              </span>
            </div>

            <div className="space-y-2">
              {tasksByStatus(col.key).map((task) => (
                <div
                  key={task.id}
                  draggable={canEdit}
                  onDragStart={() => setDraggedId(task.id)}
                  onDragEnd={() => setDraggedId(null)}
                  className={`cursor-grab rounded-md border border-zinc-200 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 ${
                    draggedId === task.id ? "opacity-50" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        task.priority === "HIGH"
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                          : task.priority === "MEDIUM"
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {task.priority}
                    </span>
                    {task.dueDate && (
                      <span className="text-xs text-zinc-400">
                        {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {tasksByStatus(col.key).length === 0 && (
                <p className="py-4 text-center text-xs text-zinc-400">
                  No tasks
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {!canEdit && (
        <p className="mt-4 text-center text-xs text-zinc-400">
          Read-only access (Viewer role)
        </p>
      )}
    </div>
  );
}

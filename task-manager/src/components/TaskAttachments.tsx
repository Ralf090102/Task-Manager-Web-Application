"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface TaskAttachmentsProps {
  taskId: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TaskAttachments({ taskId }: TaskAttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(`/api/attachments?taskId=${taskId}`);
      if (res.ok) {
        setAttachments(await res.json());
      }
    } catch {
      /* ignore */
    }
  }, [taskId]);

  useEffect(() => {
    if (expanded) fetchAttachments();
  }, [expanded, fetchAttachments]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/attachments?taskId=${taskId}`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        await fetchAttachments();
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownload(id: string, filename: string) {
    try {
      const res = await fetch(`/api/attachments/${id}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this attachment?")) return;
    try {
      await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        Attachments{attachments.length > 0 ? ` (${attachments.length})` : ""}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            {uploading ? "Uploading..." : "Upload file"}
          </button>

          {attachments.length > 0 && (
            <div className="space-y-1">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="group flex items-center justify-between rounded-md border border-zinc-200 px-2.5 py-1.5 dark:border-zinc-800"
                >
                  <button
                    onClick={() => handleDownload(att.id, att.filename)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 text-zinc-400"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" x2="12" y1="15" y2="3" />
                    </svg>
                    <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">
                      {att.filename}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {formatSize(att.size)}
                    </span>
                  </button>
                  <button
                    onClick={() => handleDelete(att.id)}
                    className="shrink-0 rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

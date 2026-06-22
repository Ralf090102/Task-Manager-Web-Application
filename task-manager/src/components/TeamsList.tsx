"use client";

import { useState } from "react";
import Link from "next/link";

interface Team {
  id: string;
  name: string;
  slug: string;
  _count: { members: number; boards: number };
}

export default function TeamsList({ initialTeams }: { initialTeams: Team[] }) {
  const [teams, setTeams] = useState(initialTeams);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create team");
      }

      const team = await res.json();
      setTeams((prev) => [
        {
          ...team,
          _count: { members: 1, boards: 0 },
        },
        ...prev,
      ]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Teams
      </h1>

      <form onSubmit={createTeam} className="mb-6 flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New team name..."
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {creating ? "Creating..." : "Create Team"}
        </button>
      </form>

      {error && (
        <p className="mb-4 text-sm text-red-500">{error}</p>
      )}

      {teams.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No teams yet. Create one to start collaborating.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/teams/${team.id}`}
              className="block rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                {team.name}
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {team._count.members} member{team._count.members !== 1 ? "s" : ""}{" "}
                {"\u00B7"} {team._count.boards} board{team._count.boards !== 1 ? "s" : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";

interface TeamMember {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  user: { id: string; name: string | null; email: string; image: string | null };
}

interface TeamBoard {
  id: string;
  name: string;
  color: string;
  _count: { tasks: number };
}

interface Team {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  members: TeamMember[];
  boards: TeamBoard[];
}

export default function TeamDetail({
  team: initialTeam,
  currentUserId,
  currentRole,
}: {
  team: Team;
  currentUserId: string;
  currentRole: string;
}) {
  const [team, setTeam] = useState(initialTeam);
  const [tab, setTab] = useState<"boards" | "members">("boards");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [boardName, setBoardName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAdmin = currentRole === "ADMIN";

  async function createBoard(e: React.FormEvent) {
    e.preventDefault();
    if (!boardName.trim()) return;
    setError(null);

    try {
      const res = await fetch(`/api/teams/${team.id}/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: boardName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }

      const board = await res.json();
      setTeam((prev) => ({
        ...prev,
        boards: [
          ...prev.boards,
          { ...board, _count: { tasks: 0 } },
        ],
      }));
      setBoardName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/teams/${team.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to invite");
      }

      const member = await res.json();
      setTeam((prev) => ({
        ...prev,
        members: [...prev.members, member],
      }));
      setInviteEmail("");
      setSuccess("Member invited successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function updateRole(memberId: string, role: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/teams/${team.id}/members/${memberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }

      const updated = await res.json();
      setTeam((prev) => ({
        ...prev,
        members: prev.members.map((m) =>
          m.id === memberId ? updated : m
        ),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm("Remove this member?")) return;
    setError(null);

    try {
      const res = await fetch(
        `/api/teams/${team.id}/members/${memberId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }

      setTeam((prev) => ({
        ...prev,
        members: prev.members.filter((m) => m.id !== memberId),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link
            href="/teams"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {"\u2190"} Teams
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {team.name}
          </h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
          {success}
        </div>
      )}

      <div className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setTab("boards")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "boards"
              ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          Boards ({team.boards.length})
        </button>
        <button
          onClick={() => setTab("members")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "members"
              ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          Members ({team.members.length})
        </button>
      </div>

      {tab === "boards" && (
        <div>
          <form onSubmit={createBoard} className="mb-4 flex gap-2">
            <input
              type="text"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              placeholder="New board name..."
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <button
              type="submit"
              disabled={!boardName.trim()}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Add Board
            </button>
          </form>

          {team.boards.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No boards yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {team.boards.map((board) => (
                <Link
                  key={board.id}
                  href={`/teams/${team.id}/boards/${board.id}`}
                  className="block rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                >
                  <div className="mb-2 h-2 w-8 rounded-full" style={{ backgroundColor: board.color }} />
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {board.name}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {board._count.tasks} task{board._count.tasks !== 1 ? "s" : ""}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "members" && (
        <div>
          {isAdmin && (
            <form onSubmit={inviteMember} className="mb-4 flex flex-wrap gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="member@example.com"
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
                <option value="VIEWER">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={!inviteEmail.trim()}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Invite
              </button>
            </form>
          )}

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {team.members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                    {(member.user.name || member.user.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {member.user.name || member.user.email}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {member.user.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {member.userId === currentUserId ? (
                    <span className="text-xs text-zinc-400">You</span>
                  ) : isAdmin ? (
                    <>
                      <select
                        value={member.role}
                        onChange={(e) => updateRole(member.id, e.target.value)}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                      <button
                        onClick={() => removeMember(member.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-400">{member.role}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import BoardView from "@/components/BoardView";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id, boardId } = await params;

  const membership = await prisma.member.findUnique({
    where: { teamId_userId: { teamId: id, userId: session.user.id } },
  });

  if (!membership) redirect("/teams");

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      team: { select: { name: true } },
      tasks: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!board || board.teamId !== id) redirect(`/teams/${id}`);

  const serialized = {
    ...board,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
    tasks: board.tasks.map((t) => ({
      ...t,
      dueDate: t.dueDate?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <BoardView
          board={serialized}
          teamId={id}
          teamName={board.team.name}
          canEdit={membership.role !== "VIEWER"}
        />
      </main>
    </>
  );
}

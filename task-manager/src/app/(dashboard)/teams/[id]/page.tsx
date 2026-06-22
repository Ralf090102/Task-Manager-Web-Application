import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import TeamDetail from "@/components/TeamDetail";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const membership = await prisma.member.findUnique({
    where: { teamId_userId: { teamId: id, userId: session.user.id } },
  });

  if (!membership) redirect("/teams");

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      boards: {
        include: { _count: { select: { tasks: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!team) redirect("/teams");

  const serialized = {
    ...team,
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString(),
    members: team.members.map((m) => ({
      ...m,
      joinedAt: m.joinedAt.toISOString(),
    })),
    boards: team.boards.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <TeamDetail
          team={serialized}
          currentUserId={session.user.id}
          currentRole={membership.role}
        />
      </main>
    </>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import TaskList from "@/components/TaskList";
import StatsWidget from "@/components/StatsWidget";
import Greeting from "@/components/Greeting";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [tasks, boards, user] = await Promise.all([
    prisma.task.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: { board: { select: { id: true, name: true, color: true } } },
    }),
    prisma.board.findMany({
      where: { team: { members: { some: { userId: session.user.id } } } },
      include: { team: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { welcomeShown: true },
    }),
  ]);

  const showGreeting = !user?.welcomeShown;

  if (showGreeting) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { welcomeShown: true },
    });
  }

  const serializedTasks = tasks.map((t) => ({
    ...t,
    dueDate: t.dueDate?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  }));

  const serializedBoards = boards.map((b) => ({
    id: b.id,
    name: b.name,
    color: b.color,
    teamName: b.team.name,
  }));

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          {showGreeting && <Greeting name={session.user.name || "User"} />}
          <StatsWidget />
        </div>
        <TaskList initialTasks={serializedTasks} boards={serializedBoards} />
      </main>
    </>
  );
}

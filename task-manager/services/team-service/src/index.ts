import Fastify from "fastify";
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const PORT = parseInt(process.env.PORT || "3002", 10);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || "info" },
});

interface TeamMember {
  userId: string;
  role: string;
  teamId: string;
}

async function getMembership(
  teamId: string,
  userId: string
): Promise<TeamMember | null> {
  const member = await prisma.member.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!member) return null;
  return {
    userId: member.userId,
    role: member.role,
    teamId: member.teamId,
  };
}

async function requireMember(
  teamId: string,
  userId: string
): Promise<TeamMember> {
  const membership = await getMembership(teamId, userId);
  if (!membership) {
    throw { statusCode: 403, message: "Not a team member" };
  }
  return membership;
}

async function requireAdmin(teamId: string, userId: string): Promise<TeamMember> {
  const membership = await requireMember(teamId, userId);
  if (membership.role !== "ADMIN") {
    throw { statusCode: 403, message: "Admin access required" };
  }
  return membership;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

async function createActivity(
  teamId: string,
  userId: string,
  type: string,
  taskId?: string,
  metadata?: unknown
): Promise<void> {
  await prisma.activity.create({
    data: {
      teamId,
      userId,
      type: type as never,
      taskId: taskId ?? null,
      metadata: (metadata as never) ?? undefined,
    },
  });
}

app.get("/health", async () => ({ status: "ok" }));

app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health") return;

  const userId = req.headers["x-user-id"] as string | undefined;
  if (!userId) {
    return reply.status(401).send({ error: "X-User-Id header required" });
  }
  (req as never as { userId: string }).userId = userId;
});

app.setErrorHandler((err, _req, reply) => {
  const statusCode = (err as { statusCode?: number }).statusCode || 500;
  const message =
    statusCode === 500 ? "Internal server error" : err.message || "Error";
  if (statusCode >= 500) {
    app.log.error({ err }, "[team] Server error");
  }
  reply.status(statusCode).send({ error: message });
});

// ============ TEAMS ============

app.post("/teams", async (req) => {
  const userId = (req as never as { userId: string }).userId;
  const { name } = req.body as { name: string };

  if (!name || name.trim().length === 0) {
    throw { statusCode: 400, message: "Team name is required" };
  }

  let slug = generateSlug(name);
  const existing = await prisma.team.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const team = await prisma.team.create({
    data: {
      name: name.trim(),
      slug,
      ownerId: userId,
      members: {
        create: { userId, role: "ADMIN" },
      },
    },
    include: {
      members: { select: { id: true, userId: true, role: true, joinedAt: true } },
      _count: { select: { boards: true } },
    },
  });

  await createActivity(team.id, userId, "MEMBER_JOINED");

  app.log.info({ teamId: team.id, name: team.name }, "[team] Team created");
  return team;
});

app.get("/teams", async (req) => {
  const userId = (req as never as { userId: string }).userId;

  const teams = await prisma.team.findMany({
    where: { members: { some: { userId } } },
    include: {
      _count: { select: { members: true, boards: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return teams;
});

app.get("/teams/:id", async (req) => {
  const userId = (req as never as { userId: string }).userId;
  const { id } = req.params as { id: string };

  await requireMember(id, userId);

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      boards: { orderBy: { createdAt: "asc" } },
      _count: { select: { activities: true } },
    },
  });

  if (!team) {
    throw { statusCode: 404, message: "Team not found" };
  }

  return team;
});

app.delete("/teams/:id", async (req, reply) => {
  const userId = (req as never as { userId: string }).userId;
  const { id } = req.params as { id: string };

  await requireAdmin(id, userId);

  await prisma.team.delete({ where: { id } });

  app.log.info({ teamId: id }, "[team] Team deleted");
  return reply.status(204).send();
});

// ============ MEMBERS ============

app.post("/teams/:id/invite", async (req) => {
  const userId = (req as never as { userId: string }).userId;
  const { id } = req.params as { id: string };
  const { email, role } = req.body as { email: string; role?: string };

  if (!email) {
    throw { statusCode: 400, message: "Email is required" };
  }

  await requireAdmin(id, userId);

  const invitee = await prisma.user.findUnique({ where: { email } });
  if (!invitee) {
    throw { statusCode: 404, message: "User not found" };
  }

  const existing = await getMembership(id, invitee.id);
  if (existing) {
    throw { statusCode: 409, message: "User is already a member" };
  }

  const memberRole = (role === "ADMIN" || role === "VIEWER" ? role : "MEMBER") as never;

  const member = await prisma.member.create({
    data: {
      teamId: id,
      userId: invitee.id,
      role: memberRole,
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  await createActivity(id, invitee.id, "MEMBER_JOINED");

  app.log.info(
    { teamId: id, inviteeId: invitee.id },
    "[team] Member invited"
  );
  return member;
});

app.patch("/teams/:id/members/:memberId", async (req) => {
  const userId = (req as never as { userId: string }).userId;
  const { id, memberId } = req.params as { id: string; memberId: string };
  const { role } = req.body as { role: string };

  await requireAdmin(id, userId);

  if (!["ADMIN", "MEMBER", "VIEWER"].includes(role)) {
    throw { statusCode: 400, message: "Invalid role" };
  }

  const member = await prisma.member.update({
    where: { id: memberId },
    data: { role: role as never },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  return member;
});

app.delete("/teams/:id/members/:memberId", async (req, reply) => {
  const userId = (req as never as { userId: string }).userId;
  const { id, memberId } = req.params as { id: string; memberId: string };

  const membership = await requireMember(id, userId);

  const targetMember = await prisma.member.findUnique({
    where: { id: memberId },
  });
  if (!targetMember || targetMember.teamId !== id) {
    throw { statusCode: 404, message: "Member not found" };
  }

  if (targetMember.userId !== userId && membership.role !== "ADMIN") {
    throw { statusCode: 403, message: "Can only remove yourself or be admin" };
  }

  if (targetMember.role === "ADMIN") {
    const adminCount = await prisma.member.count({
      where: { teamId: id, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      throw { statusCode: 400, message: "Cannot remove the last admin" };
    }
  }

  await prisma.member.delete({ where: { id: memberId } });

  await createActivity(id, targetMember.userId, "MEMBER_LEFT");

  return reply.status(204).send();
});

// ============ BOARDS ============

app.post("/teams/:id/boards", async (req) => {
  const userId = (req as never as { userId: string }).userId;
  const { id } = req.params as { id: string };
  const { name, color } = req.body as { name: string; color?: string };

  if (!name || name.trim().length === 0) {
    throw { statusCode: 400, message: "Board name is required" };
  }

  await requireMember(id, userId);

  const board = await prisma.board.create({
    data: {
      teamId: id,
      name: name.trim(),
      color: color || "#3b82f6",
    },
  });

  await createActivity(id, userId, "BOARD_CREATED", undefined, { boardName: name });

  app.log.info({ teamId: id, boardId: board.id }, "[team] Board created");
  return board;
});

app.get("/teams/:id/boards", async (req) => {
  const userId = (req as never as { userId: string }).userId;
  const { id } = req.params as { id: string };

  await requireMember(id, userId);

  const boards = await prisma.board.findMany({
    where: { teamId: id },
    include: {
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return boards;
});

app.get("/teams/:id/boards/:boardId", async (req) => {
  const userId = (req as never as { userId: string }).userId;
  const { id, boardId } = req.params as { id: string; boardId: string };

  await requireMember(id, userId);

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      tasks: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!board || board.teamId !== id) {
    throw { statusCode: 404, message: "Board not found" };
  }

  return board;
});

app.delete("/teams/:id/boards/:boardId", async (req, reply) => {
  const userId = (req as never as { userId: string }).userId;
  const { id, boardId } = req.params as { id: string; boardId: string };

  await requireMember(id, userId);

  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board || board.teamId !== id) {
    throw { statusCode: 404, message: "Board not found" };
  }

  await prisma.board.delete({ where: { id: boardId } });

  return reply.status(204).send();
});

// ============ ACTIVITY ============

app.get("/teams/:id/activity", async (req) => {
  const userId = (req as never as { userId: string }).userId;
  const { id } = req.params as { id: string };

  await requireMember(id, userId);

  const activities = await prisma.activity.findMany({
    where: { teamId: id },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return activities;
});

// ============ STARTUP ============

const start = async () => {
  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    app.log.info(`[team] Service listening on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

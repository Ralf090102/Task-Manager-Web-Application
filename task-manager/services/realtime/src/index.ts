import { createServer, IncomingMessage } from "http";
import { Server, Socket } from "socket.io";
import { jwtDecrypt } from "jose";

const PORT = parseInt(process.env.PORT || "3001", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

if (!NEXTAUTH_SECRET) {
  console.error("[realtime] FATAL: NEXTAUTH_SECRET is not set");
  process.exit(1);
}

const secret = new TextEncoder().encode(NEXTAUTH_SECRET);

interface EmitBody {
  event: string;
  room?: string;
  data: unknown;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(
  res: import("http").ServerResponse,
  status: number,
  data: unknown
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const httpServer = createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    sendJson(res, 200, {
      status: "ok",
      connections: io.engine.clientsCount,
    });
    return;
  }

  if (req.url === "/emit" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { event, room, data } = JSON.parse(body) as EmitBody;

      if (!event) {
        sendJson(res, 400, { error: "event is required" });
        return;
      }

      if (room) {
        io.to(room).emit(event, data);
      } else {
        io.emit(event, data);
      }

      sendJson(res, 200, { emitted: true, event, room: room || "broadcast" });
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
  },
  path: "/socket.io/",
});

io.use(async (socket: Socket, next) => {
  try {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error("No token provided"));
    }

    const { payload } = await jwtDecrypt(token, secret);
    const userId = payload.id as string | undefined;
    if (!userId) {
      return next(new Error("Invalid token: no user id"));
    }

    socket.data.userId = userId;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket: Socket) => {
  const userId = socket.data.userId as string;
  console.log(`[realtime] User connected: ${userId} (${socket.id})`);

  socket.join(`user:${userId}`);
  socket.join("board");

  socket.on("task:updated", (data: unknown) => {
    socket.to("board").emit("task:updated", data);
  });

  socket.on("task:created", (data: unknown) => {
    socket.to("board").emit("task:created", data);
  });

  socket.on("task:deleted", (data: unknown) => {
    socket.to("board").emit("task:deleted", data);
  });

  socket.on("presence:ping", () => {
    socket.to("board").emit("presence:online", { userId });
  });

  socket.on("disconnect", (reason: string) => {
    console.log(`[realtime] User disconnected: ${userId} (${reason})`);
    socket.to("board").emit("presence:offline", { userId });
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[realtime] Socket.io server listening on port ${PORT}`);
  console.log(`[realtime] CORS origin: ${CORS_ORIGIN}`);
});

process.on("SIGTERM", () => {
  console.log("[realtime] SIGTERM received, closing connections...");
  io.close(() => {
    console.log("[realtime] All connections closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[realtime] SIGINT received, shutting down...");
  io.close(() => process.exit(0));
});

import { auth } from "@/lib/auth";

const TEAM_SERVICE_URL = process.env.TEAM_SERVICE_URL;

export async function teamProxy(
  path: string,
  options: {
    method?: string;
    body?: unknown;
  } = {}
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!TEAM_SERVICE_URL) {
    return Response.json(
      { error: "Team service not configured" },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(`${TEAM_SERVICE_URL}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": session.user.id,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = response.status === 204 ? null : await response.json();
    return Response.json(data, { status: response.status });
  } catch {
    return Response.json(
      { error: "Failed to reach team service" },
      { status: 502 }
    );
  }
}

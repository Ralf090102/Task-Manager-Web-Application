import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { Meilisearch } from "meilisearch";
import { observeRequest, trackTaskOperation } from "@/lib/metrics";
import logger from "@/lib/logger";

export async function GET(req: Request) {
  const start = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      observeRequest("GET", "/api/tasks/search", 401, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.MEILI_URL) {
      observeRequest("GET", "/api/tasks/search", 503, (Date.now() - start) / 1000);
      return NextResponse.json(
        { error: "Search service not configured" },
        { status: 503 }
      );
    }

    const meili = new Meilisearch({
      host: process.env.MEILI_URL,
      apiKey: process.env.MEILI_MASTER_KEY,
    });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");

    const filters = [`userId = "${session.user.id}"`];
    if (status) filters.push(`status = "${status}"`);
    if (priority) filters.push(`priority = "${priority}"`);

    const results = await meili.index("tasks").search(q, {
      filter: filters,
      limit: 50,
    });

    trackTaskOperation("search", "success");
    observeRequest("GET", "/api/tasks/search", 200, (Date.now() - start) / 1000);
    return NextResponse.json(results);
  } catch (err) {
    trackTaskOperation("search", "error");
    logger.error({ err }, "Search failed");
    observeRequest("GET", "/api/tasks/search", 500, (Date.now() - start) / 1000);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

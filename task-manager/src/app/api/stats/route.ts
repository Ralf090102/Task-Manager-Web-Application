import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const analyticsUrl = process.env.ANALYTICS_URL;
  if (!analyticsUrl) {
    return NextResponse.json(
      { error: "Analytics service not configured" },
      { status: 503 }
    );
  }

  try {
    const [summaryRes, productivityRes] = await Promise.all([
      fetch(`${analyticsUrl}/stats/summary/${session.user.id}`),
      fetch(`${analyticsUrl}/stats/productivity/${session.user.id}`),
    ]);

    const summary = await summaryRes.json();
    const productivity = await productivityRes.json();

    return NextResponse.json({ summary, productivity });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 502 }
    );
  }
}

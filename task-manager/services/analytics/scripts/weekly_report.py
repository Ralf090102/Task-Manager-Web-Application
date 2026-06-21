import asyncio
import asyncpg
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import os
import io

DB_URL = os.environ.get("DATABASE_URL", "")


def clean_db_url(url: str) -> str:
    if "?" in url:
        return url.split("?")[0]
    return url


async def generate_reports():
    conn = await asyncpg.connect(clean_db_url(DB_URL), statement_cache_size=0)

    users = await conn.fetch(
        'SELECT id, email, name FROM "User" WHERE email IS NOT NULL'
    )
    print(f"[weekly-report] Found {len(users)} users to report on")

    reports_generated = 0

    for user in users:
        tasks = await conn.fetch(
            """SELECT DATE("createdAt") as day, COUNT(*) as count
               FROM "Task" WHERE "userId" = $1
               AND "createdAt" > NOW() - INTERVAL '7 days'
               GROUP BY day ORDER BY day""",
            user["id"],
        )

        if not tasks:
            print(f"[weekly-report] No tasks for user {user['name']} — skipping")
            continue

        days = [str(t["day"]) for t in tasks]
        counts = [t["count"] for t in tasks]

        fig, ax = plt.subplots(figsize=(10, 5))
        ax.bar(days, counts, color="#3b82f6")
        ax.set_title(f"Weekly Task Creation — {user['name']}")
        ax.set_ylabel("Tasks Created")
        ax.set_xlabel("Date")
        fig.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=150)
        plt.close(fig)
        chart_size = len(buf.getvalue())
        print(
            f"[weekly-report] Chart for {user['name']}: "
            f"{sum(counts)} tasks, {chart_size} bytes"
        )

        await conn.execute(
            """INSERT INTO "Notification" ("id", "userId", "type", "message", "read", "createdAt")
               VALUES ($1, $2, $3, $4, false, NOW())""",
            f"weekly-report-{user['id']}-{asyncio.get_event_loop().time()}",
            user["id"],
            "weekly_report",
            f"Weekly summary: {sum(counts)} tasks created in the last 7 days.",
        )

        reports_generated += 1

    await conn.close()
    print(f"[weekly-report] Done — {reports_generated} reports generated")


if __name__ == "__main__":
    asyncio.run(generate_reports())

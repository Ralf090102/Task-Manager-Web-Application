from contextlib import asynccontextmanager
from fastapi import FastAPI
import asyncpg
import os


def clean_db_url(url: str) -> str:
    if "?" in url:
        return url.split("?")[0]
    return url


db_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    db_url = clean_db_url(os.environ["DATABASE_URL"])
    db_pool = await asyncpg.create_pool(
        db_url,
        min_size=1,
        max_size=5,
        statement_cache_size=0,
    )
    print(f"[analytics] DB pool created (pgbouncer-compatible)")
    yield
    if db_pool:
        await db_pool.close()
        print("[analytics] DB pool closed")


app = FastAPI(title="Task Analytics", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/stats/summary/{user_id}")
async def get_summary(user_id: str):
    async with db_pool.acquire() as conn:
        status_rows = await conn.fetch(
            """SELECT status, COUNT(*) as count
               FROM "Task" WHERE "userId" = $1 GROUP BY status""",
            user_id,
        )

        total = await conn.fetchval(
            'SELECT COUNT(*) FROM "Task" WHERE "userId" = $1', user_id
        )
        completed = await conn.fetchval(
            'SELECT COUNT(*) FROM "Task" WHERE "userId" = $1 AND status = $2',
            user_id,
            "COMPLETED",
        )

        daily_rows = await conn.fetch(
            """SELECT DATE("createdAt") as day, COUNT(*) as count
               FROM "Task" WHERE "userId" = $1
               AND "createdAt" > NOW() - INTERVAL '30 days'
               GROUP BY day ORDER BY day""",
            user_id,
        )

    return {
        "statusCounts": {row["status"]: row["count"] for row in status_rows},
        "completionRate": round((completed / total * 100) if total > 0 else 0, 1),
        "totalTasks": total,
        "completedTasks": completed,
        "dailyHistory": [
            {"date": str(row["day"]), "count": row["count"]} for row in daily_rows
        ],
    }


@app.get("/stats/productivity/{user_id}")
async def get_productivity(user_id: str):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT priority,
                      COUNT(*) as total,
                      COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed
               FROM "Task" WHERE "userId" = $1
               GROUP BY priority""",
            user_id,
        )

    return {
        "byPriority": [
            {
                "priority": row["priority"],
                "total": row["total"],
                "completed": row["completed"],
                "rate": round(
                    (row["completed"] / row["total"] * 100)
                    if row["total"] > 0
                    else 0,
                    1,
                ),
            }
            for row in rows
        ]
    }

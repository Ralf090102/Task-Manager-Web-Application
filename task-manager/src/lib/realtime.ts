const REALTIME_URL = process.env.REALTIME_URL;

export async function emitToRealtime(
  event: string,
  data: unknown,
  room?: string
): Promise<void> {
  if (!REALTIME_URL) return;

  try {
    await fetch(`${REALTIME_URL}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data, room: room ?? "board" }),
    });
  } catch {
    // Silent fail — realtime is a best-effort enhancement
  }
}

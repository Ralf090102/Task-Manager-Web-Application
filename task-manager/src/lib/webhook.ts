const WEBHOOK_URL = process.env.WEBHOOK_URL;

export async function triggerWebhook(
  event: string,
  data: unknown,
  userId: string
): Promise<void> {
  if (!WEBHOOK_URL) return;

  try {
    await fetch(`${WEBHOOK_URL}/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data, userId }),
    });
  } catch {
    // Silent fail — webhook service handles retries independently
  }
}

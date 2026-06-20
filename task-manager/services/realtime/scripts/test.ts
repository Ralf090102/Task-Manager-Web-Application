const BASE = `http://localhost:${process.env.PORT || 3001}`;

async function checkHealth(): Promise<void> {
  try {
    const resp = await fetch(`${BASE}/health`);
    const body = await resp.json() as Record<string, unknown>;
    console.log("Health:", JSON.stringify(body, null, 2));
  } catch (err) {
    console.log("Health check failed:", (err as Error).message);
  }
}

async function testEmit(): Promise<void> {
  try {
    const resp = await fetch(`${BASE}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "test:event",
        room: "board",
        data: { message: "Hello from test script" },
      }),
    });
    const body = await resp.json() as Record<string, unknown>;
    console.log("Emit result:", JSON.stringify(body, null, 2));
  } catch (err) {
    console.log("Emit failed:", (err as Error).message);
  }
}

async function testInvalidEmit(): Promise<void> {
  try {
    const resp = await fetch(`${BASE}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "missing event field" }),
    });
    const body = await resp.json() as Record<string, unknown>;
    console.log("Invalid emit result:", JSON.stringify(body, null, 2));
  } catch (err) {
    console.log("Invalid emit failed:", (err as Error).message);
  }
}

const command = process.argv[2];

const commands: Record<string, () => Promise<void>> = {
  health: checkHealth,
  emit: testEmit,
  "emit-invalid": testInvalidEmit,
};

if (!command || !commands[command]) {
  console.log("Usage: npx tsx scripts/test.ts <command>");
  console.log("Commands:");
  console.log("  health        - Check /health endpoint");
  console.log("  emit          - Test /emit endpoint (valid payload)");
  console.log("  emit-invalid  - Test /emit endpoint (missing event field)");
} else {
  await commands[command]();
}

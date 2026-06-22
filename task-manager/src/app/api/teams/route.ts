import { teamProxy } from "@/lib/team-proxy";
import { teamCreateSchema } from "@/lib/validations";

export async function GET() {
  return teamProxy("/teams");
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = teamCreateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  return teamProxy("/teams", { method: "POST", body: parsed.data });
}

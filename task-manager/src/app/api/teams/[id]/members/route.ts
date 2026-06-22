import { teamProxy } from "@/lib/team-proxy";
import { memberInviteSchema } from "@/lib/validations";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = memberInviteSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  return teamProxy(`/teams/${id}/invite`, { method: "POST", body: parsed.data });
}

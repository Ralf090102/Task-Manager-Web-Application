import { teamProxy } from "@/lib/team-proxy";
import { memberRoleSchema } from "@/lib/validations";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id, memberId } = await params;
  const body = await req.json();
  const parsed = memberRoleSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  return teamProxy(`/teams/${id}/members/${memberId}`, {
    method: "PATCH",
    body: parsed.data,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id, memberId } = await params;
  return teamProxy(`/teams/${id}/members/${memberId}`, { method: "DELETE" });
}

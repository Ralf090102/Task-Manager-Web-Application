import { teamProxy } from "@/lib/team-proxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return teamProxy(`/teams/${id}`);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return teamProxy(`/teams/${id}`, { method: "DELETE" });
}

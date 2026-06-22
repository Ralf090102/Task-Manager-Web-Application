import { teamProxy } from "@/lib/team-proxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; boardId: string }> }
) {
  const { id, boardId } = await params;
  return teamProxy(`/teams/${id}/boards/${boardId}`);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; boardId: string }> }
) {
  const { id, boardId } = await params;
  return teamProxy(`/teams/${id}/boards/${boardId}`, { method: "DELETE" });
}

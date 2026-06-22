import { teamProxy } from "@/lib/team-proxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return teamProxy(`/teams/${id}/activity`);
}

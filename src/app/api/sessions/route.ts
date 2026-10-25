import { listSessions } from "@/app/_session/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await listSessions());
}

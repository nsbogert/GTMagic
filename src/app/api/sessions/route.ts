import { launchAgent } from "@/app/_session/launcher";
import { createSession, listSessions } from "@/app/_session/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await listSessions());
}

/** One-click start: create a session and launch Claude Code in the background to drive it. */
export async function POST() {
  const id = createSession();
  try {
    const pid = launchAgent(id);
    if (pid === null) throw new Error("no pid");
    return Response.json({ id });
  } catch (err) {
    console.error(`[sessions] couldn't launch Claude Code for session ${id}:`, err); // the real cause (e.g. a missing scripts folder)
    return Response.json({ id, error: "Couldn't start Claude Code. Is it installed and signed in? (Run `claude` once in a terminal.)" }, { status: 500 });
  }
}

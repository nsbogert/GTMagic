/* Local-only guard, run before every request. The server binds to 127.0.0.1, but any web page open in
   the owner's browser can still reach it: a cross-site form POST to /api/sessions would start Claude Code,
   and DNS rebinding (evil.example resolving to 127.0.0.1) would let a page read transcripts and post
   answers. So the Host must be a loopback name, and a request that changes something must come from this
   app's own pages. Tools like curl and the `ui` CLI send no Origin and already have local access. */
import { NextResponse, type NextRequest } from "next/server";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** "127.0.0.1:3000" → "127.0.0.1"; "[::1]:3000" → "[::1]". */
function hostName(host: string): string {
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : (host.split(":")[0] ?? "");
}

function refuse(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 403 });
}

export function proxy(req: NextRequest): NextResponse {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (!LOOPBACK_HOSTS.has(hostName(host))) return refuse("GTMagic only answers on 127.0.0.1 or localhost.");
  const origin = req.headers.get("origin");
  // http only: the app never serves https (`next dev --experimental-https` would need https here too).
  if (!READ_ONLY_METHODS.has(req.method) && origin !== null && origin.toLowerCase() !== `http://${host}`) {
    return refuse("This request didn't come from the GTMagic page.");
  }
  return NextResponse.next();
}

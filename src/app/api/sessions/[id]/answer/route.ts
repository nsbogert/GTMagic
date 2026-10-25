import { appendAnswer, askIsOpen, checkUpload, MAX_ANSWER_BYTES, saveUpload, sessionDir } from "@/app/_session/store";

export const dynamic = "force-dynamic";

const TOO_BIG = `Those files are over ${MAX_ANSWER_BYTES / 1024 / 1024} MB together. Send fewer at a time.`;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!sessionDir(id)) return Response.json({ error: "No such session" }, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_ANSWER_BYTES) return Response.json({ error: TOO_BIG }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    // The proxy buffers bodies up to next.config's proxyClientMaxBodySize and cuts off the rest.
    return Response.json({ error: `Couldn't read that upload. ${TOO_BIG}` }, { status: 400 });
  }
  const askId = String(form.get("askId") ?? "");
  const text = String(form.get("text") ?? "").slice(0, 10_000);
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!askIsOpen(id, askId)) return Response.json({ error: "That question is already answered or closed." }, { status: 409 });
  for (const f of files) {
    const check = checkUpload(f);
    if (check === "too-large") return Response.json({ error: `${f.name} is over 10 MB.` }, { status: 413 });
    if (check === "bad-type") return Response.json({ error: `${f.name} isn't a file type GTMagic reads.` }, { status: 415 });
  }
  const saved: string[] = [];
  for (const f of files) {
    const p = await saveUpload(id, f);
    if (p) saved.push(p);
  }
  const result = appendAnswer(id, askId, text, saved);
  if (result === "ok") return Response.json({ ok: true });
  if (result === "no-session") return Response.json({ error: "No such session" }, { status: 404 });
  return Response.json({ error: "That question is already answered or closed." }, { status: 409 });
}

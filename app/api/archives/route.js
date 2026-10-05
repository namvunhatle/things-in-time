import { createArchive } from '../../../lib/archive-store';
import { trustedRequestBase } from '../../../lib/request-origin';

export const runtime = 'nodejs';

export async function POST(request) {
  const base = trustedRequestBase(request);
  if (!base) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: 'request too large.' }, { status: 413 });
  try {
    const body = await request.json();
    const { archive, editorKey } = await createArchive(body);
    const editorUrl = new URL(`/portal/${archive.id}/claim`, base);
    editorUrl.hash = `key=${encodeURIComponent(editorKey)}`;
    return Response.json({ id: archive.id, editorUrl: editorUrl.toString(), shareUrl: new URL(`/a/${archive.id}`, base).toString() }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message || 'couldn’t create the archive.' }, { status: 400 });
  }
}

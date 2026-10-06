import { createArchive } from '../../../lib/archive-store';
import { trustedRequestBase } from '../../../lib/request-origin';
import { withinRateLimit } from '../../../lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request) {
  const base = trustedRequestBase(request);
  if (!base) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (!await withinRateLimit(request, 'create-archive', 10, 60 * 60)) return Response.json({ error: 'too many archives created. try again later.' }, { status: 429 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: 'request too large.' }, { status: 413 });
  try {
    const body = await request.json();
    const { archive, editorKey } = await createArchive(body);
    if (archive.version === 2) {
      return Response.json({ id: archive.id, shareSlug: archive.shareSlug, shareUrl: new URL(`/a/${archive.shareSlug}`, base).toString() }, {
        status: 201,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    const editorUrl = new URL(`/portal/${archive.id}/claim`, base);
    editorUrl.hash = `key=${encodeURIComponent(editorKey)}`;
    return Response.json({ id: archive.id, shareSlug: archive.shareSlug, editorUrl: editorUrl.toString(), shareUrl: new URL(`/a/${archive.shareSlug}`, base).toString() }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'couldn’t create the archive.' }, { status: 400 });
  }
}

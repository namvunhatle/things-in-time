import { cookies } from 'next/headers';
import { editorCookieName, hasEditorSession, readArchive, updateViewerProtection } from '../../../../../lib/archive-store';
import { trustedRequestBase } from '../../../../../lib/request-origin';
import { withinRateLimit } from '../../../../../lib/rate-limit';

export const runtime = 'nodejs';

export async function PUT(request, { params }) {
  if (!trustedRequestBase(request)) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (!await withinRateLimit(request, 'viewer-password', 10, 60 * 60)) return Response.json({ error: 'too many attempts. try again later.' }, { status: 429 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: 'request too large.' }, { status: 413 });
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) return Response.json({ error: 'archive not found.' }, { status: 404 });
  const editorToken = (await cookies()).get(editorCookieName(archiveId))?.value;
  if (!hasEditorSession(archive, editorToken)) return Response.json({ error: 'editor session denied.' }, { status: 403 });
  try {
    await updateViewerProtection(archive, await request.json());
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'couldn’t change the password.' }, { status: 400 });
  }
}

import { cookies } from 'next/headers';
import { editorCookieName, hasEditorSession, purgeLegacyPlaintext, readArchive } from '../../../../../lib/archive-store';
import { trustedRequestBase } from '../../../../../lib/request-origin';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  if (!trustedRequestBase(request)) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 1024) return Response.json({ error: 'request too large.' }, { status: 413 });
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) return Response.json({ error: 'archive not found.' }, { status: 404 });
  const editorToken = (await cookies()).get(editorCookieName(archiveId))?.value;
  if (!hasEditorSession(archive, editorToken)) return Response.json({ error: 'editor session denied.' }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const result = await purgeLegacyPlaintext(archive, Number(body.encryptedEntryCount));
    return Response.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'cleanup failed.' }, { status: 400 });
  }
}

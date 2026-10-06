import { cookies } from 'next/headers';
import { editorCookieName, hasEditorSession, readArchive, updateArchiveLayout, updateEncryptedArchive } from '../../../../../lib/archive-store';
import { trustedRequestBase } from '../../../../../lib/request-origin';

export const runtime = 'nodejs';

export async function PUT(request, { params }) {
  if (!trustedRequestBase(request)) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 2_100_000) return Response.json({ error: 'request too large.' }, { status: 413 });
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) return Response.json({ error: 'archive not found.' }, { status: 404 });
  try {
    const body = await request.json();
    const editorToken = (await cookies()).get(editorCookieName(archiveId))?.value;
    if (!hasEditorSession(archive, editorToken)) return Response.json({ error: 'editor session denied.' }, { status: 403 });
    if (archive.version === 2) {
      const updated = await updateEncryptedArchive(archive, body);
      return Response.json({ ok: true, revision: updated._revision }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const updated = await updateArchiveLayout(archive, body);
    return Response.json({ archive: { id: updated.id, title: updated.title, canvas: updated.canvas, items: updated.items } });
  } catch (error) {
    return Response.json({ error: error.message || 'save failed.' }, { status: 400 });
  }
}

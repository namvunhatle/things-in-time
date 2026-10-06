import { cookies } from 'next/headers';
import { editorCookieName, hasEditorSession, migrateArchiveToEncrypted, readArchive } from '../../../../../lib/archive-store';
import { trustedRequestBase } from '../../../../../lib/request-origin';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  if (!trustedRequestBase(request)) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 2_100_000) return Response.json({ error: 'request too large.' }, { status: 413 });
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) return Response.json({ error: 'archive not found.' }, { status: 404 });
  const editorToken = (await cookies()).get(editorCookieName(archiveId))?.value;
  if (!hasEditorSession(archive, editorToken)) return Response.json({ error: 'editor session denied.' }, { status: 403 });
  try {
    await migrateArchiveToEncrypted(archive, await request.json());
    return Response.json({ ok: true, cleanupPending: Boolean(archive.ownerId) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'migration failed.' }, { status: 400 });
  }
}

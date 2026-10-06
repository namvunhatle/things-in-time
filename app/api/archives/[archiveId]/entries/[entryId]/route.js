import { cookies } from 'next/headers';
import { editorCookieName, hasEditorSession, readArchive } from '../../../../../../lib/archive-store';
import { updatePublishedEntry } from '../../../../../../lib/entries';
import { trustedRequestBase } from '../../../../../../lib/request-origin';

export const runtime = 'nodejs';

export async function PUT(request, { params }) {
  if (!trustedRequestBase(request)) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 64 * 1024) return Response.json({ error: 'request too large.' }, { status: 413 });
  const { archiveId, entryId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive?.ownerId || archive.presentation !== 'timeline') return Response.json({ error: 'archive not found.' }, { status: 404 });
  const token = (await cookies()).get(editorCookieName(archiveId))?.value;
  if (!hasEditorSession(archive, token)) return Response.json({ error: 'editor session denied.' }, { status: 403 });
  try {
    const entry = await updatePublishedEntry(archive.ownerId, entryId, await request.json());
    return Response.json({ entry });
  } catch (error) {
    return Response.json({ error: error.message || 'could not save entry.' }, { status: 400 });
  }
}

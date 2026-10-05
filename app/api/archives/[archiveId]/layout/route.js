import { cookies } from 'next/headers';
import { readArchive, updateArchiveLayout } from '../../../../../lib/archive-store';
import { editorAccess } from '../../../../../lib/editor-access';
import { trustedRequestBase } from '../../../../../lib/request-origin';

export const runtime = 'nodejs';

export async function PUT(request, { params }) {
  if (!trustedRequestBase(request)) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 128 * 1024) return Response.json({ error: 'request too large.' }, { status: 413 });
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) return Response.json({ error: 'archive not found.' }, { status: 404 });
  try {
    const body = await request.json();
    if (!(await editorAccess(archive, await cookies())).allowed) return Response.json({ error: 'editor session denied.' }, { status: 403 });
    const updated = await updateArchiveLayout(archive, body);
    return Response.json({ archive: { id: updated.id, title: updated.title, canvas: updated.canvas, items: updated.items } });
  } catch (error) {
    return Response.json({ error: error.message || 'save failed.' }, { status: 400 });
  }
}

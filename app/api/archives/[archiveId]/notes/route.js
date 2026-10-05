import { cookies } from 'next/headers';
import { addArchiveNote, readArchive } from '../../../../../lib/archive-store';
import { editorAccess } from '../../../../../lib/editor-access';
import { trustedRequestBase } from '../../../../../lib/request-origin';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  if (!trustedRequestBase(request)) return Response.json({ error: 'request denied.' }, { status: 403 });
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) return Response.json({ error: 'archive not found.' }, { status: 404 });
  if (!(await editorAccess(archive, await cookies())).allowed) return Response.json({ error: 'editor session denied.' }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const item = await addArchiveNote(archive, { x: body.x, y: body.y });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message || 'could not add note.' }, { status: 400 });
  }
}

import { cookies } from 'next/headers';
import { addArchiveImage, editorCookieName, hasEditorSession, readArchive } from '../../../../../lib/archive-store';
import { trustedRequestBase } from '../../../../../lib/request-origin';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  if (!trustedRequestBase(request)) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 11 * 1024 * 1024) return Response.json({ error: 'image must be smaller than 10 MB.' }, { status: 413 });
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) return Response.json({ error: 'archive not found.' }, { status: 404 });
  try {
    const form = await request.formData();
    const editorToken = (await cookies()).get(editorCookieName(archiveId))?.value;
    if (!hasEditorSession(archive, editorToken)) return Response.json({ error: 'editor session denied.' }, { status: 403 });
    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ error: 'choose an image.' }, { status: 400 });
    const item = await addArchiveImage(archive, file, { x: form.get('x'), y: form.get('y') });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message || 'upload failed.' }, { status: 400 });
  }
}

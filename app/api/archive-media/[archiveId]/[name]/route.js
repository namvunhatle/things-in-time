import { cookies } from 'next/headers';
import { editorCookieName, hasEditorSession, hasViewerSession, readArchive, readArchiveMedia, viewerCookieName } from '../../../../../lib/archive-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const contentTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };

export async function GET(request, { params }) {
  const { archiveId, name } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) return new Response(null, { status: 404 });

  const cookieStore = await cookies();
  const editorToken = cookieStore.get(editorCookieName(archiveId))?.value;
  const viewerIdentity = archive.shareSlug || archive.id;
  const viewerToken = cookieStore.get(viewerCookieName(viewerIdentity))?.value;
  if (!hasEditorSession(archive, editorToken) && !hasViewerSession(viewerIdentity, viewerToken)) return new Response(null, { status: 401 });

  const data = await readArchiveMedia(archiveId, name);
  if (!data) return new Response(null, { status: 404 });
  const extension = name.split('.').pop().toLowerCase();
  return new Response(data.body, { headers: {
    'Content-Type': archive.version === 2 ? 'application/octet-stream' : (data.contentType || contentTypes[extension] || 'application/octet-stream'),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, noimageindex',
    ...(data.etag ? { ETag: data.etag } : {}),
  } });
}

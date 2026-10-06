import fs from 'node:fs/promises';
import path from 'node:path';
import { get } from '@vercel/blob';
import { cookies } from 'next/headers';
import { COOKIE, hasAccess } from '../../../lib/auth';
import { hasViewerSession, viewerCookieName } from '../../../lib/archive-store';
import { confidentialPhotosDirectory } from '../../../lib/confidential-paths';
import { personalArchive } from '../../../lib/personal-archive';

export const dynamic = 'force-dynamic';
const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };
export async function GET(request, { params }) {
  if (!personalArchive.shareSlug) return new Response(null, { status: 404 });
  const cookieStore = await cookies();
  const hasLegacyAccess = hasAccess(cookieStore.get(COOKIE)?.value);
  const viewerToken = cookieStore.get(viewerCookieName(personalArchive.shareSlug))?.value;
  if (!hasLegacyAccess && !hasViewerSession(personalArchive.shareSlug, viewerToken)) return new Response(null, { status: 401 });
  const { name } = await params;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(jpe?g|png|webp|gif|avif)$/i.test(name)) return new Response(null, { status: 404 });
  if (process.env.DATABASE_URL) {
    const result = await get(`personal-media/${name}`, { access: 'private' });
    if (!result || result.statusCode !== 200) return new Response(null, { status: 404 });
    return new Response(result.stream, { headers: {
      'Content-Type': result.blob.contentType || types[name.split('.').pop().toLowerCase()],
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, noimageindex',
      'X-Content-Type-Options': 'nosniff',
      ETag: result.blob.etag,
    } });
  }
  try {
    const data = await fs.readFile(path.join(confidentialPhotosDirectory, name));
    return new Response(data, { headers: { 'Content-Type': types[name.split('.').pop().toLowerCase()], 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, noimageindex', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response(null, { status: 404 }); }
}

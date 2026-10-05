import fs from 'node:fs/promises';
import path from 'node:path';
import { cookies } from 'next/headers';
import { COOKIE, hasAccess } from '../../../lib/auth';
import { confidentialPhotosDirectory } from '../../../lib/confidential-paths';

export const dynamic = 'force-dynamic';
const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };
export async function GET(request, { params }) {
  if (!hasAccess((await cookies()).get(COOKIE)?.value)) return new Response(null, { status: 401 });
  const { name } = await params;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(jpe?g|png|webp|gif|avif)$/i.test(name)) return new Response(null, { status: 404 });
  try {
    const data = await fs.readFile(path.join(confidentialPhotosDirectory, name));
    return new Response(data, { headers: { 'Content-Type': types[name.split('.').pop().toLowerCase()], 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, noimageindex', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response(null, { status: 404 }); }
}

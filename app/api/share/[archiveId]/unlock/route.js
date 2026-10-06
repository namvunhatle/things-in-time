import { NextResponse } from 'next/server';
import { archiveSessionSeconds, createViewerSession, readArchive, verifyArchivePassword, viewerCookieName } from '../../../../../lib/archive-store';
import { trustedRequestBase } from '../../../../../lib/request-origin';
import { withinRateLimit } from '../../../../../lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const base = trustedRequestBase(request);
  const wantsJson = request.headers.get('accept')?.includes('application/json');
  if (!base) return new NextResponse(null, { status: 403 });
  if (!await withinRateLimit(request, 'viewer-unlock', 20, 10 * 60)) return NextResponse.json({ error: 'too many attempts. try again later.' }, { status: 429 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return new NextResponse(null, { status: 413 });
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) return new NextResponse(null, { status: 404 });
  let credential;
  if (archive.version === 2) {
    const body = await request.json().catch(() => ({}));
    credential = body.authSecret;
  } else {
    const form = await request.formData();
    credential = form.get('passcode');
  }
  if (!await verifyArchivePassword(archive, credential)) {
    await new Promise(resolve => setTimeout(resolve, 750));
    if (wantsJson) return NextResponse.json({ error: 'that password didn’t match. try again.' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    return NextResponse.redirect(new URL(`/a/${archiveId}/unlock?error=1`, base), 303);
  }
  const destination = `/a/${archiveId}`;
  const response = wantsJson
    ? NextResponse.json({ ok: true, redirect: destination })
    : NextResponse.redirect(new URL(destination, base), 303);
  response.cookies.set(viewerCookieName(archiveId), createViewerSession(archiveId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: archiveSessionSeconds,
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

import { NextResponse } from 'next/server';
import { archiveSessionSeconds, createEditorSession, editorCookieName, readArchive, verifyEditorKey } from '../../../../../lib/archive-store';
import { trustedRequestBase } from '../../../../../lib/request-origin';
import { withinRateLimit } from '../../../../../lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  if (!trustedRequestBase(request)) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (!await withinRateLimit(request, 'editor-session', 30, 10 * 60)) return Response.json({ error: 'too many attempts. try again later.' }, { status: 429 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: 'request too large.' }, { status: 413 });
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) return Response.json({ error: 'archive not found.' }, { status: 404 });
  const body = await request.json();
  if (!verifyEditorKey(archive, body.key)) return Response.json({ error: 'editor access denied.' }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(editorCookieName(archiveId), createEditorSession(archive), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: archiveSessionSeconds,
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

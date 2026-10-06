import { NextResponse } from 'next/server';
import { readArchive, viewerCookieName } from '../../../../../lib/archive-store';
import { trustedRequestBase } from '../../../../../lib/request-origin';

export async function POST(request, { params }) {
  const base = trustedRequestBase(request);
  if (!base) return new NextResponse(null, { status: 403 });
  const { archiveId } = await params;
  // encrypted archives hold nothing to reopen without the full link, so leave to the start page
  const archive = await readArchive(archiveId);
  const destination = archive?.version === 2 ? '/' : `/a/${archiveId}/unlock`;
  const response = NextResponse.redirect(new URL(destination, base), 303);
  response.cookies.set(viewerCookieName(archiveId), '', { path: '/', maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
  return response;
}

import { NextResponse } from 'next/server';
import { viewerCookieName } from '../../../../../lib/archive-store';
import { trustedRequestBase } from '../../../../../lib/request-origin';

export async function POST(request, { params }) {
  const base = trustedRequestBase(request);
  if (!base) return new NextResponse(null, { status: 403 });
  const { archiveId } = await params;
  const response = NextResponse.redirect(new URL(`/a/${archiveId}/unlock`, base), 303);
  response.cookies.set(viewerCookieName(archiveId), '', { path: '/', maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
  return response;
}

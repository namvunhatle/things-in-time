import { NextResponse } from 'next/server';
import { accountCookieName } from '../../../../lib/account-store';
import { trustedRequestBase } from '../../../../lib/request-origin';

export async function POST(request) {
  const base = trustedRequestBase(request);
  if (!base) return new NextResponse(null, { status: 403 });
  const response = NextResponse.redirect(new URL('/portal', base), 303);
  response.cookies.set(accountCookieName, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}

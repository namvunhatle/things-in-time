import { NextResponse } from 'next/server';
import { accountCookieName, accountSessionSeconds, createAccountSession, verifyAccount } from '../../../../lib/account-store';
import { trustedRequestBase } from '../../../../lib/request-origin';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!trustedRequestBase(request)) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: 'request too large.' }, { status: 413 });
  try {
    const { username, password } = await request.json();
    const account = await verifyAccount(username, password);
    if (!account) {
      await new Promise(resolve => setTimeout(resolve, 600));
      return Response.json({ error: 'username or password didn’t match.' }, { status: 403 });
    }
    const response = NextResponse.json({ ok: true, username: account.username });
    response.cookies.set(accountCookieName, createAccountSession(account), {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: accountSessionSeconds,
    });
    return response;
  } catch (error) {
    return Response.json({ error: error.message || 'could not sign in.' }, { status: 400 });
  }
}

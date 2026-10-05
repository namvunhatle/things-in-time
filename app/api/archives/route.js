import { cookies } from 'next/headers';
import { accountCookieName, accountFromSession } from '../../../lib/account-store';
import { createArchive } from '../../../lib/archive-store';
import { trustedRequestBase } from '../../../lib/request-origin';

export const runtime = 'nodejs';

export async function POST(request) {
  const base = trustedRequestBase(request);
  if (!base) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: 'request too large.' }, { status: 413 });
  try {
    const account = await accountFromSession((await cookies()).get(accountCookieName)?.value);
    if (!account) return Response.json({ error: 'sign in before creating an archive.' }, { status: 401 });
    const body = await request.json();
    const { archive } = await createArchive({ ...body, ownerId: account.id });
    return Response.json({ id: archive.id, editorUrl: new URL(`/portal/${archive.id}`, base).toString(), shareUrl: new URL(`/a/${archive.id}`, base).toString() }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message || 'couldn’t create the archive.' }, { status: 400 });
  }
}

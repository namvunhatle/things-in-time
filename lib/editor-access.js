import { accountCookieName, accountFromSession } from './account-store';
import { editorCookieName, hasEditorSession } from './archive-store';

export async function editorAccess(archive, cookieStore) {
  const account = await accountFromSession(cookieStore.get(accountCookieName)?.value);
  if (account && archive.ownerId === account.id) return { allowed: true, legacy: false, account };
  const editorToken = cookieStore.get(editorCookieName(archive.id))?.value;
  if (hasEditorSession(archive, editorToken)) return { allowed: true, legacy: true, account };
  return { allowed: false, legacy: false, account };
}

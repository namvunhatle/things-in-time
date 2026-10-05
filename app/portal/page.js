import { cookies } from 'next/headers';
import PortalAccountGate from '../../components/PortalAccountGate';
import PortalCreateForm from '../../components/PortalCreateForm';
import { accountCookieName, accountFromSession } from '../../lib/account-store';
import { claimLegacyArchives, listArchivesByOwner } from '../../lib/archive-store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'your archives' };

export default async function PortalPage() {
  const cookieStore = await cookies();
  const account = await accountFromSession(cookieStore.get(accountCookieName)?.value);

  if (!account) return <main id="main" className="portal-shell">
    <a className="portal-back" href="/">← back to the archive</a>
    <section className="portal-intro">
      <p className="eyebrow">archive portal</p>
      <h1>come back to<br />what you’re making.</h1>
      <p>a tiny account keeps your drafts together. no email needed.</p>
    </section>
    <PortalAccountGate />
    <p className="portal-note">your password is hashed · the login cookie is HttpOnly · recovery links still work</p>
  </main>;

  await claimLegacyArchives(account.id, cookieStore);
  const archives = await listArchivesByOwner(account.id);
  return <main id="main" className="portal-shell">
    <div className="portal-account-bar"><span>signed in as {account.username}</span><form action="/api/account/logout" method="post"><button className="text-button" type="submit">sign out</button></form></div>
    <section className="portal-intro portal-dashboard-intro">
      <p className="eyebrow">my archives</p>
      <h1>pick up where<br />you left off.</h1>
    </section>
    {archives.length ? <ul className="archive-list">{archives.map(archive => <li key={archive.id}>
      <div><strong>{archive.title}</strong><small>{archive.items.length} item{archive.items.length === 1 ? '' : 's'}</small></div>
      <div><a href={`/portal/${archive.id}`}>edit</a><a href={`/a/${archive.id}`} target="_blank" rel="noreferrer">view ↗</a></div>
    </li>)}</ul> : <p className="portal-empty">nothing here yet. make the first one below.</p>}
    <section className="portal-create-section"><p className="eyebrow">new archive</p><PortalCreateForm /></section>
    <p className="portal-note">local prototype · account data and archives stay on this machine</p>
  </main>;
}

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, hasAccess, unlisted } from '../lib/auth';
import { categories, readEntries } from '../lib/entries';
import Entry from '../components/Entry';

export const dynamic = 'force-dynamic';
export default async function Archive({ searchParams }) {
  if (!hasAccess((await cookies()).get(COOKIE)?.value)) redirect('/unlock');
  const params = await searchParams;
  const category = Object.hasOwn(categories, params.category || '') ? params.category : 'all';
  const entries = await readEntries(category);
  return <div className="notebook">
    <header className="opening">
      <h1>things i couldn’t<br className="desktop-break" /> say in time</h1>
      <p className="intro">things i loved,<br />things i didn’t understand soon enough,<br />and things i still carry.</p>
    </header>
    <nav className="filters" aria-label="filter the archive">
      <a href="/#main" aria-current={category === 'all' ? 'page' : undefined}>all entries</a>
      <details key={category} className="browse">
        <summary>{category === 'all' ? 'browse' : categories[category]}</summary>
        <div className="filter-options">{Object.entries(categories).filter(([value]) => value !== 'all').map(([value, label]) => <a key={value} href={`/?category=${value}#main`} aria-current={category === value ? 'page' : undefined}>{label}</a>)}</div>
      </details>
    </nav>
    <main id="main" tabIndex={-1} aria-label="chronological archive">
      {entries.length ? entries.map(entry => <Entry key={entry.id} entry={entry} />) : <p className="empty">nothing here yet.</p>}
    </main>
    <footer><p>this is an archive, not an argument.</p><a href="/portal">create your own archive</a>{!unlisted() && <form action="/api/lock" method="post"><button className="text-button" type="submit">close the notebook</button></form>}</footer>
  </div>;
}

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import ArchiveCanvasView from '../../../components/ArchiveCanvasView';
import { hasViewerSession, readArchive, viewerCookieName } from '../../../lib/archive-store';
import Entry from '../../../components/Entry';
import { categories, readEntries } from '../../../lib/entries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  return { title: archive?.title || 'private archive' };
}

export default async function SharedArchivePage({ params, searchParams }) {
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) notFound();
  const token = (await cookies()).get(viewerCookieName(archiveId))?.value;
  if (!hasViewerSession(archiveId, token)) redirect(`/a/${archiveId}/unlock`);

  if (archive.presentation === 'timeline') {
    const query = await searchParams;
    const category = Object.hasOwn(categories, query.category || '') ? query.category : 'all';
    const entries = await readEntries(category, archive.ownerId);
    return <main id="main" className="notebook">
      <header className="opening">
        <h1>{archive.title}</h1>
        {archive.subtitle && <p className="intro">{archive.subtitle.split('\n').map((line, index) => <span key={index}>{line}{index < archive.subtitle.split('\n').length - 1 && <br />}</span>)}</p>}
      </header>
      <nav className="filters" aria-label="filter the archive">
        <a href={`/a/${archiveId}#entries`} aria-current={category === 'all' ? 'page' : undefined}>all entries</a>
        <details key={category} className="browse">
          <summary>{category === 'all' ? 'browse' : categories[category]}</summary>
          <div className="filter-options">{Object.entries(categories).filter(([value]) => value !== 'all').map(([value, label]) => <a key={value} href={`/a/${archiveId}?category=${value}#entries`} aria-current={category === value ? 'page' : undefined}>{label}</a>)}</div>
        </details>
      </nav>
      <section id="entries" aria-label="chronological archive">
        {entries.length ? entries.map(entry => <Entry key={entry.id} entry={entry} />) : <p className="empty">nothing here yet.</p>}
      </section>
      <footer><p>this is an archive, not an argument.</p><a href="/">create your own archive</a><form action={`/api/share/${archiveId}/lock`} method="post"><button className="text-button" type="submit">close the archive</button></form></footer>
    </main>;
  }

  return <main id="main" className="notebook shared-archive">
    <header className="shared-opening">
      <h1>{archive.title}</h1>
      {archive.subtitle && <p className="intro">{archive.subtitle}</p>}
    </header>
    <nav className="shared-filter" aria-label="archive view"><span>all entries</span></nav>
    <ArchiveCanvasView archive={{ id: archive.id, canvas: archive.canvas, items: archive.items }} />
    <footer><p>this is an archive, not an argument.</p><form action={`/api/share/${archiveId}/lock`} method="post"><button className="text-button" type="submit">close the archive</button></form></footer>
  </main>;
}

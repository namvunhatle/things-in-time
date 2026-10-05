import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import ArchiveEditor from '../../../components/ArchiveEditor';
import { claimArchiveOwner, readArchive } from '../../../lib/archive-store';
import { editorAccess } from '../../../lib/editor-access';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'archive editor' };

export default async function ArchiveEditorPage({ params }) {
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) notFound();
  const access = await editorAccess(archive, await cookies());
  if (!access.allowed) notFound();
  if (!archive.ownerId && access.account) await claimArchiveOwner(archive, access.account.id);

  return <main id="main" className="editor-shell">
    <ArchiveEditor archive={{ id: archive.id, title: archive.title, canvas: archive.canvas, items: archive.items }} />
  </main>;
}

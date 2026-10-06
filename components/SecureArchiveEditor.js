'use client';

import { useEffect, useState } from 'react';
import ArchiveEditor from './ArchiveEditor';
import PersonalArchiveEditor from './PersonalArchiveEditor';
import { createEncryptedMedia, encryptDocument, unlockWithRecovery } from '../lib/archive-crypto';

const categories = {
  all: 'all', understood: 'things i understood too late', miss: 'things i miss', songs: 'songs', home: 'our home', unsaid: 'things i never said',
};

function recoveryKeyFromStoredUrl(archiveId) {
  const stored = localStorage.getItem(`archive_recovery_${archiveId}`) || sessionStorage.getItem(`archive_recovery_${archiveId}`) || '';
  try {
    return new URLSearchParams(new URL(stored).hash.slice(1)).get('key') || '';
  } catch {
    return '';
  }
}

export default function SecureArchiveEditor({ archive }) {
  const [opened, setOpened] = useState(null);
  const [error, setError] = useState('decrypting your archive…');

  useEffect(() => {
    let active = true;
    async function open() {
      const recoveryKey = recoveryKeyFromStoredUrl(archive.id);
      if (!recoveryKey) {
        setError('open your recovery link in this browser.');
        return;
      }
      try {
        const result = await unlockWithRecovery(archive, recoveryKey);
        if (active) setOpened({ ...result, recoveryKey });
      } catch {
        if (active) setError('that recovery key could not open this archive.');
      }
    }
    open();
    return () => { active = false; };
  }, [archive]);

  if (!opened) return <div className="gate"><p className="eyebrow">archive editor</p><h1>{error}</h1></div>;

  const secure = {
    dataKey: opened.dataKey,
    async save(document) {
      const encrypted = await encryptDocument(archive.id, opened.dataKey, document);
      const response = await fetch(`/api/archives/${archive.id}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: encrypted }),
      });
      if (!response.ok) throw new Error('save failed');
    },
    async upload(file) {
      const encrypted = await createEncryptedMedia(archive.id, opened.dataKey, await file.arrayBuffer());
      const form = new FormData();
      form.set('fileName', encrypted.fileName);
      form.set('file', encrypted.blob, encrypted.fileName);
      const response = await fetch(`/api/archives/${archive.id}/media`, { method: 'POST', body: form });
      if (!response.ok) throw new Error('upload failed');
      return encrypted.fileName;
    },
  };
  const identity = { id: archive.id, shareSlug: archive.shareSlug, ...opened.document };
  if (opened.document.presentation === 'timeline') {
    return <PersonalArchiveEditor archive={identity} entries={opened.document.entries || []} categories={categories} secure={secure} />;
  }
  return <ArchiveEditor archive={identity} secure={secure} />;
}

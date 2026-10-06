'use client';

import { useEffect, useState } from 'react';

export default function RecentArchives() {
  const [archives, setArchives] = useState([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('archive_recent') || '[]');
      const valid = saved.filter(item => {
        if (!/^[a-zA-Z0-9_-]{16,64}$/.test(item.id || '')) return false;
        // encrypted archives open with the key kept on this device, no link needed
        if (item.encrypted) return true;
        const url = new URL(item.recoveryUrl, window.location.origin);
        return url.origin === window.location.origin && url.pathname === `/portal/${item.id}/claim` && url.hash.startsWith('#key=');
      });
      setArchives(valid);
    } catch {
      setArchives([]);
    }
  }, []);

  if (!archives.length) return null;
  return <section className="recent-archives">
    <p className="eyebrow">saved on this browser</p>
    <ul>{archives.map(archive => <li key={archive.id}>
      <span>{archive.title || 'untitled archive'}</span>
      <div><a href={archive.encrypted ? `/portal/${archive.id}` : archive.recoveryUrl}>continue editing</a>{!archive.encrypted && <a href={`/a/${archive.shareSlug || archive.id}`} target="_blank" rel="noreferrer">view ↗</a>}</div>
    </li>)}</ul>
  </section>;
}

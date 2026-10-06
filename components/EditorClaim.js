'use client';

import { useEffect, useState } from 'react';
import { editorAuthSecret } from '../lib/archive-crypto';

export default function EditorClaim({ archiveId, archiveTitle, shareSlug, encrypted = false }) {
  const [message, setMessage] = useState('securing your editor…');
  const [needsKey, setNeedsKey] = useState(false);
  const [manualKey, setManualKey] = useState('');

  async function claimKey(key, recoveryUrl) {
    const credential = encrypted ? await editorAuthSecret(archiveId, key) : key;
    const response = await fetch(`/api/archives/${archiveId}/editor-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: credential }),
    });
    if (!response.ok) throw new Error('editor access denied.');
    localStorage.setItem(`archive_recovery_${archiveId}`, recoveryUrl);
    const recent = JSON.parse(localStorage.getItem('archive_recent') || '[]').filter(item => item.id !== archiveId);
    recent.unshift({ id: archiveId, shareSlug, title: archiveTitle, recoveryUrl, lastOpened: new Date().toISOString() });
    localStorage.setItem('archive_recent', JSON.stringify(recent.slice(0, 20)));
    window.location.replace(`/portal/${archiveId}`);
  }

  useEffect(() => {
    let active = true;
    async function claim() {
      let recoveryUrl = window.location.href;
      let key = new URLSearchParams(window.location.hash.slice(1)).get('key');
      if (!key) {
        const stored = localStorage.getItem(`archive_recovery_${archiveId}`) || sessionStorage.getItem(`archive_recovery_${archiveId}`);
        if (stored) {
          recoveryUrl = stored;
          key = new URLSearchParams(new URL(stored).hash.slice(1)).get('key');
        }
      }
      if (!key) {
        setMessage(encrypted ? 'enter your recovery key.' : 'open the private editor link once in this browser.');
        setNeedsKey(encrypted);
        return;
      }
      try {
        await claimKey(key, recoveryUrl);
      } catch (error) {
        if (active) {
          setMessage(error.message || 'editor access denied.');
          setNeedsKey(encrypted);
        }
      }
    }
    claim();
    return () => { active = false; };
  }, [archiveId, archiveTitle, shareSlug]);

  async function recover(event) {
    event.preventDefault();
    setNeedsKey(false);
    setMessage('checking your recovery key…');
    try {
      const key = manualKey.trim();
      const recoveryUrl = `${window.location.origin}/portal/${archiveId}/claim#key=${encodeURIComponent(key)}`;
      await claimKey(key, recoveryUrl);
    } catch (error) {
      setMessage(error.message || 'that recovery key didn’t work.');
      setNeedsKey(true);
    }
  }

  return <main id="main" className="gate"><p className="eyebrow">archive editor</p><h1>{message}</h1>{needsKey && <form onSubmit={recover}><label htmlFor="recovery-key">recovery key</label><div className="gate-input"><input id="recovery-key" value={manualKey} onChange={event => setManualKey(event.target.value)} required autoComplete="off" spellCheck="false" placeholder="tit_…" /><button type="submit">recover</button></div></form>}</main>;
}

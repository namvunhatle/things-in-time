'use client';

import { useEffect, useState } from 'react';
import { editorAuthSecret, unwrapWithRecovery } from '../lib/archive-crypto';
import { rememberArchive, saveArchiveKey } from '../lib/key-vault';

async function requestEditorSession(archiveId, credential) {
  const response = await fetch(`/api/archives/${archiveId}/editor-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: credential }),
  });
  if (response.status === 429) throw new Error('too many attempts. try again later.');
  if (!response.ok) throw new Error('that recovery key didn’t work.');
  return response.json();
}

// Encrypted archive: the recovery key proves ownership and unwraps the data key, which is then
// kept on this device as a non-extractable key. The recovery key itself is never stored.
async function claimEncrypted(archiveId, shareSlug, recoveryKey) {
  const session = await requestEditorSession(archiveId, await editorAuthSecret(archiveId, recoveryKey));
  const dataKey = await unwrapWithRecovery(archiveId, session.recoveryWrap, recoveryKey);
  await saveArchiveKey(archiveId, dataKey);
  rememberArchive({ id: archiveId, shareSlug });
  window.location.replace(`/portal/${archiveId}`);
}

// Legacy (unencrypted) archive: unchanged, the private editor link is remembered.
async function claimLegacy(archiveId, archiveTitle, shareSlug, key, recoveryUrl) {
  await requestEditorSession(archiveId, key);
  localStorage.setItem(`archive_recovery_${archiveId}`, recoveryUrl);
  const recent = JSON.parse(localStorage.getItem('archive_recent') || '[]').filter(item => item.id !== archiveId);
  recent.unshift({ id: archiveId, shareSlug, title: archiveTitle, recoveryUrl, lastOpened: new Date().toISOString() });
  localStorage.setItem('archive_recent', JSON.stringify(recent.slice(0, 20)));
  window.location.replace(`/portal/${archiveId}`);
}

export default function EditorClaim({ archiveId, archiveTitle, shareSlug, encrypted = false }) {
  const [message, setMessage] = useState(encrypted ? 'enter your recovery key.' : 'securing your editor…');
  const [busy, setBusy] = useState(false);
  const [manualKey, setManualKey] = useState('');

  useEffect(() => {
    let active = true;
    async function claim() {
      const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('key');
      if (encrypted) {
        // a recovery key pasted as a link: use it once, and take it out of the address bar and history
        if (fromHash) {
          window.history.replaceState(null, '', window.location.pathname);
          setManualKey(fromHash);
        }
        return;
      }
      let recoveryUrl = window.location.href;
      let key = fromHash;
      if (!key) {
        const stored = localStorage.getItem(`archive_recovery_${archiveId}`) || sessionStorage.getItem(`archive_recovery_${archiveId}`);
        if (stored) {
          recoveryUrl = stored;
          key = new URLSearchParams(new URL(stored).hash.slice(1)).get('key');
        }
      }
      if (!key) {
        setMessage('open the private editor link once in this browser.');
        return;
      }
      try {
        await claimLegacy(archiveId, archiveTitle, shareSlug, key, recoveryUrl);
      } catch (error) {
        if (active) setMessage(error.message || 'editor access denied.');
      }
    }
    claim();
    return () => { active = false; };
  }, [archiveId, archiveTitle, shareSlug, encrypted]);

  async function recover(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('checking your recovery key…');
    try {
      await claimEncrypted(archiveId, shareSlug, manualKey.trim());
    } catch (error) {
      setMessage(error.message === 'too many attempts. try again later.' ? error.message : 'that recovery key didn’t work.');
      setBusy(false);
    }
  }

  return <main id="main" className="gate"><p className="eyebrow">archive editor</p><h1>{message}</h1>{encrypted && <form onSubmit={recover}><label htmlFor="recovery-key">recovery key</label><div className="gate-input"><input id="recovery-key" value={manualKey} onChange={event => setManualKey(event.target.value)} required autoComplete="off" spellCheck="false" placeholder="tit_…" /><button type="submit" disabled={busy}>{busy ? 'opening…' : 'open'}</button></div></form>}</main>;
}

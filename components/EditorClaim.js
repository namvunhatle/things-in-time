'use client';

import { useEffect, useState } from 'react';

export default function EditorClaim({ archiveId }) {
  const [message, setMessage] = useState('securing your editor…');

  useEffect(() => {
    let active = true;
    async function claim() {
      const recoveryUrl = window.location.href;
      const key = new URLSearchParams(window.location.hash.slice(1)).get('key');
      if (!key) {
        setMessage('this editor recovery link is incomplete.');
        return;
      }
      try {
        const response = await fetch(`/api/archives/${archiveId}/editor-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        });
        if (!response.ok) throw new Error('editor access denied.');
        sessionStorage.setItem(`archive_recovery_${archiveId}`, recoveryUrl);
        window.location.replace(`/portal/${archiveId}`);
      } catch (error) {
        if (active) setMessage(error.message || 'editor access denied.');
      }
    }
    claim();
    return () => { active = false; };
  }, [archiveId]);

  return <main id="main" className="gate"><p className="eyebrow">archive editor</p><h1>{message}</h1></main>;
}

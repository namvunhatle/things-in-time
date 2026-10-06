'use client';

import { useEffect, useState } from 'react';
import { decryptMedia } from '../lib/archive-crypto';

export default function EncryptedImage({ archiveId, fileName, dataKey, contentType, alt = '', ...props }) {
  const [source, setSource] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    async function load() {
      try {
        const response = await fetch(`/api/archive-media/${archiveId}/${fileName}`, { cache: 'no-store' });
        if (!response.ok) throw new Error();
        const plaintext = await decryptMedia(archiveId, fileName, dataKey, await response.arrayBuffer());
        objectUrl = URL.createObjectURL(new Blob([plaintext], { type: contentType || 'application/octet-stream' }));
        if (active) setSource(objectUrl);
      } catch {
        if (active) setSource('');
      }
    }
    load();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [archiveId, fileName, dataKey, contentType]);

  if (!source) return <span className="encrypted-image-loading" role="img" aria-label={alt || 'encrypted image'} />;
  return <img {...props} src={source} alt={alt} />;
}

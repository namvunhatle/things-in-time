// The site's first archive predates the portal and still has a few legacy paths: plaintext
// published_entries, photos under one shared Blob prefix, and the /unlock shortcut. Which archive
// that is lives in env, not in the code. Unset, all of these paths are off.
export const personalArchive = {
  ownerId: process.env.PERSONAL_OWNER_ID || '',
  archiveId: process.env.PERSONAL_ARCHIVE_ID || '',
  shareSlug: process.env.PERSONAL_ARCHIVE_SLUG || '',
};

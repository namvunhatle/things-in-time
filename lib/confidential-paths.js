import path from 'node:path';

export const confidentialRoot = process.env.CONFIDENTIAL_DATA_DIR
  ? path.resolve(process.env.CONFIDENTIAL_DATA_DIR)
  : path.join(process.cwd(), '.confidential');

export const confidentialEntriesDirectory = path.join(confidentialRoot, 'entries');
export const confidentialPhotosDirectory = path.join(confidentialRoot, 'photos');

'use client';

// Phone photos are often 3–12 MB, and Vercel functions refuse request bodies over 4.5 MB. So every
// photo is re-encoded in the browser before it is encrypted: at most 2560px on the long edge, as
// JPEG. Re-encoding also drops EXIF metadata (GPS location, camera serial) from the stored copy.
const MAX_EDGE = 2560;
const MAX_UPLOAD = 4 * 1024 * 1024;
const IMAGE_NAME = /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i;

export function isImageFile(file) {
  // some Android pickers hand over photos with an empty MIME type
  return file.type.startsWith('image/') || (!file.type && IMAGE_NAME.test(file.name || ''));
}

function encode(canvas, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function prepareImage(file) {
  // GIFs keep their animation, so they are passed through untouched
  if (file.type === 'image/gif') {
    if (file.size > MAX_UPLOAD) throw new Error('this GIF is over 4 MB. try a smaller one.');
    return { blob: file, contentType: 'image/gif' };
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('this photo format couldn’t be read. try a JPEG or PNG.');
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    // JPEG has no transparency: paper-coloured background behind transparent PNGs
    context.fillStyle = '#fffdf7';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.58]) {
      const blob = await encode(canvas, quality);
      if (blob && blob.size <= MAX_UPLOAD) return { blob, contentType: 'image/jpeg' };
    }
    throw new Error('this photo is too large to upload.');
  } finally {
    bitmap.close();
  }
}

export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export function validateUploadSource(file: Pick<File, 'size' | 'type'>): string | null {
  if (!file.size) return 'Choose a nonempty image.';
  if (file.size > MAX_SOURCE_BYTES) return 'Choose an image up to 20 MB.';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPEG, PNG, or WebP image.';
  return null;
}

// Keep multipart requests below the server's 3 MB transport limit. The server
// independently validates and sanitizes the resulting image before storage.
export async function prepareUploadImage(file: File): Promise<File> {
  const error = validateUploadSource(file);
  if (error) throw new Error(error);
  if (file.size <= MAX_UPLOAD_BYTES) return file;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('This image could not be read. Choose a still JPEG, PNG, or WebP image.'); }
  try {
    if (bitmap.width * bitmap.height > 20_000_000) throw new Error('Choose an image under 20 megapixels.');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this image. Try a smaller file.');
    context.fillStyle = '#faf8f3';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new Error('This image is still too large after resizing. Choose a smaller image.');
    return new File([blob], 'upload.jpg', { type: 'image/jpeg' });
  } finally { bitmap.close(); }
}

import sharp from "sharp";

export async function prepareGalleryImage(photo: File, maxBytes: number): Promise<Buffer> {
  if (photo.size === 0 || photo.size > maxBytes) throw new Error("Choose a photo up to 2 MB.");
  const formats: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
  if (!formats[photo.type]) throw new Error("Choose a JPEG, PNG, or WebP photo.");
  try {
    const input = sharp(Buffer.from(await photo.arrayBuffer()), { limitInputPixels: 20_000_000, failOn: "warning" });
    const metadata = await input.metadata();
    if (metadata.format !== formats[photo.type] || (metadata.pages ?? 1) > 1) throw new Error("Invalid image format");
    // Decode and re-encode; apply orientation before dropping camera metadata.
    const output = await input.rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#faf8f3" }).jpeg({ quality: 85 }).toBuffer();
    if (output.length > maxBytes) throw new Error("Image too large");
    return output;
  } catch {
    throw new Error("This image could not be read. Choose a still JPEG, PNG, or WebP photo under 20 megapixels.");
  }
}

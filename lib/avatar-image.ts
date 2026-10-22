import sharp from "sharp";
import { prepareGalleryImage } from "./gallery-image.ts";
import { MAX_AVATAR_BYTES } from "./profile-validation.ts";

export async function prepareAvatarImage(photo: File): Promise<Buffer> {
  const sanitized = await prepareGalleryImage(photo, MAX_AVATAR_BYTES);
  return sharp(sanitized).resize(512, 512, { fit: "cover", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}

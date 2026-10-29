export const MAX_GALLERY_BYTES = 2 * 1024 * 1024;
export const GALLERY_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateGalleryFields(form: FormData) {
  if (form.get("publish_publicly") !== "on") return null;
  const title = form.get("title");
  const description = form.get("description");
  const alt = form.get("alt_text");
  if (typeof title !== "string" || typeof description !== "string" || typeof alt !== "string") return null;
  const fields = { title: title.trim(), description: description.trim(), alt_text: alt.trim() };
  if (!fields.title || !fields.alt_text || Array.from(fields.title).length > 120
    || Array.from(fields.description).length > 1000 || Array.from(fields.alt_text).length > 300) return null;
  return fields;
}

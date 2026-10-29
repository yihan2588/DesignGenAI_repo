export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export function isProfileComplete(profile: { first_name: string | null; last_name: string | null }) {
  return Boolean(profile.first_name?.trim() && profile.last_name?.trim());
}

export function validateNames(first: unknown, last: unknown) {
  if (typeof first !== "string" || typeof last !== "string") return null;
  const firstName = first.trim();
  const lastName = last.trim();
  if (!firstName || !lastName || Array.from(firstName).length > 80 || Array.from(lastName).length > 80) return null;
  return { first_name: firstName, last_name: lastName };
}

export function avatarExtension(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (type === "image/png" && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) return "png";
  if (type === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

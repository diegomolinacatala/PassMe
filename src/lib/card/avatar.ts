/**
 * Avatar storage paths: "<user-id>/<file>.<ext>" inside the public "avatars"
 * bucket. Keep in sync with profiles_avatar_path_owner in the migration and
 * the storage policies (first folder must equal auth.uid()).
 */

const AVATAR_FILE_RE = /^[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$/;

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_SIZE_PX = 512;

export function isValidAvatarPath(path: string, userId: string): boolean {
  const parts = path.split("/");
  return parts.length === 2 && parts[0] === userId && AVATAR_FILE_RE.test(parts[1]!);
}

export function newAvatarPath(userId: string, now: number = Date.now()): string {
  return `${userId}/avatar-${now.toString(36)}.jpg`;
}

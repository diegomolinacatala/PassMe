/**
 * Avatar storage paths: "<user-id>/<file>.<ext>" inside the public "avatars"
 * bucket. Keep in sync with profiles_avatar_path_owner in the migration and
 * the storage policies (first folder must equal auth.uid()).
 */

const AVATAR_FILE_RE = /^[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$/;

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
/** Photos are shown at 88 px (264 px on a 3x screen); the wallet strip and the OG image need at most ~250 px. */
export const AVATAR_SIZE_PX = 320;

export function isValidAvatarPath(path: string, userId: string): boolean {
  const parts = path.split("/");
  return parts.length === 2 && parts[0] === userId && AVATAR_FILE_RE.test(parts[1]!);
}

export function newAvatarPath(userId: string, now: number = Date.now()): string {
  return `${userId}/avatar-${now.toString(36)}.jpg`;
}

/**
 * Generate a default profile picture using DiceBear thumbs style.
 *
 * Returns a deterministic SVG data URI based on the user's name.
 * Use this anywhere an avatar is displayed and the user has not
 * uploaded a custom profile picture.
 */
import { createAvatar } from '@dicebear/core'
import * as thumbs from '@dicebear/thumbs'

/**
 * Generate a DiceBear thumbs avatar as a data URI.
 *
 * @param seed - Deterministic seed (typically the user's first name or full name)
 * @returns `data:image/svg+xml;utf8,...` string suitable for `<img src>` or `AvatarImage`
 */
export function getDefaultAvatarUri(seed: string): string {
  const avatar = createAvatar(thumbs, { seed })
  return avatar.toDataUri()
}

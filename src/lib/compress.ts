/**
 * Image compression utility using browser-image-compression.
 *
 * Compresses JPEG, PNG, WebP, and BMP images client-side before upload.
 * GIF files are skipped (animated GIFs break during re-encoding).
 * Non-image files pass through unchanged.
 */
import imageCompression from 'browser-image-compression'

// ---------------------------------------------------------------------------
// Compressible MIME types
// ---------------------------------------------------------------------------

const COMPRESSIBLE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
])

// ---------------------------------------------------------------------------
// Preset configurations
// ---------------------------------------------------------------------------

/** Compression options for avatar / profile picture uploads. */
export const AVATAR_COMPRESSION = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 512,
  useWebWorker: true,
  preserveExif: false,
} as const

/** Compression options for general image uploads (form file fields). */
export const GENERAL_COMPRESSION = {
  maxSizeMB: 2,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  preserveExif: true,
} as const

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compress an image file if its MIME type is compressible.
 *
 * Returns the compressed file (same format, same extension) or the
 * original file unchanged if compression is not applicable.
 *
 * @param file - The file to compress.
 * @param preset - Which compression preset to use (default: 'general').
 */
export async function compressImage(
  file: File,
  preset: 'avatar' | 'general' = 'general',
): Promise<File> {
  if (!COMPRESSIBLE_TYPES.has(file.type)) {
    return file
  }

  const options = preset === 'avatar' ? AVATAR_COMPRESSION : GENERAL_COMPRESSION

  const compressed = await imageCompression(file, {
    ...options,
    fileType: file.type,
  })

  // Only use the compressed version if it's actually smaller
  if (compressed.size >= file.size) {
    return file
  }

  return compressed
}

/**
 * Check whether a file is a compressible image type.
 */
export function isCompressibleImage(file: File): boolean {
  return COMPRESSIBLE_TYPES.has(file.type)
}

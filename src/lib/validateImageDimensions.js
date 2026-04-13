import { imageSize } from 'image-size';

/**
 * Validate minimum dimensions for uploaded product images.
 * Allows either orientation (handles rotated images).
 *
 * @param {Buffer} buffer
 * @param {{ minWidth: number; minHeight: number }} min
 */
export function assertMinImageDimensions(buffer, { minWidth, minHeight }) {
  let dims;
  try {
    dims = imageSize(buffer);
  } catch {
    const err = new Error('Unable to read image dimensions');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const w = Number(dims?.width || 0);
  const h = Number(dims?.height || 0);
  const ok = (w >= minWidth && h >= minHeight) || (w >= minHeight && h >= minWidth);
  if (!ok) {
    const err = new Error(`Image must be at least ${minWidth}×${minHeight}`);
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = { width: w, height: h, minWidth, minHeight };
    throw err;
  }
}


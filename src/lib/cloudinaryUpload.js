import { Readable } from 'stream';
import { v2 as cloudinary } from 'cloudinary';

/** Cloudinary client defaults to 60s; allow up to 2 minutes for slower uploads (override with CLOUDINARY_UPLOAD_TIMEOUT_MS). */
const DEFAULT_UPLOAD_TIMEOUT_MS = 120000;

export function isCloudinaryConfigured() {
  if (process.env.CLOUDINARY_URL && process.env.CLOUDINARY_URL.trim()) {
    return true;
  }
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  return Boolean(
    CLOUDINARY_CLOUD_NAME?.trim() &&
      CLOUDINARY_API_KEY?.trim() &&
      CLOUDINARY_API_SECRET?.trim()
  );
}

/**
 * @throws {Error} with statusCode 503 if env is missing
 */
export function assertCloudinaryConfigured() {
  if (!isCloudinaryConfigured()) {
    const err = new Error(
      'Cloudinary is not configured. Set CLOUDINARY_URL (or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).'
    );
    err.statusCode = 503;
    err.code = 'CLOUDINARY_NOT_CONFIGURED';
    throw err;
  }
}

/**
 * Apply credentials without clobbering CLOUDINARY_URL: explicit object config
 * with undefined keys was wiping api_key when only CLOUDINARY_URL was set.
 */
function ensureSdkConfig() {
  if (process.env.CLOUDINARY_URL?.trim()) {
    cloudinary.config(true);
    return;
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * Safe segment for Cloudinary public_id (folder is separate).
 * @param {string} productId
 */
function safePublicIdSegment(productId) {
  return String(productId)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 100) || 'product';
}

function extensionFromMime(mimeType) {
  const m = String(mimeType).toLowerCase();
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  return 'jpg';
}

/**
 * Upload a product image buffer to Cloudinary (one asset per productId; replaces on re-upload).
 * Uses upload_stream with raw bytes (faster than base64 data-URI) and a configurable timeout
 * so large photos do not hit Cloudinary’s default 60s limit.
 * @param {Buffer} buffer
 * @param {{ productId: string; mimeType: string }} opts
 * @returns {Promise<{ secureUrl: string; publicId: string }>}
 */
export async function uploadProductImageBuffer(buffer, { productId, mimeType }) {
  assertCloudinaryConfigured();
  ensureSdkConfig();

  const publicId = safePublicIdSegment(productId);
  const timeout = Number(process.env.CLOUDINARY_UPLOAD_TIMEOUT_MS || DEFAULT_UPLOAD_TIMEOUT_MS);
  const filename = `product.${extensionFromMime(mimeType)}`;

  // v2: upload_stream(options, callback) — stream raw buffer, not base64 (~33% smaller payload).
  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'raabta/products',
        public_id: publicId,
        resource_type: 'image',
        overwrite: true,
        invalidate: true,
        timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_UPLOAD_TIMEOUT_MS,
        filename,
      },
      (err, res) => {
        if (err) return reject(err);
        if (res?.error) return reject(res.error);
        resolve(res);
      }
    );

    Readable.from(buffer)
      .on('error', reject)
      .pipe(uploadStream)
      .on('error', reject);
  });

  const secureUrl = result.secure_url;
  const fullPublicId = result.public_id;
  if (!secureUrl || !fullPublicId) {
    const err = new Error('Cloudinary upload did not return a URL');
    err.statusCode = 502;
    err.code = 'CLOUDINARY_UPLOAD_FAILED';
    throw err;
  }

  return { secureUrl, publicId: fullPublicId };
}

/**
 * Remove an image from Cloudinary by full public_id (e.g. raabta/products/foo).
 * @param {string} publicId
 */
export async function destroyProductImage(publicId) {
  if (!publicId || typeof publicId !== 'string') return;
  assertCloudinaryConfigured();
  ensureSdkConfig();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch {
    // Best-effort cleanup; ignore if already deleted
  }
}

import multer from 'multer';

// Product image uploads are used for storefront cards; keep them lightweight.
const MAX_MB = Number(process.env.MAX_PRODUCT_IMAGE_MB || process.env.MAX_UPLOAD_MB || 1);

const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype || '');
  if (ok) cb(null, true);
  else cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'));
}

/** In-memory upload; buffers are persisted on the Product document (see product.service). */
export const uploadProductImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

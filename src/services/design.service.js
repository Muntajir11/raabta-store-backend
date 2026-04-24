import { Counter } from '../models/counter.model.js';
import { CustomDesign } from '../models/customDesign.model.js';
import { assertCloudinaryConfigured, uploadProductImageBuffer } from '../lib/cloudinaryUpload.js';
import { User } from '../models/user.model.js';

function pad(n, width) {
  return String(n).padStart(width, '0');
}

async function nextDesignId({ session } = {}) {
  const doc = await Counter.findByIdAndUpdate(
    { _id: 'design' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, ...(session ? { session } : {}) }
  ).lean();
  const seq = Number(doc?.seq || 0);
  return `DSN-${pad(seq, 6)}`;
}

/**
 * @param {string} userId
 * @param {{
 *   productId: string;
 *   gsm: number;
 *   size: string;
 *   color: string;
 *   sides: Array<{ view: string; hasPrint: boolean; printSize?: string; guidePositionId?: string }>;
 *   designJson: string;
 *   blankRs: number;
 *   totalRs: number;
 *   artwork?: Array<{ view: string; buffer: Buffer; mimeType: string }>;
 *   previews?: Array<{ view: string; buffer: Buffer; mimeType: string }>;
 * }} input
 */
export async function createDesignAfterCheckout(userId, input) {
  assertCloudinaryConfigured();

  const user = await User.findById(userId).select('name email').lean();
  if (!user) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const designId = await nextDesignId();

  const artworkAssets = [];
  const previewImages = [];

  const uploadAsset = async (asset, kind) => {
    const { secureUrl, publicId } = await uploadProductImageBuffer(asset.buffer, {
      productId: `${designId}-${kind}-${asset.view}`,
      mimeType: asset.mimeType,
    });
    return { view: asset.view, kind, url: secureUrl, publicId };
  };

  if (Array.isArray(input.artwork)) {
    for (const a of input.artwork) {
      artworkAssets.push(await uploadAsset(a, 'artwork'));
    }
  }
  if (Array.isArray(input.previews)) {
    for (const p of input.previews) {
      previewImages.push(await uploadAsset(p, 'preview'));
    }
  }

  const doc = await CustomDesign.create({
    designId,
    userId,
    status: 'new',
    productId: String(input.productId).trim(),
    gsm: Number(input.gsm),
    size: String(input.size).trim(),
    color: String(input.color).trim(),
    sides: Array.isArray(input.sides) ? input.sides : [],
    designJson: String(input.designJson),
    artworkAssets,
    previewImages,
    pricing: {
      blankRs: Number(input.blankRs) || 0,
      totalRs: Number(input.totalRs) || 0,
    },
    customerSnapshot: {
      name: user.name || '',
      email: user.email || '',
    },
  });

  return { id: doc.designId };
}


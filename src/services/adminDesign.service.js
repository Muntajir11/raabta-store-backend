import { z } from 'zod';
import { CustomDesign } from '../models/customDesign.model.js';

const DESIGN_STATUSES = ['new', 'reviewed', 'approved', 'rejected', 'printed'];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listDto(d) {
  const totalRs = d?.pricing?.totalRs ?? 0;
  const customerName = d?.customerSnapshot?.name ?? '';
  const customerEmail = d?.customerSnapshot?.email ?? '';
  const sides = Array.isArray(d?.sides) ? d.sides : [];
  const prints = sides.filter((s) => Boolean(s?.hasPrint)).length;
  return {
    id: d.designId,
    designId: d.designId,
    createdAt: d.createdAt,
    customerName,
    customerEmail,
    productId: d.productId,
    gsm: d.gsm,
    sides,
    prints,
    status: d.status,
    totalRs,
  };
}

function detailDto(d) {
  return {
    id: d.designId,
    designId: d.designId,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    userId: String(d.userId),
    status: d.status,
    adminNote: d.adminNote || '',
    productId: d.productId,
    gsm: d.gsm,
    size: d.size,
    color: d.color,
    sides: d.sides || [],
    designJson: d.designJson,
    artworkAssets: d.artworkAssets || [],
    previewImages: d.previewImages || [],
    pricing: d.pricing,
    customerSnapshot: d.customerSnapshot || { name: '', email: '' },
  };
}

export const designPatchSchema = z
  .object({
    status: z.enum(DESIGN_STATUSES).optional(),
    adminNote: z.string().max(2000).optional(),
  })
  .strict();

/**
 * @param {{ q?: string; status?: string; page?: number; limit?: number }} input
 */
export async function listDesignsAdmin(input = {}) {
  const page = Math.max(1, Math.floor(Number(input.page || 1)));
  const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit || 30))));
  const skip = (page - 1) * limit;

  const match = {};
  const q = typeof input.q === 'string' ? input.q.trim() : '';
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    match.$or = [
      { designId: rx },
      { productId: rx },
      { 'customerSnapshot.name': rx },
      { 'customerSnapshot.email': rx },
    ];
  }
  if (typeof input.status === 'string' && DESIGN_STATUSES.includes(input.status)) {
    match.status = input.status;
  }

  const [items, total] = await Promise.all([
    CustomDesign.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CustomDesign.countDocuments(match),
  ]);

  return { items: items.map(listDto), page, limit, total };
}

export async function getDesignAdmin(designId) {
  const id = String(designId || '').trim();
  if (!id) {
    const err = new Error('Design not found');
    err.statusCode = 404;
    err.code = 'DESIGN_NOT_FOUND';
    throw err;
  }
  const d = await CustomDesign.findOne({ designId: id }).lean();
  if (!d) {
    const err = new Error('Design not found');
    err.statusCode = 404;
    err.code = 'DESIGN_NOT_FOUND';
    throw err;
  }
  return detailDto(d);
}

export async function patchDesignAdmin(designId, patch) {
  const id = String(designId || '').trim();
  if (!id) {
    const err = new Error('Design not found');
    err.statusCode = 404;
    err.code = 'DESIGN_NOT_FOUND';
    throw err;
  }
  const keys = Object.keys(patch || {});
  if (keys.length === 0) {
    const err = new Error('No fields to update');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const updated = await CustomDesign.findOneAndUpdate({ designId: id }, { $set: patch }, { new: true }).lean();
  if (!updated) {
    const err = new Error('Design not found');
    err.statusCode = 404;
    err.code = 'DESIGN_NOT_FOUND';
    throw err;
  }
  return detailDto(updated);
}


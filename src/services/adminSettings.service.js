import { z } from 'zod';
import { StoreSettings } from '../models/storeSettings.model.js';

const ONLINE_PAYMENTS = ['coming_soon', 'enabled', 'disabled'];

export const storeSettingsPatchSchema = z.object({
  storeProfile: z
    .object({
      supportEmail: z.string().trim().email().max(120).optional(),
      phone: z.string().trim().max(40).optional(),
      address: z.string().trim().max(200).optional(),
    })
    .optional(),
  shipping: z
    .object({
      defaultFeeInr: z.number().int().min(0).optional(),
      freeShippingThresholdInr: z.number().int().min(0).optional(),
      dispatchSlaDays: z.number().int().min(0).max(60).optional(),
      originPincode: z
        .string()
        .trim()
        .optional()
        .refine((v) => v === undefined || v === '' || /^\d{6}$/.test(v), { message: 'Origin pincode must be 6 digits' }),
      defaultItemWeightGrams: z.number().int().min(1).optional(),
      defaultItemDimsCm: z
        .object({
          length: z.number().min(0.1).optional(),
          width: z.number().min(0.1).optional(),
          height: z.number().min(0.1).optional(),
        })
        .optional(),
      fallbackFeeInr: z.number().int().min(0).optional(),
    })
    .optional(),
  payments: z
    .object({
      codEnabled: z.boolean().optional(),
      onlinePayments: z.enum(ONLINE_PAYMENTS).optional(),
    })
    .optional(),
});

function defaults() {
  return {
    storeProfile: {
      supportEmail: 'support@raabta.store',
      phone: '',
      address: 'India',
    },
    shipping: {
      defaultFeeInr: 199,
      freeShippingThresholdInr: 1499,
      dispatchSlaDays: 2,
      originPincode: '',
      defaultItemWeightGrams: 250,
      defaultItemDimsCm: { length: 25.4, width: 30.48, height: 5.08 },
      fallbackFeeInr: 199,
    },
    payments: {
      codEnabled: true,
      onlinePayments: 'coming_soon',
    },
  };
}

function dto(doc) {
  return {
    storeProfile: doc.storeProfile,
    shipping: doc.shipping,
    payments: doc.payments,
    updatedAt: doc.updatedAt,
  };
}

export async function getStoreSettings() {
  let doc = await StoreSettings.findOne({}).lean();
  if (!doc) {
    const created = await StoreSettings.create(defaults());
    doc = created.toObject();
  }
  return dto(doc);
}

/**
 * @param {{
 *  storeProfile?: { supportEmail?: string; phone?: string; address?: string };
 *  shipping?: {
 *    defaultFeeInr?: number;
 *    freeShippingThresholdInr?: number;
 *    dispatchSlaDays?: number;
 *    originPincode?: string;
 *    defaultItemWeightGrams?: number;
 *    defaultItemDimsCm?: { length?: number; width?: number; height?: number };
 *    fallbackFeeInr?: number;
 *  };
 *  payments?: { codEnabled?: boolean; onlinePayments?: 'coming_soon'|'enabled'|'disabled' };
 * }} patch
 */
export async function updateStoreSettings(patch = {}) {
  const set = {};
  if (patch.storeProfile) {
    if (patch.storeProfile.supportEmail !== undefined)
      set['storeProfile.supportEmail'] = patch.storeProfile.supportEmail;
    if (patch.storeProfile.phone !== undefined) set['storeProfile.phone'] = patch.storeProfile.phone;
    if (patch.storeProfile.address !== undefined) set['storeProfile.address'] = patch.storeProfile.address;
  }
  if (patch.shipping) {
    if (patch.shipping.defaultFeeInr !== undefined)
      set['shipping.defaultFeeInr'] = patch.shipping.defaultFeeInr;
    if (patch.shipping.freeShippingThresholdInr !== undefined)
      set['shipping.freeShippingThresholdInr'] = patch.shipping.freeShippingThresholdInr;
    if (patch.shipping.dispatchSlaDays !== undefined)
      set['shipping.dispatchSlaDays'] = patch.shipping.dispatchSlaDays;
    if (patch.shipping.originPincode !== undefined)
      set['shipping.originPincode'] = patch.shipping.originPincode;
    if (patch.shipping.defaultItemWeightGrams !== undefined)
      set['shipping.defaultItemWeightGrams'] = patch.shipping.defaultItemWeightGrams;
    if (patch.shipping.fallbackFeeInr !== undefined)
      set['shipping.fallbackFeeInr'] = patch.shipping.fallbackFeeInr;
    if (patch.shipping.defaultItemDimsCm) {
      if (patch.shipping.defaultItemDimsCm.length !== undefined)
        set['shipping.defaultItemDimsCm.length'] = patch.shipping.defaultItemDimsCm.length;
      if (patch.shipping.defaultItemDimsCm.width !== undefined)
        set['shipping.defaultItemDimsCm.width'] = patch.shipping.defaultItemDimsCm.width;
      if (patch.shipping.defaultItemDimsCm.height !== undefined)
        set['shipping.defaultItemDimsCm.height'] = patch.shipping.defaultItemDimsCm.height;
    }
  }
  if (patch.payments) {
    if (patch.payments.codEnabled !== undefined) set['payments.codEnabled'] = patch.payments.codEnabled;
    if (patch.payments.onlinePayments !== undefined)
      set['payments.onlinePayments'] = patch.payments.onlinePayments;
  }

  if (Object.keys(set).length === 0) {
    const err = new Error('No fields to update');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Ensure a document exists (uses defaults on first access), then patch it.
  // Done in two steps to avoid MongoDB's "path conflict" when combining
  // dotted $set keys with a full-subdocument $setOnInsert in a single update.
  let existing = await StoreSettings.findOne({}).lean();
  if (!existing) {
    const created = await StoreSettings.create(defaults());
    existing = created.toObject();
  }

  const updated = await StoreSettings.findOneAndUpdate(
    { _id: existing._id },
    {
      $set: set,
      $unset: { 'payments.refundPolicyUrl': '', 'storeProfile.name': '' },
    },
    { new: true }
  ).lean();

  return dto(updated);
}


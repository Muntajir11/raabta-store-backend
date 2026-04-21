import mongoose from 'mongoose';

const storeProfileSchema = new mongoose.Schema(
  {
    supportEmail: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    address: { type: String, default: '', trim: true, maxlength: 200 },
  },
  { _id: false }
);

const shippingSchema = new mongoose.Schema(
  {
    defaultFeeInr: { type: Number, required: true, min: 0 },
    freeShippingThresholdInr: { type: Number, required: true, min: 0 },
    dispatchSlaDays: { type: Number, required: true, min: 0, max: 60 },
    originPincode: { type: String, trim: true, match: /^\d{6}$/, default: '' },
    defaultItemWeightGrams: { type: Number, min: 1, default: 250 },
    defaultItemDimsCm: {
      length: { type: Number, min: 0.1, default: 25.4 },
      width: { type: Number, min: 0.1, default: 30.48 },
      height: { type: Number, min: 0.1, default: 5.08 },
    },
    fallbackFeeInr: { type: Number, min: 0, default: 199 },
  },
  { _id: false }
);

const paymentsSchema = new mongoose.Schema(
  {
    codEnabled: { type: Boolean, default: true },
    onlinePayments: {
      type: String,
      enum: ['coming_soon', 'enabled', 'disabled'],
      default: 'coming_soon',
    },
  },
  { _id: false }
);

const storeSettingsSchema = new mongoose.Schema(
  {
    storeProfile: { type: storeProfileSchema, required: true },
    shipping: { type: shippingSchema, required: true },
    payments: { type: paymentsSchema, required: true },
  },
  { timestamps: true }
);

export const StoreSettings =
  mongoose.models.StoreSettings ?? mongoose.model('StoreSettings', storeSettingsSchema);


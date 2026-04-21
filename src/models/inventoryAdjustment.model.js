import mongoose from 'mongoose';

const inventoryAdjustmentSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, trim: true, maxlength: 120, index: true },
    size: { type: String, required: true, trim: true, maxlength: 20 },
    color: { type: String, required: true, trim: true, maxlength: 60 },
    gsm: { type: Number, required: true, enum: [180, 210, 240] },
    delta: { type: Number, required: true, min: -1000000, max: 1000000 },
    reason: {
      type: String,
      required: true,
      enum: ['manual', 'received', 'damage', 'correction', 'order', 'refund', 'cancel'],
      index: true,
    },
    note: { type: String, default: '', maxlength: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refType: { type: String, default: '', maxlength: 40 },
    refId: { type: String, default: '', maxlength: 120 },
  },
  { timestamps: true }
);

inventoryAdjustmentSchema.index({ productId: 1, size: 1, color: 1, gsm: 1, createdAt: -1 });
inventoryAdjustmentSchema.index({ reason: 1, createdAt: -1 });

export const InventoryAdjustment =
  mongoose.models.InventoryAdjustment ?? mongoose.model('InventoryAdjustment', inventoryAdjustmentSchema);


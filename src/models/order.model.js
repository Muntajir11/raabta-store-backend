import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, trim: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    size: { type: String, required: true, trim: true, maxlength: 20 },
    color: { type: String, required: true, trim: true, maxlength: 60 },
    gsm: { type: Number, required: true, enum: [180, 210, 240] },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    designId: { type: String, trim: true, maxlength: 120 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 40,
      index: true,
    },
    items: { type: [orderItemSchema], default: [] },
    subtotal: { type: Number, required: true, min: 0 },
    shipping: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'refunded'],
      default: 'unpaid',
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'in_production', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
    },
    notes: { type: String, maxlength: 2000, default: '' },
    customerName: { type: String, trim: true, maxlength: 120, default: '' },
    customerEmail: { type: String, trim: true, maxlength: 254, default: '' },
    city: { type: String, trim: true, maxlength: 120, default: '' },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 });

export const Order = mongoose.models.Order ?? mongoose.model('Order', orderSchema);

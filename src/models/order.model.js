import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, trim: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    image: { type: String, trim: true, maxlength: 2048, default: '' },
    category: { type: String, trim: true, maxlength: 80, default: '' },
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
    shippingExclGst: { type: Number, min: 0, default: null },
    shippingGst: {
      cgst: { type: Number, min: 0, default: null },
      sgst: { type: Number, min: 0, default: null },
      igst: { type: Number, min: 0, default: null },
    },
    total: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['cod', 'prepaid'],
      default: 'cod',
      index: true,
    },
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
    shippingAddress: {
      phone: { type: String, trim: true, maxlength: 30, default: '' },
      address: { type: String, trim: true, maxlength: 400, default: '' },
      city: { type: String, trim: true, maxlength: 120, default: '' },
      state: { type: String, trim: true, maxlength: 120, default: '' },
      pincode: { type: String, trim: true, maxlength: 6, default: '' },
      landmark: { type: String, trim: true, maxlength: 200, default: '' },
    },
    inventoryReserved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 });

export const Order = mongoose.models.Order ?? mongoose.model('Order', orderSchema);

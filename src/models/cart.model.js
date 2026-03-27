import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, trim: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, required: true, trim: true, maxlength: 2048 },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    size: { type: String, required: true, trim: true, maxlength: 20 },
    color: { type: String, required: true, trim: true, maxlength: 60 },
    gsm: { type: Number, required: true, enum: [180, 210, 240] },
    qty: { type: Number, required: true, min: 1, max: 20 },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

export const Cart = mongoose.models.Cart ?? mongoose.model('Cart', cartSchema);

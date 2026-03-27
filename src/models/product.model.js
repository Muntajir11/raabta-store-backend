import mongoose from 'mongoose';

const gsmOptionSchema = new mongoose.Schema(
  {
    gsm: { type: Number, required: true, enum: [180, 210, 240] },
    price: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      maxlength: 120,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    image: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2048,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      index: true,
    },
    sizes: {
      type: [String],
      default: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    },
    colors: {
      type: [String],
      default: ['Black', 'White'],
    },
    gsmOptions: {
      type: [gsmOptionSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

export const Product = mongoose.models.Product ?? mongoose.model('Product', productSchema);

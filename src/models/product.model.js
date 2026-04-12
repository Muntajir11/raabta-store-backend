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
    description: {
      type: String,
      default: '',
      maxlength: 20000,
    },
    brand: {
      type: String,
      default: 'Raabta',
      trim: true,
      maxlength: 120,
    },
    rating: {
      type: Number,
      default: null,
      min: 0,
      max: 5,
    },
    features: {
      type: [String],
      default: [],
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    /** Public image URL (HTTPS), e.g. Cloudinary secure_url or pasted link. */
    image: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2048,
    },
    /** Cloudinary public_id for admin uploads; used to replace/delete assets. Not exposed in storefront selects. */
    imageCloudinaryPublicId: {
      type: String,
      default: '',
      trim: true,
      maxlength: 512,
      select: false,
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

productSchema.index({ category: 1, isActive: 1 });

export const Product = mongoose.models.Product ?? mongoose.model('Product', productSchema);

import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    refreshTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    refreshTokenJti: {
      type: String,
      default: null,
      select: false,
    },
    refreshTokenExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      index: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
      maxlength: 20,
    },
    shippingName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    shippingPhone: {
      type: String,
      default: '',
      trim: true,
      maxlength: 20,
    },
    shippingAddressLine1: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },
    shippingAddressLine2: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },
    shippingLandmark: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    shippingPincode: {
      type: String,
      default: '',
      trim: true,
      maxlength: 10,
    },
    shippingCity: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    shippingState: {
      type: String,
      default: '',
      trim: true,
      maxlength: 60,
    },
    shippingCountry: {
      type: String,
      default: 'India',
      trim: true,
      maxlength: 60,
    },
    deliveryInstructions: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    state: {
      type: String,
      default: '',
      trim: true,
      maxlength: 60,
    },
    city: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    pincode: {
      type: String,
      default: '',
      trim: true,
      maxlength: 10,
    },
    landmark: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    address: {
      type: String,
      default: '',
      maxlength: 500,
    },
    gender: {
      type: String,
      enum: ['male', 'female'],
      required: true,
      trim: true,
      maxlength: 16,
    },
    avatarSeed: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    wishlist: {
      type: [String],
      default: [],
    },
    marketingOptIn: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);

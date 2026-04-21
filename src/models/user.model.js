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
      default: '',
      trim: true,
      maxlength: 32,
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

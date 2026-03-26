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
  },
  { timestamps: true }
);

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);

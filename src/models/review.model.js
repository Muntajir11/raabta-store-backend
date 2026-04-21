import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: '',
      trim: true,
      maxlength: 4000,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

export const Review = mongoose.models.Review ?? mongoose.model('Review', reviewSchema);


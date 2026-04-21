import mongoose from 'mongoose';

const designSideSchema = new mongoose.Schema(
  {
    view: {
      type: String,
      required: true,
      enum: ['front', 'back', 'profile-left', 'profile-right'],
    },
    hasPrint: { type: Boolean, default: false },
    printSize: { type: String, default: 'M', maxlength: 10 },
    guidePositionId: { type: String, default: 'none', maxlength: 60 },
  },
  { _id: false }
);

const cloudAssetSchema = new mongoose.Schema(
  {
    view: { type: String, default: '', maxlength: 20 },
    kind: { type: String, default: '', maxlength: 20 }, // artwork|preview
    url: { type: String, required: true, trim: true, maxlength: 2048 },
    publicId: { type: String, default: '', trim: true, maxlength: 512 },
  },
  { _id: false }
);

const customDesignSchema = new mongoose.Schema(
  {
    designId: { type: String, required: true, unique: true, index: true, trim: true, maxlength: 40 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    status: {
      type: String,
      enum: ['new', 'reviewed', 'approved', 'rejected', 'printed'],
      default: 'new',
      index: true,
    },
    adminNote: { type: String, default: '', maxlength: 2000 },

    productId: { type: String, required: true, trim: true, maxlength: 120 },
    gsm: { type: Number, required: true, enum: [180, 210, 240] },
    size: { type: String, required: true, trim: true, maxlength: 20 },
    color: { type: String, required: true, trim: true, maxlength: 60 },

    sides: { type: [designSideSchema], default: [] },
    designJson: { type: String, required: true, maxlength: 200000 },

    artworkAssets: { type: [cloudAssetSchema], default: [] },
    previewImages: { type: [cloudAssetSchema], default: [] },

    pricing: {
      blankRs: { type: Number, required: true, min: 0 },
      totalRs: { type: Number, required: true, min: 0 },
    },

    customerSnapshot: {
      name: { type: String, default: '', trim: true, maxlength: 120 },
      email: { type: String, default: '', trim: true, maxlength: 254 },
    },
  },
  { timestamps: true }
);

customDesignSchema.index({ userId: 1, createdAt: -1 });
customDesignSchema.index({ status: 1, createdAt: -1 });

export const CustomDesign =
  mongoose.models.CustomDesign ?? mongoose.model('CustomDesign', customDesignSchema);


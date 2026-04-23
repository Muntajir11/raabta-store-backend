import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, maxlength: 254, index: true },
    phone: { type: String, required: true, trim: true, maxlength: 32, index: true },
    message: { type: String, required: true, trim: true, maxlength: 6000 },
    status: { type: String, enum: ['open', 'resolved'], default: 'open', index: true },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    meta: {
      ip: { type: String, trim: true, maxlength: 80, default: '' },
      userAgent: { type: String, trim: true, maxlength: 500, default: '' },
    },
  },
  { timestamps: true }
);

supportTicketSchema.index({ status: 1, createdAt: -1 });

export const SupportTicket =
  mongoose.models.SupportTicket ?? mongoose.model('SupportTicket', supportTicketSchema);


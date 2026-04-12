import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, min: 0 },
  },
  { collection: 'counters' }
);

export const Counter = mongoose.model('Counter', counterSchema);

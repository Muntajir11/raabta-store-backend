/**
 * One-time: rename Product.category Islamic → Raabta Lifestyle, Lifestyle → Raabta Studio.
 * Usage: node scripts/migrate-product-section-names.mjs
 * Requires MONGODB_URI in .env (run from backend root).
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

async function main() {
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('products');

  const r1 = await col.updateMany({ category: 'Islamic' }, { $set: { category: 'Raabta Lifestyle' } });
  const r2 = await col.updateMany({ category: 'Lifestyle' }, { $set: { category: 'Raabta Studio' } });

  console.log(`Updated Islamic → Raabta Lifestyle: ${r1.modifiedCount} documents`);
  console.log(`Updated Lifestyle → Raabta Studio: ${r2.modifiedCount} documents`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

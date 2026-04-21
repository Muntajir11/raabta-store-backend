import { User } from '../models/user.model.js';

/**
 * @param {import('mongoose').Document} doc
 */
export function toProfileUser(doc) {
  return {
    id: doc.id,
    name: doc.name,
    email: doc.email,
    role: doc.role || 'user',
    phone: doc.phone ?? '',
    state: doc.state ?? '',
    city: doc.city ?? '',
    pincode: doc.pincode ?? '',
    landmark: doc.landmark ?? '',
    address: doc.address ?? '',
    gender: doc.gender ?? '',
    marketingOptIn: Boolean(doc.marketingOptIn),
  };
}

/**
 * @param {string} userId
 */
export async function getProfileById(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    err.details = { reason: 'user_not_found', context: 'getProfileById' };
    throw err;
  }
  return toProfileUser(user);
}

/**
 * @param {string} userId
 * @param {{
 *   name?: string;
 *   phone?: string;
 *   city?: string;
 *   address?: string;
 *   gender?: string;
 *   marketingOptIn?: boolean;
 * }} patch
 */
export async function updateProfile(userId, patch) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    err.details = { reason: 'user_not_found', context: 'updateProfile' };
    throw err;
  }

  if (patch.name !== undefined) user.name = patch.name;
  if (patch.phone !== undefined) user.phone = patch.phone;
  if (patch.state !== undefined) user.state = patch.state;
  if (patch.city !== undefined) user.city = patch.city;
  if (patch.pincode !== undefined) user.pincode = patch.pincode;
  if (patch.landmark !== undefined) user.landmark = patch.landmark;
  if (patch.address !== undefined) user.address = patch.address;
  if (patch.gender !== undefined) user.gender = patch.gender;
  if (patch.marketingOptIn !== undefined) user.marketingOptIn = patch.marketingOptIn;

  await user.save();
  return toProfileUser(user);
}

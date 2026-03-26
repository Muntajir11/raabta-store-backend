import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';

const SALT_ROUNDS = 12;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
}

function toPublicUser(doc) {
  return {
    id: doc.id,
    name: doc.name,
    email: doc.email,
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/**
 * @param {{ name: string; email: string; password: string }} input
 */
export async function registerUser(input) {
  const emailNorm = input.email.toLowerCase().trim();
  console.log(`[auth.service][register] Checking existing user email=${emailNorm}`);
  const existing = await User.findOne({ email: emailNorm });
  if (existing) {
    console.warn(`[auth.service][register] Email already registered email=${emailNorm}`);
    const err = new Error('Email already registered');
    err.statusCode = 409;
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  console.log('[auth.service][register] Hashing password');
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  console.log(`[auth.service][register] Creating user email=${emailNorm}`);
  const user = await User.create({
    name: input.name.trim(),
    email: emailNorm,
    passwordHash,
  });

  console.log(`[auth.service][register] User created id=${user.id}`);
  const token = signToken(user);
  console.log(`[auth.service][register] JWT issued userId=${user.id}`);
  return { user: toPublicUser(user), token };
}

/**
 * @param {{ email: string; password: string }} input
 */
export async function loginUser(input) {
  const emailNorm = input.email.toLowerCase().trim();
  console.log(`[auth.service][login] Looking up user email=${emailNorm}`);
  const user = await User.findOne({ email: emailNorm }).select('+passwordHash');
  if (!user) {
    console.warn(`[auth.service][login] User not found email=${emailNorm}`);
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  console.log(`[auth.service][login] Verifying password userId=${user.id}`);
  const match = await bcrypt.compare(input.password, user.passwordHash);
  if (!match) {
    console.warn(`[auth.service][login] Password mismatch userId=${user.id}`);
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  console.log(`[auth.service][login] Password verified userId=${user.id}`);
  const token = signToken(user);
  console.log(`[auth.service][login] JWT issued userId=${user.id}`);
  return { user: toPublicUser(user), token };
}

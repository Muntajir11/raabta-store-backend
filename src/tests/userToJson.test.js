import assert from 'node:assert/strict';
import { User } from '../models/user.model.js';

const u = new User({
  email: 'test@example.com',
  name: 'Test',
  gender: 'male',
  passwordHash: 'secret',
  refreshTokenHash: 'rt_hash',
  refreshTokenJti: 'rt_jti',
  refreshTokenExpiresAt: new Date(),
  prevRefreshTokenHash: 'prev_hash',
  prevRefreshTokenJti: 'prev_jti',
  prevRefreshTokenValidUntil: new Date(),
});

const json = u.toJSON();

assert.equal(typeof json, 'object');
assert.equal(json.email, 'test@example.com');
assert.ok(!('passwordHash' in json));
assert.ok(!('refreshTokenHash' in json));
assert.ok(!('refreshTokenJti' in json));
assert.ok(!('refreshTokenExpiresAt' in json));
assert.ok(!('prevRefreshTokenHash' in json));
assert.ok(!('prevRefreshTokenJti' in json));
assert.ok(!('prevRefreshTokenValidUntil' in json));

console.log('userToJson.test.js passed');


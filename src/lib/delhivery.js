const DEFAULT_BASE = 'https://track.delhivery.com';

function baseUrl() {
  return String(process.env.DELHIVERY_BASE_URL || DEFAULT_BASE).trim() || DEFAULT_BASE;
}

function token() {
  const t = String(process.env.DELHIVERY_TOKEN || '').trim();
  if (!t) {
    const err = new Error('Delhivery token not configured');
    err.statusCode = 500;
    err.code = 'DELHIVERY_CONFIG_ERROR';
    throw err;
  }
  return t;
}

async function dhvJson(path, { query } = {}) {
  const url = new URL(`${baseUrl()}${path}`);
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Token ${token()}`,
      Accept: 'application/json',
    },
  });

  const text = await res.text().catch(() => '');
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    const msg = typeof body?.message === 'string' && body.message.trim() ? body.message.trim() : 'Delhivery request failed';
    const err = new Error(msg);
    err.statusCode = 502;
    err.code = 'DELHIVERY_ERROR';
    err.details = { status: res.status, path, body };
    throw err;
  }

  return body;
}

export async function checkServiceability(pincode) {
  const pin = String(pincode || '').trim();
  if (!/^\d{6}$/.test(pin)) {
    const err = new Error('Invalid pincode');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return dhvJson('/c/api/pin-codes/json/', { query: { filter_codes: pin } });
}

export async function getCharges(input = {}) {
  const originPin = String(input.originPin || '').trim();
  const destPin = String(input.destPin || '').trim();
  const weightGrams = Math.max(1, Math.floor(Number(input.weightGrams || 0)));
  const paymentType = String(input.paymentType || 'Pre-paid').trim() || 'Pre-paid';
  const codAmount = Math.max(0, Math.floor(Number(input.codAmount || 0)));
  const mdRaw = String(input.md || process.env.DELHIVERY_MD || 'E').trim().toUpperCase();
  const md = mdRaw === 'S' ? 'S' : 'E';

  if (!/^\d{6}$/.test(originPin) || !/^\d{6}$/.test(destPin)) {
    const err = new Error('Invalid pincode');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const l = input.lengthCm != null ? Math.round(Number(input.lengthCm)) : null;
  const b = input.breadthCm != null ? Math.round(Number(input.breadthCm)) : null;
  const h = input.heightCm != null ? Math.round(Number(input.heightCm)) : null;
  const pkgTypeRaw = String(input.pkgType || process.env.DELHIVERY_PKG_TYPE || '').trim();
  const pkg_type = pkgTypeRaw || undefined;

  // Delhivery invoice charges endpoint.
  return dhvJson('/api/kinko/v1/invoice/charges/.json', {
    query: {
      md,
      ss: 'Delivered',
      o_pin: originPin,
      d_pin: destPin,
      cgm: weightGrams,
      pt: paymentType,
      cod: codAmount,
      ...(Number.isFinite(l) && l > 0 ? { l } : {}),
      ...(Number.isFinite(b) && b > 0 ? { b } : {}),
      ...(Number.isFinite(h) && h > 0 ? { h } : {}),
      ...(pkg_type ? { pkg_type } : {}),
    },
  });
}


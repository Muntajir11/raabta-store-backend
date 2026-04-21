import 'dotenv/config';

const TOKEN = (process.env.DELHIVERY_TOKEN || '').trim();
if (!TOKEN) {
  console.error('Missing DELHIVERY_TOKEN in backend/.env');
  process.exit(2);
}

const PROD = 'https://track.delhivery.com';

// Scenario: Hooghly pair you're using on checkout
const O_PIN = '712101';
const D_PIN = '712103';

const headers = {
  Authorization: `Token ${TOKEN}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function call(base, params, label) {
  const url = new URL(`${base}/api/kinko/v1/invoice/charges/.json`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const started = Date.now();
  let status = 0;
  let body = null;
  let err = null;
  try {
    const res = await fetch(url, { method: 'GET', headers });
    status = res.status;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  const row =
    Array.isArray(body) && body.length
      ? body[0]
      : Array.isArray(body?.data) && body.data.length
        ? body.data[0]
        : null;

  console.log('\n------------------------------------------------------------');
  console.log(`[${label}] GET ${url.pathname}?${url.searchParams.toString()}`);
  console.log(`status=${status} host=${new URL(base).host} elapsed=${Date.now() - started}ms`);
  if (err) {
    console.log('network error:', err);
    return;
  }
  if (!row) {
    console.log('no charge row; raw body:');
    console.log(JSON.stringify(body, null, 2)?.slice(0, 2000));
    return;
  }
  const pick = (k) => (row[k] !== undefined ? row[k] : 0);
  console.log('charged_weight :', pick('charged_weight'), 'divisor:', pick('divisor'));
  console.log('charge_DL      :', pick('charge_DL'));
  console.log('charge_DPH     :', pick('charge_DPH'));
  console.log('charge_LM      :', pick('charge_LM'));
  console.log('charge_PEAK    :', pick('charge_PEAK'));
  console.log('charge_FS      :', pick('charge_FS'));
  console.log('charge_AWB     :', pick('charge_AWB'));
  console.log('charge_COD     :', pick('charge_COD'));
  console.log('gross_amount   :', pick('gross_amount'));
  console.log('tax_data       :', JSON.stringify(row.tax_data || {}));
  console.log('total_amount   :', pick('total_amount'));
}

async function main() {
  console.log(`Delhivery probe (PRODUCTION) (${O_PIN} -> ${D_PIN})`);

  const base = {
    md: 'E',
    ss: 'Delivered',
    o_pin: O_PIN,
    d_pin: D_PIN,
    pt: 'Pre-paid',
  };

  // Scenario A: cgm only, no dims (server-declared chargeable weight)
  await call(PROD, { ...base, cgm: 250 }, 'PROD cgm=250 (no dims)');

  // Scenario B: cgm = our volumetric 1050 (what we send today)
  await call(PROD, { ...base, cgm: 1050 }, 'PROD cgm=1050 (our current)');

  // Scenario C: cgm + explicit dims (let Delhivery compute volumetric)
  await call(
    PROD,
    { ...base, cgm: 250, l: 30, b: 35, h: 5, pkg_type: 'box' },
    'PROD cgm=250 + l/b/h 30x35x5'
  );

  // Scenario D: small poly-mailer dims
  await call(
    PROD,
    { ...base, cgm: 250, l: 25, b: 20, h: 2, pkg_type: 'flyer' },
    'PROD cgm=250 + l/b/h 25x20x2 (poly flyer)'
  );

  // Scenario E: Surface mode instead of Express
  await call(
    PROD,
    { ...base, md: 'S', cgm: 250, l: 30, b: 35, h: 5, pkg_type: 'box' },
    'PROD Surface md=S cgm=250 + l/b/h 30x35x5'
  );
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});

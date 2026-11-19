// Regenerate blok data di catalog.js dari Supabase. Helper harga TIDAK disentuh.
// Dipakai oleh workflow .github/workflows/sync-catalog.yml.
import fs from 'node:fs/promises';
import path from 'node:path';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset.');

const headers = { apikey: key, Authorization: `Bearer ${key}` };
async function table(name, query = '') {
  const res = await fetch(`${url}/rest/v1/${name}?${query}`, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const [products, proofs, settingsRows] = await Promise.all([
  table('products', 'select=*&order=id.asc'),
  table('product_social_proof', 'select=*'),
  table('settings', 'select=key,value'),
]);
if (!products.length) throw new Error('Produk kosong di Supabase. Refuse overwrite catalog.js.');

const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
const rp = n => 'Rp' + (Number(n) || 0).toLocaleString('id-ID');

const catalogProducts = products.map(p => {
  const out = {
    id: p.id,
    name: p.name,
    category: p.category,
  };
  if (p.sold_out) out.soldOut = true;
  out.weight = p.weight || 0;
  out.priceCrt = rp(p.price_crt);
  out.priceStr = rp(p.price_str);
  out.priceWa = rp(p.price_wa);
  if (p.xtra_voucher != null && p.xtra_voucher !== 0) out.xtraVoucher = p.xtra_voucher;
  if (p.bindings && Object.keys(p.bindings).length) {
    out.bindings = Object.fromEntries(Object.entries(p.bindings).map(([k, v]) => [k, rp(v)]));
  }
  if (p.img) out.img = p.img;
  out.images = p.images || [];
  if (p.wa) out.wa = p.wa;
  if (p.shopee) out.shopee = p.shopee;
  out.specs = p.specs || [];
  if (p.description) out.desc = p.description;
  return out;
});

const social = {};
for (const row of proofs) {
  if (!row.rating && !row.sold) continue;
  social[row.product_id] = {};
  if (row.rating) social[row.product_id].rating = row.rating;
  social[row.product_id].sold = row.sold || 0;
}

const file = path.resolve(process.cwd(), 'catalog.js');
let src = await fs.readFile(file, 'utf8');
const before = src;

function replaceBlock(source, startMarker, endMarker, body, suffix = ';') {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error('Marker tidak ditemukan: ' + startMarker);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error('Penutup tidak ditemukan untuk: ' + startMarker);
  const text = body.split('\n').map((line, i) => (i === 0 ? line : '    ' + line)).join('\n') + suffix;
  return source.slice(0, start) + startMarker + text + source.slice(end + endMarker.length);
}

const jsonBlock = v => JSON.stringify(v, null, 4);

src = replaceBlock(src, 'const GLOBAL_PRODUCTS = ', '\n    ];', jsonBlock(catalogProducts));
src = replaceBlock(src, 'const PRODUCT_SOCIAL_PROOF = ', '\n    };', jsonBlock(social));
src = replaceBlock(src, 'const XTRA_VOUCHER_BY_CATEGORY = ', '\n    };', jsonBlock(settings.xtra_voucher_by_category || {}));
src = replaceBlock(src, 'const FLASH_DISCOUNT_BY_CATEGORY = ', '\n    };', jsonBlock(settings.flash_discount_by_category || {}));

src = src.replace(/const DEFAULT_XTRA_VOUCHER = \d+;/, `const DEFAULT_XTRA_VOUCHER = ${Number(settings.default_xtra_voucher) || 0};`);
src = src.replace(/const FLASH_ROUNDING = \d+;/, `const FLASH_ROUNDING = ${Number(settings.flash_rounding) || 500};`);

// Jaga line ending tetap sama supaya diff Git tidak berisik.
if (before.includes('\r\n')) src = src.replace(/\r?\n/g, '\r\n');

if (src === before) {
  console.log('catalog.js sudah sesuai Supabase. Tidak ada perubahan.');
} else {
  await fs.writeFile(file, src, 'utf8');
  console.log(`catalog.js di-update: ${catalogProducts.length} produk, ${Object.keys(social).length} social proof.`);
}

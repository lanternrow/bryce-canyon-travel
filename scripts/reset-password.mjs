import postgres from 'postgres';

const sql = postgres('postgresql://neondb_owner:npg_NLeYfn3Kqd1C@ep-dry-rice-akvotzdw.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require');

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-512' }, keyMaterial, 64 * 8);
  const hashArray = new Uint8Array(derivedBits);
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password, storedHash) {
  const [saltHex, expectedHashHex] = storedHash.split(':');
  if (!saltHex || !expectedHashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-512' }, keyMaterial, 64 * 8);
  const hashArray = new Uint8Array(derivedBits);
  const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === expectedHashHex;
}

// Hash and set
const newHash = await hashPassword('changeme123');
console.log('New hash generated, length:', newHash.length);

// Verify locally before writing
const localVerify = await verifyPassword('changeme123', newHash);
console.log('Local verify:', localVerify);

// Update DB
await sql`UPDATE admin_users SET password_hash = ${newHash} WHERE email = 'info@zion.travel'`;
console.log('Password updated in DB');

// Re-read and verify
const users = await sql`SELECT password_hash FROM admin_users WHERE email = 'info@zion.travel'`;
const dbVerify = await verifyPassword('changeme123', users[0].password_hash);
console.log('DB verify after update:', dbVerify);

await sql.end();
console.log('Done! Login with info@zion.travel / changeme123');

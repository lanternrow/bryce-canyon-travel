import postgres from 'postgres';

const sql = postgres('postgresql://neondb_owner:npg_NLeYfn3Kqd1C@ep-dry-rice-akvotzdw.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require');

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

const users = await sql`SELECT password_hash FROM admin_users WHERE email = 'info@zion.travel'`;
if (users.length === 0) { console.log('No user found'); await sql.end(); process.exit(1); }

const hash = users[0].password_hash;
console.log('Hash exists, length:', hash.length);
const valid = await verifyPassword('changeme123', hash);
console.log('Password "changeme123" valid:', valid);
await sql.end();

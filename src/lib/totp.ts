const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ237456';
// Chuẩn RFC 4648 Base32
const RFC4648_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(length = 20): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += RFC4648_BASE32[bytes[i] % 32];
  }
  return result;
}

export function buildOtpAuthUri(secret: string, accountEmail: string, issuer = 'TramDieuKhienDNS'): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function base32ToBytes(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = RFC4648_BASE32.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export async function generateTotpCode(secret: string, windowOffset = 0): Promise<string> {
  const keyBytes = base32ToBytes(secret);
  const epochSeconds = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epochSeconds / 30) + windowOffset;

  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);

  const rawKey = new Uint8Array(keyBytes).buffer as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hmac = new Uint8Array(signature);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, '0');
}

export async function verifyTotpCode(secret: string, inputCode: string): Promise<boolean> {
  const normalized = inputCode.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;

  for (const offset of [-1, 0, 1]) {
    const expected = await generateTotpCode(secret, offset);
    if (expected === normalized) {
      return true;
    }
  }
  return false;
}

export function getSecondsRemainingInWindow(): number {
  return 30 - (Math.floor(Date.now() / 1000) % 30);
}

// Giữ biến hằng phòng tránh warning unused
void BASE32_ALPHABET;

/* ------------------------------------------------------------------ */
/* Synchronous SHA-1 (FIPS 180-1)                                      */
/* Used to derive real git-like object hashes entirely inside the      */
/* sandbox (no Web Crypto, no async — must work in Node tests too).    */
/* ------------------------------------------------------------------ */

const K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];

const HEX = '0123456789abcdef';

export function sha1Bytes(input: Uint8Array): number[] {
  const l = input.length;
  const bitLenHi = Math.floor((l * 8) / 0x100000000);
  const bitLenLo = (l * 8) >>> 0;

  // padding: 0x80 + zeros to 56 mod 64 + 8-byte big-endian bit length
  const rem = (l + 1) % 64;
  const zeros = rem <= 56 ? 56 - rem : 120 - rem;
  const total = l + 1 + zeros + 8;

  const buf = new Uint8Array(total);
  buf.set(input);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, bitLenHi);
  dv.setUint32(total - 4, bitLenLo);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w: number[] = new Array(80);

  for (let off = 0; off < total; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4);
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w[t] = (x << 1) | (x >>> 31);
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      let f: number, k: number;
      if (t < 20) { f = (b & c) | (~b & d); k = K[0]; }
      else if (t < 40) { f = b ^ c ^ d; k = K[1]; }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = K[2]; }
      else { f = b ^ c ^ d; k = K[3]; }
      const rotl5a = (a << 5) | (a >>> 27);
      const rotl30b = (b << 30) | (b >>> 2);
      const temp = (rotl5a + f + e + k + w[t]) | 0;
      e = d; d = c; c = rotl30b; b = a; a = temp;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }

  return [h0, h1, h2, h3, h4];
}

export function sha1Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return sha1Bytes(bytes)
    .map(h => {
      let s = '';
      for (let i = 7; i >= 0; i--) s += HEX[(h >>> (i * 4)) & 0xf];
      return s;
    })
    .join('');
}

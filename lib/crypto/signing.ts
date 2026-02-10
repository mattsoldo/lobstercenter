import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

// Ed25519 requires sha512 for hashing
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

/**
 * Generate a new Ed25519 keypair.
 * Returns { privateKey, publicKey } as hex strings.
 */
export function generateKeypair(): { privateKey: string; publicKey: string } {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}

/**
 * Compute the fingerprint of a public key (first 16 hex chars of SHA-256).
 */
export function fingerprint(publicKeyHex: string): string {
  const pubBytes = hexToBytes(publicKeyHex);
  const hash = sha256(pubBytes);
  return bytesToHex(hash).slice(0, 16);
}

/**
 * Canonicalize an object for signing: sorted keys, no whitespace.
 */
export function canonicalize(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Sign content with a private key. Returns base64-encoded signature.
 */
export function sign(content: Record<string, unknown>, privateKeyHex: string): string {
  const canonical = canonicalize(content);
  const msgBytes = new TextEncoder().encode(canonical);
  const privBytes = hexToBytes(privateKeyHex);
  const sig = ed.sign(msgBytes, privBytes);
  return Buffer.from(sig).toString('base64');
}

/**
 * Verify a signature against content and a public key.
 */
export function verify(
  content: Record<string, unknown>,
  signatureBase64: string,
  publicKeyHex: string
): boolean {
  try {
    const canonical = canonicalize(content);
    const msgBytes = new TextEncoder().encode(canonical);
    const sigBytes = Buffer.from(signatureBase64, 'base64');
    const pubBytes = hexToBytes(publicKeyHex);
    return ed.verify(sigBytes, msgBytes, pubBytes);
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

import { NativeModule, requireNativeModule } from 'expo';

declare class AscJwtNative extends NativeModule {
  /**
   * Sign a JWT for App Store Connect using an ES256 private key (p8).
   *
   * @param keyId      10-character ASC Key ID
   * @param issuerId   Issuer GUID
   * @param p8PEM      PEM-encoded private key (including header + footer)
   * @param ttlSeconds Token TTL in seconds (max 1200 per Apple docs)
   * @returns          Signed JWT (header.payload.signature)
   */
  signAppStoreConnectJwt(
    keyId: string,
    issuerId: string,
    p8PEM: string,
    ttlSeconds: number,
  ): Promise<string>;
}

// On Phase-1 dev cycles before the dev-client build exists, a JS-side fallback
// using `jose` is used. The native module replaces it once shipped.
const native = (() => {
  try {
    return requireNativeModule<AscJwtNative>('AscJwt');
  } catch {
    return null;
  }
})();

export async function signAppStoreConnectJwt(args: {
  keyId: string;
  issuerId: string;
  p8PEM: string;
  ttlSeconds?: number;
}): Promise<string> {
  const ttl = args.ttlSeconds ?? 18 * 60;
  if (native) {
    return native.signAppStoreConnectJwt(args.keyId, args.issuerId, args.p8PEM, ttl);
  }
  // Fallback: JS-side ES256 signing via `jose`. Used in pre-build dev only.
  const { SignJWT, importPKCS8 } = await import('jose');
  const key = await importPKCS8(args.p8PEM, 'ES256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: args.keyId, typ: 'JWT' })
    .setIssuer(args.issuerId)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .setAudience('appstoreconnect-v1')
    .sign(key);
}

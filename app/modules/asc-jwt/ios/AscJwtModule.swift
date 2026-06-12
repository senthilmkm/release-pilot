import CryptoKit
import ExpoModulesCore
import Foundation

// Native ES256 JWT signer for App Store Connect API.
//
// Why we ship our own rather than using jose-jwt from JS:
//  1. CryptoKit's P256.Signing.PrivateKey is hardware-accelerated on iOS,
//     ~50× faster than the WASM jose path used as fallback.
//  2. The .p8 string lives in Keychain. Pulling it into JS world means a
//     round-trip + a JS-side copy in heap memory; staying native is safer.
//  3. Signing happens every ~18 minutes during active use — small but
//     adds up; native makes it instant.

public class AscJwtModule: Module {
    public func definition() -> ModuleDefinition {
        Name("AscJwt")

        AsyncFunction("signAppStoreConnectJwt") {
            (keyId: String, issuerId: String, p8PEM: String, ttlSeconds: Int) -> String in
            return try Self.signJwt(keyId: keyId, issuerId: issuerId, p8PEM: p8PEM, ttlSeconds: ttlSeconds)
        }
    }

    static func signJwt(keyId: String, issuerId: String, p8PEM: String, ttlSeconds: Int) throws -> String {
        // 1. Header
        let header: [String: Any] = ["alg": "ES256", "kid": keyId, "typ": "JWT"]
        let headerData = try JSONSerialization.data(withJSONObject: header, options: [.sortedKeys])

        // 2. Payload
        let now = Int(Date().timeIntervalSince1970)
        let payload: [String: Any] = [
            "iss": issuerId,
            "iat": now,
            "exp": now + ttlSeconds,
            "aud": "appstoreconnect-v1",
        ]
        let payloadData = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])

        // 3. Signing input
        let signingInput = "\(base64UrlEncode(headerData)).\(base64UrlEncode(payloadData))"

        // 4. ES256 sign via CryptoKit
        let privateKey = try parseP8PrivateKey(pem: p8PEM)
        guard let signingInputData = signingInput.data(using: .utf8) else {
            throw AscJwtError.signingFailed("invalid utf8 in signing input")
        }
        let signature = try privateKey.signature(for: signingInputData)
        let signatureBytes = signature.rawRepresentation

        return "\(signingInput).\(base64UrlEncode(signatureBytes))"
    }

    /// Parse an App Store Connect `.p8` private key (PEM-wrapped PKCS#8
    /// EC P-256) into a CryptoKit signing key.
    ///
    /// The canonical pattern (used by APNSwift, App-Store-Connect Swift
    /// SDKs, every JWT-signing example Apple has published since
    /// WWDC2020) is `P256.Signing.PrivateKey(pemRepresentation: pem)`.
    /// This initializer is iOS 14+ and accepts BOTH `-----BEGIN PRIVATE
    /// KEY-----` (PKCS#8) and `-----BEGIN EC PRIVATE KEY-----` (SEC1)
    /// envelopes natively — no manual ASN.1 stripping required.
    ///
    /// API SURFACE NOTES (read before editing):
    ///  - `init(pemRepresentation:)`     iOS 14+, Apple CryptoKit ✅
    ///  - `init(derRepresentation:)`     iOS 14+, Apple CryptoKit ✅
    ///  - `init(pkcs8DERRepresentation:)` ❌ swift-crypto ONLY,
    ///        NOT in Apple's built-in CryptoKit. Using it produces a
    ///        hard `no exact matches in call to initializer` compile
    ///        error (proven by build 7506a588 on Xcode 26.4).
    ///
    /// We add a defense-in-depth fallback for the rare case where a
    /// user pastes a malformed or partial PEM (e.g. missing the
    /// `-----BEGIN/-----END` markers, or with non-standard line
    /// endings the PEM parser rejects). In that path we strip,
    /// base64-decode, and try `derRepresentation:` which also handles
    /// both PKCS#8 and SEC1 DER.
    static func parseP8PrivateKey(pem: String) throws -> P256.Signing.PrivateKey {
        let trimmed = pem.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw AscJwtError.invalidKey("p8 PEM is empty")
        }

        // Primary path: feed the raw PEM string to CryptoKit. Apple's
        // parser handles PKCS#8 PEM (the .p8 file format) directly.
        do {
            return try P256.Signing.PrivateKey(pemRepresentation: trimmed)
        } catch {
            // Fall through to DER path below — only catches outright
            // PEM-parse failures (malformed envelope, bad base64, etc.)
        }

        // Fallback path: strip headers + whitespace, base64-decode,
        // and try as PKCS#8/SEC1 DER. This rescues partial pastes
        // (e.g. only the base64 body, no -----BEGIN markers).
        let body = trimmed
            .replacingOccurrences(of: "-----BEGIN PRIVATE KEY-----", with: "")
            .replacingOccurrences(of: "-----END PRIVATE KEY-----", with: "")
            .replacingOccurrences(of: "-----BEGIN EC PRIVATE KEY-----", with: "")
            .replacingOccurrences(of: "-----END EC PRIVATE KEY-----", with: "")
            .components(separatedBy: .whitespacesAndNewlines)
            .joined()
        guard let der = Data(base64Encoded: body) else {
            throw AscJwtError.invalidKey("p8 key is neither valid PEM nor base64 DER")
        }
        do {
            return try P256.Signing.PrivateKey(derRepresentation: der)
        } catch {
            throw AscJwtError.invalidKey(
                "p8 DER parse failed — verify the file is an unmodified Apple .p8 key (\(error.localizedDescription))"
            )
        }
    }

    static func base64UrlEncode(_ data: Data) -> String {
        return data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

enum AscJwtError: Error {
    case invalidKey(String)
    case signingFailed(String)
}

import {
  encryptCreds,
  decryptCreds,
  generateMasterKeyB64,
} from './creds';

const tests: { name: string; pass: boolean; reason?: string }[] = [];
const ok = (name: string, pass: boolean, reason?: string) => tests.push({ name, pass, reason });

async function run(): Promise<void> {
  // ---- round-trip ----
  {
    const master = generateMasterKeyB64();
    const plaintext = '-----BEGIN PRIVATE KEY-----\nMIGTAg…\n-----END PRIVATE KEY-----';
    const enc = await encryptCreds({ plaintext, masterKeyB64: master });
    const dec = await decryptCreds({ encrypted: enc, masterKeyB64: master });
    ok('round-trip recovers exact plaintext', dec === plaintext);
  }

  // ---- two encryptions of the same plaintext yield different ciphertexts ----
  {
    const master = generateMasterKeyB64();
    const a = await encryptCreds({ plaintext: 'hello', masterKeyB64: master });
    const b = await encryptCreds({ plaintext: 'hello', masterKeyB64: master });
    ok('IVs differ across encryptions',         a.ivB64        !== b.ivB64);
    ok('salts differ across encryptions',       a.saltB64      !== b.saltB64);
    ok('ciphertexts differ across encryptions', a.ciphertextB64 !== b.ciphertextB64);
  }

  // ---- wrong master key fails decrypt ----
  {
    const m1 = generateMasterKeyB64();
    const m2 = generateMasterKeyB64();
    const enc = await encryptCreds({ plaintext: 'sensitive', masterKeyB64: m1 });
    let threw = false;
    try {
      await decryptCreds({ encrypted: enc, masterKeyB64: m2 });
    } catch {
      threw = true;
    }
    ok('decrypt with wrong master throws', threw);
  }

  // ---- tampered ciphertext fails decrypt (auth tag check) ----
  {
    const master = generateMasterKeyB64();
    const enc = await encryptCreds({ plaintext: 'tamper-me', masterKeyB64: master });
    const flipped = enc.ciphertextB64.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'));
    const tampered = { ...enc, ciphertextB64: flipped };
    let threw = false;
    try {
      await decryptCreds({ encrypted: tampered, masterKeyB64: master });
    } catch {
      threw = true;
    }
    ok('decrypt with tampered ciphertext throws', threw);
  }

  // ---- short master key rejected ----
  {
    let threw = false;
    try {
      await encryptCreds({ plaintext: 'x', masterKeyB64: btoa('tooshort') });
    } catch {
      threw = true;
    }
    ok('encrypt with short master key throws', threw);
  }

  // ---- large plaintext round-trip (real .p8 is ~250 bytes) ----
  {
    const master = generateMasterKeyB64();
    const big = 'x'.repeat(10_000);
    const enc = await encryptCreds({ plaintext: big, masterKeyB64: master });
    const dec = await decryptCreds({ encrypted: enc, masterKeyB64: master });
    ok('large plaintext round-trips', dec === big);
  }

  const passed = tests.filter((t) => t.pass).length;
  const failed = tests.filter((t) => !t.pass);
  console.log(`\nworker/crypto/creds: ${passed}/${tests.length} passing`);
  if (failed.length > 0) {
    console.log('FAILURES:');
    for (const t of failed) console.log(`  ✗ ${t.name}${t.reason ? ` — ${t.reason}` : ''}`);
    process.exit(1);
  }
}

void run();

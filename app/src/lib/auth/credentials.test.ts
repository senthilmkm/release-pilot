import { isValidIssuerId, isValidKeyId, isValidP8PEM, validationMessage } from './credentials-format';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

// Issuer ID (GUID)
ok('valid GUID accepted',          isValidIssuerId('57246542-1234-5678-9abc-def012345678'));
ok('valid GUID with caps',         isValidIssuerId('57246542-1234-5678-9ABC-DEF012345678'));
ok('valid GUID with whitespace',   isValidIssuerId('  57246542-1234-5678-9abc-def012345678  '));
ok('missing dashes rejected',      !isValidIssuerId('5724654212345678'));
ok('non-hex rejected',             !isValidIssuerId('57246542-1234-5678-9abc-defzzz345678'));
ok('wrong length rejected',        !isValidIssuerId('5724-1234-5678-9abc-def012345678'));
ok('empty rejected',               !isValidIssuerId(''));

// Key ID (10 char uppercase alphanumeric)
ok('valid Key ID accepted',        isValidKeyId('ABC123XYZ4'));
ok('valid all digits',             isValidKeyId('1234567890'));
ok('valid Key ID with whitespace', isValidKeyId('  ABC123XYZ4  '));
ok('lowercase rejected',           !isValidKeyId('abc123xyz4'));
ok('too short rejected',           !isValidKeyId('ABC123XYZ'));
ok('too long rejected',            !isValidKeyId('ABC123XYZ45'));
ok('with hyphen rejected',         !isValidKeyId('ABC123-XYZ'));

// p8 PEM
const validP8 = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgQbsmsRWeCwoT7K8j
hl3oIOlw6tNi1Wzx9PJzPcW4MEqhRANCAAQ44u4kCBmJukmEQ02vhmJ2sX7vR5pH
M51hSphMlMmd4nZ7d2BmHtv2dKQiYJrYqWHTOZNwf8HuhytcQF/v8I0r
-----END PRIVATE KEY-----`;
ok('valid p8 accepted',            isValidP8PEM(validP8));
ok('valid p8 with whitespace',     isValidP8PEM('   \n' + validP8 + '\n  '));
ok('missing header rejected',      !isValidP8PEM(validP8.replace('-----BEGIN PRIVATE KEY-----', '')));
ok('missing footer rejected',      !isValidP8PEM(validP8.replace('-----END PRIVATE KEY-----', '')));
ok('empty body rejected',          !isValidP8PEM('-----BEGIN PRIVATE KEY-----\n\n-----END PRIVATE KEY-----'));
ok('garbage body rejected',        !isValidP8PEM('-----BEGIN PRIVATE KEY-----\n!!@#$%\n-----END PRIVATE KEY-----'));

// validationMessage returns null for valid AND for empty (UX: don't shout at empty fields)
ok('empty issuerId returns null',  validationMessage('issuerId', '') === null);
ok('valid issuerId returns null',  validationMessage('issuerId', '57246542-1234-5678-9abc-def012345678') === null);
ok('invalid issuerId returns msg', typeof validationMessage('issuerId', 'not-a-guid') === 'string');
ok('invalid keyId returns msg',    typeof validationMessage('keyId', 'too-short') === 'string');
ok('invalid p8 returns msg',       typeof validationMessage('p8', 'no headers here') === 'string');

const passed = tests.filter(t => t.pass).length;
const failed = tests.filter(t => !t.pass);
console.log(`\ncredentials: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}

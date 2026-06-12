import { deriveTeamName } from './team-name';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

ok('derives from bundle ID',
   deriveTeamName({
     issuerId: '57246542-1234-5678-9abc-def012345678',
     firstAppBundleId: 'com.senthil.recall',
   }) === 'Senthil');

ok('derives from bundle ID even when name present',
   deriveTeamName({
     issuerId: '57246542-1234-5678-9abc-def012345678',
     firstAppBundleId: 'com.tvhub.studio',
     firstAppName: 'TVHub – Watch Tracker',
   }) === 'Tvhub');

ok('falls back to app name when bundle absent',
   deriveTeamName({
     issuerId: '57246542-1234-5678-9abc-def012345678',
     firstAppName: 'Recall – Memory App',
   }) === 'Recall');

ok('strips suffix "App" from name',
   deriveTeamName({
     issuerId: '57246542-1234-5678-9abc-def012345678',
     firstAppName: 'Notesy App',
   }) === 'Notesy');

ok('strips suffix "Inc" from name',
   deriveTeamName({
     issuerId: '57246542-1234-5678-9abc-def012345678',
     firstAppName: 'Acme Inc',
   }) === 'Acme');

ok('falls back to Team <last4> when nothing useful',
   deriveTeamName({
     issuerId: '57246542-1234-5678-9abc-def012345678',
   }) === 'Team 5678');

ok('short bundle ID single-segment falls through to name',
   deriveTeamName({
     issuerId: '57246542-1234-5678-9abc-def012345678',
     firstAppBundleId: 'flat',
     firstAppName: 'Cool App',
   }) === 'Cool');

const passed = tests.filter(t => t.pass).length;
const failed = tests.filter(t => !t.pass);
console.log(`\nteam-name: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}

import { classifyApnsFailure, type ApnsSendResult } from './client';

const tests: { name: string; pass: boolean }[] = [];
const ok = (name: string, pass: boolean) => tests.push({ name, pass });

const result = (over: Partial<ApnsSendResult>): ApnsSendResult => ({
  status: 200, reason: null, apnsId: 'X', ...over,
});

// Success codes — ignore (no action)
ok('200 → ignore', classifyApnsFailure(result({ status: 200 })) === 'ignore');
ok('201 → ignore', classifyApnsFailure(result({ status: 201 })) === 'ignore');

// Permanently bad device token paths
ok('410 → drop', classifyApnsFailure(result({ status: 410, reason: 'Unregistered' })) === 'drop');
ok('400 BadDeviceToken → drop', classifyApnsFailure(result({ status: 400, reason: 'BadDeviceToken' })) === 'drop');
ok('400 DeviceTokenNotForTopic → drop', classifyApnsFailure(result({ status: 400, reason: 'DeviceTokenNotForTopic' })) === 'drop');

// Auth/transient → retry
ok('403 ExpiredProviderToken → retry', classifyApnsFailure(result({ status: 403, reason: 'ExpiredProviderToken' })) === 'retry');
ok('429 → retry', classifyApnsFailure(result({ status: 429, reason: 'TooManyRequests' })) === 'retry');
ok('500 → retry', classifyApnsFailure(result({ status: 500 })) === 'retry');

const passed = tests.filter((t) => t.pass).length;
const failed = tests.filter((t) => !t.pass);
console.log(`\nworker/apns/client: ${passed}/${tests.length} passing`);
if (failed.length > 0) {
  for (const t of failed) console.log(`  ✗ ${t.name}`);
  process.exit(1);
}

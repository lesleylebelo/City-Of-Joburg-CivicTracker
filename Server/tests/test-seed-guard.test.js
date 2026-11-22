const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('test seeding refuses to initialize a database without the explicit opt-in', () => {
    // This explicit environment value takes precedence over any local dotenv value.
    const environment = { ...process.env, TEST_DATABASE_SEED_CONFIRM: 'disabled' };
    const child = spawnSync(process.execPath, [path.join(__dirname, '../scripts/seed-test-accounts.cjs')], {
        env: environment, encoding: 'utf8', windowsHide: true, timeout: 10000
    });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /Test seeding stopped/);
    assert.doesNotMatch(child.stdout, /accounts created/);
});

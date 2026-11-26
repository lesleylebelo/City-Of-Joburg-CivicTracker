const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('environment template has placeholders for every application and real-SQL test variable', () => {
    const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    const documented = new Set();
    for (const line of example.split(/\r?\n/)) {
        if (!line || line.startsWith('#')) continue;
        assert.match(line, /^[A-Z_]+=<[^>]+>$/);
        documented.add(line.split('=')[0]);
    }
    const names = new Set();
    for (const entry of fs.readdirSync(root).filter(name => name.endsWith('.js'))) {
        const text = fs.readFileSync(path.join(root, entry), 'utf8');
        for (const match of text.matchAll(/\b(?:process\.env|env)\.([A-Z_]+)/g)) names.add(match[1]);
    }
    const sqlTest = fs.readFileSync(path.join(root, 'tests/sql-sign-in.cjs'), 'utf8') +
        fs.readFileSync(path.join(root, 'scripts/seed-test-accounts.cjs'), 'utf8');
    for (const match of sqlTest.matchAll(/\bprocess\.env\.([A-Z_]+)/g)) names.add(match[1]);
    for (const match of sqlTest.matchAll(/['"](TEST_[A-Z_]*[A-Z])['"]/g)) names.add(match[1]);
    const readme = fs.readFileSync(path.join(root, '..', 'README.md'), 'utf8');
    assert.deepEqual([...documented].sort(), [...names].sort());
    for (const name of names) assert.ok(readme.includes('`' + name + '`'), name);
});

test('backend runtime metadata matches lockfile and the documented dependency floor', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    assert.equal(manifest.engines.node, '>=22');
    assert.equal(manifest.main, 'server.js');
    assert.equal(manifest.scripts.start, 'node server.js');
    assert.deepEqual(lock.packages[''].engines, manifest.engines);
});

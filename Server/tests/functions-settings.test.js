const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('Functions settings template has placeholders only and documents all host/application values', () => {
    const example = JSON.parse(fs.readFileSync(path.join(root, 'local.settings.json.example'), 'utf8'));
    assert.equal(example.IsEncrypted, false);
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    for (const [name, value] of Object.entries(example.Values)) {
        assert.match(value, /^<[^>]+>$/);
        assert.ok(readme.includes('`' + name + '`'), name);
    }
    const environment = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    for (const match of environment.matchAll(/^([A-Z_]+)=/gm)) {
        if (!match[1].startsWith('TEST_')) assert.ok(match[1] in example.Values, match[1]);
    }
    assert.ok('FUNCTIONS_WORKER_RUNTIME' in example.Values);
    assert.ok('AzureWebJobsStorage' in example.Values);
});

test('local settings are ignored and Functions packaging excludes private/development content', () => {
    const ignored = fs.readFileSync(path.join(root, '../.gitignore'), 'utf8').split(/\r?\n/);
    assert.ok(ignored.includes('Server/local.settings.json'));
    const excluded = fs.readFileSync(path.join(root, '.funcignore'), 'utf8').split(/\r?\n/);
    for (const pattern of ['.env', '.env.*', 'tests/', 'uploads/', 'docs/', 'local.settings.json', 'local.settings.json.*']) {
        assert.ok(excluded.includes(pattern), pattern);
    }
    assert.equal(require('../package.json').main, 'src/functions/api.js');
    assert.equal(require('../package.json').scripts.start, 'node server.js');
});

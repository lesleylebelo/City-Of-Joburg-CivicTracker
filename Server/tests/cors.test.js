const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createCorsPolicy = require('../cors_policy');

async function withServer(origins, check) {
    const app = express();
    let handled = 0;
    app.use(createCorsPolicy(origins));
    app.all('/api/example', (req, res) => { handled++; res.json({ ok: true }); });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    try { await check(base, () => handled); }
    finally { await new Promise(resolve => server.close(resolve)); }
}

test('explicit allowed origin supports bearer/content-type preflight without cookies or wildcards', async () => {
    await withServer('https://frontend.example.test, https://second.example.test', async (base, handled) => {
        const response = await fetch(base + '/api/example', { headers: { Origin: 'https://frontend.example.test' } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), 'https://frontend.example.test');
        assert.equal(response.headers.get('access-control-allow-credentials'), null);
        const preflight = await fetch(base + '/api/example', { method: 'OPTIONS', headers: {
            Origin: 'https://second.example.test', 'Access-Control-Request-Method': 'PATCH',
            'Access-Control-Request-Headers': 'authorization,content-type'
        } });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://second.example.test');
        assert.equal(preflight.headers.get('access-control-allow-headers'), 'Authorization,Content-Type');
        assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        assert.equal(handled(), 1);
    });
});

test('default rejects cross-origin requests before handlers but permits same-origin and nonbrowser clients', async () => {
    await withServer('', async (base, handled) => {
        for (const method of ['GET', 'POST', 'OPTIONS']) {
            const response = await fetch(base + '/api/example', { method, headers: { Origin: 'https://blocked.example.test' } });
            assert.equal(response.status, 403);
            assert.deepEqual(await response.json(), { message: 'Origin not allowed.' });
            assert.equal(response.headers.get('access-control-allow-origin'), null);
        }
        assert.equal(handled(), 0);
        assert.equal((await fetch(base + '/api/example')).status, 200);
        assert.equal((await fetch(base + '/api/example', { headers: { Origin: base } })).status, 200);
    });
});

test('allowlist is exact; subdomains and suffix tricks do not match', async () => {
    await withServer('https://frontend.example.test', async base => {
        for (const origin of ['https://sub.frontend.example.test', 'https://frontend.example.test.bad', 'null']) {
            assert.equal((await fetch(base + '/api/example', { headers: { Origin: origin } })).status, 403);
        }
    });
    for (const value of ['*', 'https://example.test/path', 'https://user@example.test']) {
        assert.throws(() => createCorsPolicy(value), /Invalid CORS origin configuration/);
    }
});

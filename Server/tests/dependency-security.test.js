const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { gzipSync, deflateSync } = require('node:zlib');
const net = require('node:net');
const express = require('express');
const fromExpress = createRequire(require.resolve('express'));
const proxyaddr = fromExpress('proxy-addr');
const qs = fromExpress('qs');
const { createHandler } = require('./helpers/http.cjs');

net.Server.prototype.listen = () => { throw new Error('No listeners in dependency security checks'); };
net.Socket.prototype.connect = () => { throw new Error('No network in dependency security checks'); };

test('IPv4 clients cannot match unrelated IPv6 or malformed mapped trust subnets', () => {
    // GHSA-jqcg-44mw-7w3h. This exercises the library without enabling proxy trust in CivicTrack.
    for (const subnet of ['::ffff:10.0.0.0/8', '::/1', '::ffff:10.0.0.0/104', '10.0.0.0/8']) {
        assert.equal(proxyaddr.compile(subnet)('203.0.113.8', 0), false, subnet);
    }
    assert.equal(proxyaddr.compile('::ffff:10.0.0.0/104')('10.1.2.3', 0), true);
    assert.equal(proxyaddr.compile('10.0.0.0/8')('10.1.2.3', 0), true);
});

test('query serialization handles attacker-controlled coercion without throwing and preserves normal comma arrays', () => {
    // GHSA-6pq8-jhm2-2vcw, using qs as resolved by Express itself.
    for (const input of [
        qs.parse('a[0][toString]=x', { allowPrototypes: true }),
        JSON.parse('{"a":[{"toString":"x"}]}'),
        qs.parse('a[][b]=c', { plainObjects: true })
    ]) {
        for (const encodeValuesOnly of [false, true]) {
            assert.doesNotThrow(() => qs.stringify(input, { arrayFormat: 'comma', encodeValuesOnly }));
        }
    }
    assert.equal(qs.stringify({ a: ['x', 'y'] }, { arrayFormat: 'comma' }), 'a=x%2Cy');
});

test('trailing compressed bytes cannot crash the parser and later requests still work', async () => {
    // GHSA-27r3-jxmh-p828. In-memory adapter, no database and no HTTP listener.
    const app = express();
    app.use(express.json({ limit: '16kb' }));
    app.post('/echo', (req, res) => res.json(req.body));
    app.use((error, req, res, next) => res.status(400).json({ message: 'Invalid body.' }));
    const handle = createHandler(app);
    const payload = { fixture: 'compressed body' };
    for (const [encoding, compress] of [['gzip', gzipSync], ['deflate', deflateSync]]) {
        const malformed = Buffer.concat([compress(Buffer.from(JSON.stringify(payload))), Buffer.from('trailing bytes')]);
        const response = await handle(new Request('https://example.invalid/echo', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': encoding }, body: malformed
        }));
        // A parser can finish the valid frame before seeing the invalid trailer.
        assert.ok([200, 400].includes(response.status));
        if (response.status === 200) assert.deepEqual(JSON.parse(response.body), payload);
        await new Promise(resolve => setImmediate(resolve));
        const next = await handle(new Request('https://example.invalid/echo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        }));
        assert.equal(next.status, 200);
        assert.deepEqual(JSON.parse(next.body), payload);
    }
});

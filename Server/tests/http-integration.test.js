const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const express = require('express');
const database = require('./helpers/database.cjs');
database.install();
// Reuse existing synthetic fixture material; never read/create a real signing key.
process.env.JWT_SECRET = database.fixturePassword;
process.env.CORS_ALLOWED_ORIGINS = 'https://frontend.example.invalid';
// This entire suite must work without any listening or connecting socket.
net.Server.prototype.listen = () => { throw new Error('Network listeners forbidden in adapter tests'); };
net.Socket.prototype.connect = () => { throw new Error('Network connections forbidden in adapter tests'); };
const images = require('../image_storage');
let imageDirectory, storage;
Object.assign(images, {
    saveImage: (...args) => storage.saveImage(...args),
    getImageStream: (...args) => storage.getImageStream(...args),
    deleteImage: (...args) => storage.deleteImage(...args)
});
const { createHandler } = require('./helpers/http.cjs');
const handler = createHandler(require('../app'));
const tokens = {};
const photoBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=', 'base64');

async function invoke(url, { method = 'GET', role, headers = {}, body } = {}) {
    const fields = new Headers(headers);
    if (role) fields.set('Authorization', 'Bearer ' + tokens[role]);
    if (body && !(body instanceof FormData)) {
        fields.set('Content-Type', 'application/json');
        body = JSON.stringify(body);
    }
    const response = await handler(new Request('https://api.example.invalid' + url, { method, headers: fields, body }));
    return { ...response, json: () => JSON.parse(response.body.toString('utf8')) };
}

before(async () => {
    imageDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'civictrack-adapter-'));
    storage = images.createLocalImageStorage(imageDirectory);
    for (const role of ['resident', 'admin']) {
        const result = await invoke('/api/auth/login', { method: 'POST', body: {
            identifier: role === 'resident' ? 'resident@example.invalid' : '1001', password: database.fixturePassword
        } });
        assert.equal(result.status, 200);
        tokens[role] = result.json().token;
    }
});
beforeEach(() => database.reset());
after(async () => {
    for (const entry of await fs.readdir(imageDirectory)) await fs.unlink(path.join(imageDirectory, entry));
    await fs.rmdir(imageDirectory);
});

test('health is cheap; readiness outage returns a clean error and next request recovers', async () => {
    database.state.unavailable = true;
    const health = await invoke('/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(health.json(), { status: 'CivicTrack running!' });
    assert.equal(database.state.queries.length, 0);
    const outage = await invoke('/api/health/ready');
    assert.equal(outage.status, 503);
    assert.deepEqual(outage.json(), { message: 'Database service unavailable.' });
    database.state.unavailable = false;
    assert.equal((await invoke('/api/health/ready')).status, 200);
});

test('protected routes preserve JWT, ownership and role checks through the adapter', async () => {
    assert.equal((await invoke('/api/issues')).status, 401);
    const own = await invoke('/api/issues?limit=5', { role: 'resident' });
    assert.equal(own.status, 200);
    assert.ok(own.json().every(issue => issue.resident_id === 1));
    assert.match(database.state.queries.at(-1).text, /LIMIT @limit/);
    assert.equal((await invoke('/api/issues/2', { role: 'resident' })).status, 403);
    assert.equal((await invoke('/api/issues/2/status', { role: 'resident', method: 'PATCH', body: { status: 'Resolved' } })).status, 403);
    assert.equal((await invoke('/api/issues/2/status', { role: 'admin', method: 'PATCH', body: { status: 'Resolved' } })).status, 200);
    database.state.unavailable = true;
    assert.equal((await invoke('/api/issues', { role: 'resident' })).status, 503);
    database.state.unavailable = false;
    assert.equal((await invoke('/api/issues', { role: 'resident' })).status, 200);
});

test('image-storage outages block readiness without affecting cheap health or exposing provider details', async () => {
    const original = images.checkReady;
    try {
        images.checkReady = async () => { throw new Error('Private storage credential or provider detail'); };
        assert.equal((await invoke('/api/health')).status, 200);
        const response = await invoke('/api/health/ready');
        assert.equal(response.status, 503);
        assert.deepEqual(response.json(), { message: 'Image storage unavailable.' });
    } finally { images.checkReady = original; }
    assert.equal((await invoke('/api/health/ready')).status, 200);
});

test('Render single-proxy HTTPS origin is accepted while unrelated origins stay denied', async () => {
    const app = require('../app');
    const original = app.get('trust proxy');
    app.set('trust proxy', 1);
    try {
        for (const [origin, expected] of [['https://api.example.invalid', 204], ['https://unrelated.example.invalid', 403]]) {
            const response = await handler(new Request('http://api.example.invalid/api/issues', {
                method: 'OPTIONS', headers: { Origin: origin, 'X-Forwarded-Proto': 'https', 'Access-Control-Request-Method': 'GET' }
            }));
            assert.equal(response.status, expected);
        }
    } finally { app.set('trust proxy', original); }
});

test('CORS preflight preserves allowed/disallowed origins and same-origin HTTPS handling', async () => {
    const allowed = await invoke('/api/issues', { method: 'OPTIONS', headers: {
        Origin: 'https://frontend.example.invalid', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type'
    } });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.body.length, 0);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://frontend.example.invalid');
    assert.equal(allowed.headers.get('access-control-allow-headers'), 'Authorization,Content-Type');
    const denied = await invoke('/api/issues', { method: 'OPTIONS', headers: { Origin: 'https://blocked.example.invalid' } });
    assert.equal(denied.status, 403);
    assert.deepEqual(denied.json(), { message: 'Origin not allowed.' });
    assert.equal((await invoke('/api/health', { headers: { Origin: 'https://api.example.invalid' } })).status, 200);
});

test('multipart upload and protected binary image download round-trip without a network transport', async () => {
    const form = new FormData();
    for (const [name, value] of Object.entries({ title: 'Adapter fixture', category: 'Other',
        location_address: 'Johannesburg', description: 'Fixture only', latitude: '-26.2', longitude: '28.04' })) form.set(name, value);
    form.set('issueImage', new Blob([photoBytes], { type: 'image/png' }), 'fixture.png');
    const result = await invoke('/api/issues', { method: 'POST', role: 'resident', body: form });
    assert.equal(result.status, 201);
    assert.deepEqual(result.json(), { message: 'Issue reported successfully!' });
    const photo = database.state.issues.find(issue => issue.issue_id === 10).image_url;
    try {
        assert.equal((await invoke(photo)).status, 401);
        for (const role of ['resident', 'admin']) {
            const image = await invoke(photo, { role });
            assert.equal(image.status, 200);
            assert.equal(image.headers.get('content-type'), 'image/png');
            assert.equal(image.headers.get('cache-control'), 'no-store');
            assert.deepEqual(image.body, photoBytes);
        }
    } finally { await require('../image_storage').deleteImage(photo.slice('/uploads/'.length)); }
});

test('translation preserves URL/query, headers, raw binary, writeHead headers and streamed response chunks', async () => {
    const app = express();
    app.post('/echo', express.raw({ type: 'application/octet-stream' }), (req, res) => {
        assert.equal(req.originalUrl, '/echo?name=one&name=two&path=%2F');
        assert.deepEqual(req.query.name, ['one', 'two']);
        assert.equal(req.get('x-fixture'), 'present');
        res.writeHead(202, { 'Content-Type': 'application/octet-stream', 'X-Result': 'preserved' });
        res.write(req.body.subarray(0, 2));
        res.end(req.body.subarray(2));
    });
    const bytes = Buffer.from([0, 255, 128, 1, 13, 10]);
    const result = await createHandler(app)(new Request('https://api.example.invalid/echo?name=one&name=two&path=%2F', {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Fixture': 'present' }, body: bytes
    }));
    assert.equal(result.status, 202);
    assert.equal(result.headers.get('x-result'), 'preserved');
    assert.equal(result.headers.get('transfer-encoding'), null);
    assert.deepEqual(result.body, bytes);
});

test('JSON body size and malformed JSON retain existing generic error responses', async () => {
    const tooLarge = await invoke('/api/auth/login', { method: 'POST', body: { identifier: 'x'.repeat(17000) } });
    assert.equal(tooLarge.status, 413);
    assert.deepEqual(tooLarge.json(), { message: 'Unable to complete this request.' });
    const malformed = await handler(new Request('https://api.example.invalid/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{'
    }));
    assert.equal(malformed.status, 400);
});

test('a failed response stream rejects without exposing its original error', async () => {
    const app = express();
    app.get('/broken', (req, res) => { res.write('partial'); res.destroy(new Error('Internal stream details')); });
    await assert.rejects(createHandler(app)(new Request('https://api.example.invalid/broken')), {
        message: 'Unable to complete the HTTP response.'
    });
});

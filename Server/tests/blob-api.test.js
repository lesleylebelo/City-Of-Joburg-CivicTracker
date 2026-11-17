const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const jwt = require('jsonwebtoken');
const database = require('./helpers/database.cjs');
const { fakeContainer } = require('./helpers/blob.cjs');
database.install();
process.env.JWT_SECRET = database.fixturePassword;
net.Server.prototype.listen = () => { throw new Error('No listeners in Blob integration tests'); };
net.Socket.prototype.connect = () => { throw new Error('No network in Blob integration tests'); };
const fake = fakeContainer();
const images = require('../image_storage');
Object.assign(images, images.createImageStorage({ IMAGE_STORAGE: 'blob' }, { getContainer: async () => fake.client }));
const { createHandler } = require('../src/http-adapter');
const handler = createHandler(require('../app'));
const tokens = {};
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=', 'base64');

async function invoke(url, { method = 'GET', role, body } = {}) {
    const headers = new Headers();
    if (role) headers.set('Authorization', 'Bearer ' + tokens[role]);
    if (body && !(body instanceof FormData)) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(body); }
    return handler(new Request('https://api.example.invalid' + url, { method, headers, body }));
}
function upload() {
    const form = new FormData();
    for (const [name, value] of Object.entries({ title: 'Blob fixture', category: 'Other', location_address: 'Johannesburg',
        description: 'Fixture only', latitude: '-26.2', longitude: '28.04' })) form.set(name, value);
    form.set('issueImage', new Blob([bytes], { type: 'image/png' }), 'private-name.png');
    return invoke('/api/issues', { method: 'POST', role: 'resident', body: form });
}
before(async () => {
    for (const role of ['resident', 'admin']) {
        const response = await invoke('/api/auth/login', { method: 'POST', body: {
            identifier: role === 'resident' ? 'resident@example.invalid' : '1001', password: database.fixturePassword
        } });
        assert.equal(response.status, 200);
        tokens[role] = JSON.parse(response.body.toString()).token;
    }
    tokens.other = jwt.sign({ id: 2, role: 'resident' }, process.env.JWT_SECRET, { expiresIn: '1h' });
});
beforeEach(() => { database.reset(); fake.state.blobs.clear(); fake.state.calls = []; });

test('Blob report URLs remain private; anonymous/other residents are denied before storage while owner/admin get exact bytes', async () => {
    const response = await upload();
    assert.equal(response.status, 201);
    assert.deepEqual(JSON.parse(response.body.toString()), { message: 'Issue reported successfully!' });
    const photo = database.state.issues.find(issue => issue.issue_id === 10).image_url;
    assert.match(photo, /^\/uploads\/[0-9a-f-]+\.png$/);
    const calls = fake.state.calls.length;
    assert.equal((await invoke(photo)).status, 401);
    assert.equal((await invoke(photo, { role: 'other' })).status, 404);
    assert.equal(fake.state.calls.length, calls);
    for (const role of ['resident', 'admin']) {
        const image = await invoke(photo, { role });
        assert.equal(image.status, 200);
        assert.equal(image.headers.get('content-type'), 'image/png');
        assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
        assert.deepEqual(image.body, bytes);
    }
    assert.equal((await invoke('/api/issues/10', { method: 'DELETE', role: 'resident' })).status, 200);
    assert.equal(fake.state.blobs.size, 0);
});

test('failed SQL insert deletes the newly saved blob and retains the existing API error', async () => {
    database.state.failIssueInsert = true;
    const response = await upload();
    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(response.body.toString()), { message: 'Server error.' });
    assert.equal(fake.state.blobs.size, 0);
    const save = fake.state.calls.find(call => call.operation === 'save');
    const deletion = fake.state.calls.find(call => call.operation === 'delete');
    assert.ok(save);
    assert.equal(deletion.id, save.id);
    assert.equal(database.state.issues.length, 3);
});

test('a missing blob behind an authorized report returns the existing generic 404 response', async () => {
    assert.equal((await upload()).status, 201);
    const photo = database.state.issues.find(issue => issue.issue_id === 10).image_url;
    fake.state.blobs.clear();
    const response = await invoke(photo, { role: 'resident' });
    assert.equal(response.status, 404);
    assert.deepEqual(JSON.parse(response.body.toString()), { message: 'Unable to complete this request.' });
});

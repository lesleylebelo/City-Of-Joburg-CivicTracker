const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const database = require('./helpers/database.cjs');
database.install();
process.env.JWT_SECRET = 'isolated-test-key-not-a-deployment-secret';
const app = require('../app');
let server, base;
const photo = path.join(__dirname, '../uploads/auth-test-photo.png');
const photoBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=', 'base64');
const tokens = {};

async function request(url, { role, token, method = 'GET', body } = {}) {
    const headers = {};
    if (role || token) headers.Authorization = 'Bearer ' + (token || tokens[role]);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    return { status: response.status, data, headers: response.headers };
}

before(async () => {
    await fs.writeFile(photo, photoBytes, { flag: 'wx' });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = 'http://127.0.0.1:' + server.address().port;
    for (const role of ['resident', 'admin']) {
        const identifier = role === 'resident' ? 'resident@example.invalid' : '1001';
        const response = await request('/api/auth/login', { method: 'POST', body: { identifier, password: database.fixturePassword } });
        assert.equal(response.status, 200);
        tokens[role] = response.data.token;
    }
});
beforeEach(async () => { database.reset(); await fs.writeFile(photo, photoBytes); });
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await fs.unlink(photo);
});

test('shared login accepts existing resident email and admin employee number or email', async () => {
    for (const [identifier, role] of [['resident@example.invalid', 'resident'], ['1001', 'admin'], ['admin@example.invalid', 'admin']]) {
        const result = await request('/api/auth/login', { method: 'POST', body: { identifier, password: database.fixturePassword, role: 'admin', id: 999 } });
        assert.equal(result.status, 200);
        assert.equal(result.data.user.role, role);
        assert.equal(result.data.user.id, 1);
        assert.equal(result.data.user.password_hash, undefined);
        assert.equal(jwt.verify(result.data.token, process.env.JWT_SECRET).role, role);
        assert.equal(result.headers.get('cache-control'), 'no-store');
    }
});

test('invalid credentials, unknown accounts, malformed identifiers and inactive accounts have generic errors and no token', async () => {
    let message;
    for (const identifier of ['missing@example.invalid', 'inactive@example.invalid', '1002', 'resident@example.invalid', { role: 'admin' }]) {
        const result = await request('/api/auth/login', { method: 'POST', body: { identifier, password: identifier === 'resident@example.invalid' ? 'wrong' : database.fixturePassword } });
        assert.equal(result.status, 401);
        assert.equal(result.data.token, undefined);
        message ??= result.data.message;
        assert.equal(result.data.message, message);
    }
});

test('overlapping credentials fail generically; client role hints and legacy URLs cannot select an account', async () => {
    const body = { identifier: 'shared@example.invalid', password: database.fixturePassword };
    const ambiguous = await request('/api/auth/login', { method: 'POST', body });
    assert.equal(ambiguous.status, 401);
    assert.deepEqual(ambiguous.data, { message: 'Unable to sign in. Check your details and try again.' });
    assert.equal(ambiguous.data.token, undefined);
    for (const role of ['resident', 'admin']) {
        const selected = await request('/api/auth/login', { method: 'POST', body: { ...body, account_type: role } });
        assert.equal(selected.status, 401);
        assert.deepEqual(selected.data, ambiguous.data);
    }
    const selected = await request('/api/auth/login', { method: 'POST', body: { identifier: 'resident@example.invalid', password: database.fixturePassword, account_type: 'admin' } });
    assert.equal(selected.status, 200);
    assert.equal(selected.data.user.role, 'resident');
    for (const [url, identifierField] of [['resident/login', 'email'], ['admin/login', 'employee_number']]) {
        const result = await request('/api/auth/' + url, { method: 'POST', body: { [identifierField]: body.identifier, password: body.password } });
        assert.equal(result.status, 401);
        assert.deepEqual(result.data, ambiguous.data);
    }
    const unique = await request('/api/auth/login', { method: 'POST', body: { identifier: '1004', password: body.password } });
    assert.equal(unique.status, 200);
    assert.equal(unique.data.user.role, 'admin');
});

test('matching identifiers with different passwords authenticate only the matching account', async () => {
    const result = await request('/api/auth/login', { method: 'POST', body: { identifier: 'different@example.invalid', password: database.fixturePassword } });
    assert.equal(result.status, 200);
    assert.equal(result.data.user.role, 'resident');
});

test('ambiguous matches within the same role fail generically rather than picking the first account', async () => {
    database.state.accounts.push({ ...database.state.accounts[3], id: 6, email: 'alternative@example.invalid', employee_number: 'admin@example.invalid' });
    try {
        const result = await request('/api/auth/login', { method: 'POST', body: { identifier: 'admin@example.invalid', password: database.fixturePassword, account_type: 'admin' } });
        assert.equal(result.status, 401);
        assert.equal(result.data.message, 'Unable to sign in. Check your details and try again.');
        assert.equal(result.data.token, undefined);
    } finally {
        database.state.accounts.pop();
    }
});

test('legacy endpoints use the same verified login flow', async () => {
    for (const [url, body, role] of [
        ['/resident/login', { email: 'resident@example.invalid' }, 'resident'],
        ['/admin/login', { employee_number: '1001' }, 'admin']
    ]) {
        const result = await request('/api/auth' + url, { method: 'POST', body: { ...body, password: database.fixturePassword } });
        assert.equal(result.status, 200);
        assert.equal(result.data.user.role, role);
    }
});

test('missing, forged, expired and malformed JWT sessions are rejected', async () => {
    for (const token of [undefined, 'invalid', tokens.resident.slice(0, -3) + 'xxx',
        jwt.sign({ id: 1, role: 'resident' }, process.env.JWT_SECRET, { expiresIn: -1 }),
        jwt.sign({ id: 1, role: 'root' }, process.env.JWT_SECRET, { expiresIn: '1h' }),
        jwt.sign({ id: 1, role: 'resident' }, process.env.JWT_SECRET)]) {
        assert.equal((await request('/api/auth/session', { token })).status, 401);
        assert.equal((await request('/api/issues', { token })).status, 401);
    }
});

test('sessions are rechecked against active database accounts and return a server-confirmed role', async () => {
    const result = await request('/api/auth/session', { role: 'resident' });
    assert.equal(result.status, 200);
    assert.equal(result.data.user.role, 'resident');
    assert.ok(result.data.expires_at > Date.now() / 1000);
    database.state.accounts[0].is_active = false;
    assert.equal((await request('/api/issues', { role: 'resident' })).status, 401);
});

test('database outage fails closed without establishing a session', async () => {
    database.state.unavailable = true;
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { identifier: 'resident@example.invalid', password: database.fixturePassword } })).status, 503);
    assert.equal((await request('/api/issues', { role: 'resident' })).status, 503);
});

test('residents list only their own reports and cannot read, edit or delete another resident report', async () => {
    const list = await request('/api/issues', { role: 'resident' });
    assert.equal(list.status, 200);
    assert.ok(list.data.length > 0 && list.data.every(issue => issue.resident_id === 1));
    const history = await request('/api/issues/my-history', { role: 'resident' });
    assert.ok(history.data.length > 0 && history.data.every(issue => issue.resident_id === 1));
    assert.equal((await request('/api/issues/1', { role: 'resident' })).status, 200);
    for (const method of ['GET', 'PUT', 'DELETE']) {
        assert.equal((await request('/api/issues/2', { role: 'resident', method, body: method === 'PUT' ? { title: 'Changed' } : undefined })).status, 403);
    }
    assert.equal(database.state.issues.find(issue => issue.issue_id === 2).title, 'Another resident report');
});

test('residents can create reports as themselves, edit/delete their own pending reports, but not resolved reports', async () => {
    const body = { title: 'New report', category: 'Other', priority: 'Medium', location_address: 'Joburg', description: 'Test issue', latitude: -26.2, longitude: 28.04, resident_id: 2 };
    assert.equal((await request('/api/issues', { role: 'resident', method: 'POST', body })).status, 201);
    assert.equal(database.state.issues.at(-1).resident_id, 1);
    assert.equal((await request('/api/issues/1', { role: 'resident', method: 'PUT', body })).status, 200);
    assert.equal((await request('/api/issues/3', { role: 'resident', method: 'PUT', body })).status, 400);
    assert.equal((await request('/api/issues/3', { role: 'resident', method: 'DELETE' })).status, 400);
    assert.equal((await request('/api/issues/1', { role: 'resident', method: 'DELETE' })).status, 200);
});

test('an intervening status change prevents resident edits and deletion', async () => {
    for (const method of ['PUT', 'DELETE']) {
        database.reset();
        database.state.beforeWrite = () => { database.state.issues[0].status = 'Resolved'; };
        assert.equal((await request('/api/issues/1', { role: 'resident', method, body: method === 'PUT' ? { title: 'Changed' } : undefined })).status, 409);
        assert.equal(database.state.issues[0].title, '<img src=x onerror=alert(1)>');
    }
});

const adminOnly = [
    ['GET', '/api/issues/stats'], ['GET', '/api/issues/analytics'], ['GET', '/api/issues/residents-list'],
    ['GET', '/api/issues/resident/2'], ['GET', '/api/residents/stats'], ['GET', '/api/projects/stats'],
    ['PATCH', '/api/issues/2/status', { status: 'Resolved' }],
    ['POST', '/api/projects', { title: 'Project', description: 'Description', category: 'Other', location_address: 'Joburg' }],
    ['PUT', '/api/projects/1', { title: 'Project' }], ['DELETE', '/api/projects/1'],
    ['POST', '/api/notices', { title: 'Notice', content: 'Update' }], ['PUT', '/api/notices/1', {}], ['DELETE', '/api/notices/1'],
    ['POST', '/api/polls', { question: 'Question', options: ['Yes', 'No'] }], ['PUT', '/api/polls/1', {}], ['PATCH', '/api/polls/1/close', {}], ['DELETE', '/api/polls/1'],
    ['POST', '/api/events', { title: 'Event', description: 'Details', location_address: 'Joburg', event_date: '2027-01-01', start_time: '12:00' }],
    ['PUT', '/api/events/1', {}], ['DELETE', '/api/events/1']
];
for (const [method, url, body] of adminOnly) {
    test(`role boundary: ${method} ${url} denies residents and preserves administrator access`, async () => {
        assert.equal((await request(url, { role: 'resident', method, body })).status, 403);
        assert.equal((await request(url, { role: 'admin', method, body })).status < 300, true);
    });
}

test('admins retain report reads/status/deletion but cannot impersonate a resident through colliding numeric IDs', async () => {
    assert.equal((await request('/api/issues/2', { role: 'admin' })).status, 200);
    const update = await request('/api/issues/2/status', { role: 'admin', method: 'PATCH', body: { status: 'Resolved' } });
    assert.equal(update.status, 200);
    assert.equal(database.state.issues.find(issue => issue.issue_id === 2).status, 'Resolved');
    assert.equal((await request('/api/issues/2', { role: 'admin', method: 'DELETE' })).status, 200);
    for (const [method, url, body] of [['POST', '/api/issues', {}], ['GET', '/api/issues/my-history'], ['PUT', '/api/issues/1', {}], ['POST', '/api/polls/1/vote', { option_id: 1 }]]) {
        assert.equal((await request(url, { role: 'admin', method, body })).status, 403);
    }
});

test('both roles retain civic content reads; resident votes remain available', async () => {
    for (const role of ['resident', 'admin']) {
        for (const url of ['/api/projects', '/api/notices', '/api/events', '/api/polls', '/api/polls/1']) {
            assert.equal((await request(url, { role })).status, 200);
        }
    }
    assert.equal((await request('/api/polls/1/vote', { role: 'resident', method: 'POST', body: { option_id: 1 } })).status, 201);
});

test('report photos require sign-in and report ownership, with administrator access retained', async () => {
    assert.equal((await request('/uploads/auth-test-photo.png')).status, 401);
    const other = jwt.sign({ id: 2, role: 'resident' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    assert.equal((await request('/uploads/auth-test-photo.png', { token: other })).status, 404);
    for (const role of ['resident', 'admin']) {
        const response = await fetch(base + '/uploads/auth-test-photo.png', { headers: { Authorization: 'Bearer ' + tokens[role] } });
        assert.equal(response.status, 200);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), photoBytes);
    }
});

test('administrator registration still rejects an unauthorised employee number', async () => {
    const result = await request('/api/auth/admin/register', { method: 'POST', body: { employee_number: '99999', full_names: 'Test', email: 'test@example.invalid', password: database.fixturePassword } });
    assert.equal(result.status, 403);
    assert.ok(!database.state.queries.some(query => query.text.includes('INSERT INTO administrators')));
});

test('administrator registration rejects registered employees and retains the authorised registration path', async () => {
    const body = { employee_number: '2001', full_names: 'Test Employee', email: 'new-admin@example.invalid', password: database.fixturePassword };
    database.state.employees = [{ employee_number: '2001', is_registered: true }];
    assert.equal((await request('/api/auth/admin/register', { method: 'POST', body })).status, 409);
    database.state.employees[0].is_registered = false;
    assert.equal((await request('/api/auth/admin/register', { method: 'POST', body })).status, 201);
    assert.ok(database.state.queries.some(query => query.text.includes('INSERT INTO administrators')));
});

test('backend source/schema/configuration are not public static files', async () => {
    for (const url of ['/server.js', '/auth_routes.js', '/Database/Schema/civictrack.sql', '/.env']) assert.equal((await request(url)).status, 404);
    assert.equal((await request('/Pages/Public/Sign-In/Sign-In.html')).status, 200);
});

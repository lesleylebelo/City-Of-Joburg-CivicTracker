const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { PGlite } = require('@electric-sql/pglite');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
// Keep embedded SQL and temporary image fixtures independent of private .env.
process.env.NODE_ENV = 'test';
process.env.IMAGE_STORAGE_PROVIDER = 'local';
const database = require('../database');
const fixture = require('./helpers/database.cjs');
let engine, server, imageDirectory, db;
const tokens = {};
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=', 'base64');
const ids = {};

async function request(route, { method = 'GET', role, token, body } = {}) {
    const headers = {};
    if (role || token) headers.Authorization = 'Bearer ' + (token || tokens[role]);
    if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    return fetch('http://127.0.0.1:' + server.address().port + route, { method, headers, body });
}
async function register(kind, email, extra = {}) {
    return request('/api/auth/' + kind + '/register', { method: 'POST', body: {
        full_names: 'PostgreSQL Fixture', email, phone_number: '0000000000',
        password: fixture.fixturePassword, ...extra
    } });
}
async function login(role, identifier) {
    const response = await request('/api/auth/login', { method: 'POST', body: { identifier, password: fixture.fixturePassword } });
    assert.equal(response.status, 200);
    const result = await response.json();
    tokens[role] = result.token;
    return result.user;
}
function report(category = 'Other') {
    const form = new FormData();
    for (const [name, value] of Object.entries({ title: 'PG report', description: 'Fixture only', category,
        location_address: 'Johannesburg', latitude: '-26.2', longitude: '28.04' })) form.set(name, value);
    form.set('issueImage', new Blob([bytes], { type: 'image/png' }), 'fixture.png');
    return request('/api/issues', { method: 'POST', role: 'resident', body: form });
}

before(async () => {
    // Real embedded PostgreSQL SQL/constraints/roles; no TCP database or cloud access.
    engine = await PGlite.create({ parsers: { 20: value => Number(value), 1082: value => value } });
    await engine.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;');
    for (const file of ['001_schema.sql', '002_server_permissions.sql', 'test_employee.sql']) {
        await engine.exec(await fs.readFile(path.join(__dirname, '../Database/Postgres', file), 'utf8'));
    }
    await engine.exec('SET ROLE civictrack_app');
    const pool = new EventEmitter();
    pool.connect = async () => ({
        async query({ text, values }) {
            const result = await engine.query(text, values);
            return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
        }, release() {}
    });
    pool.end = async () => {};
    db = database.createDatabase(() => pool);
    database.poolPromise = Promise.resolve(db);
    process.env.JWT_SECRET = fixture.fixturePassword;
    imageDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'civictrack-postgres-images-'));
    const images = require('../image_storage');
    Object.assign(images, images.createLocalImageStorage(imageDirectory));
    server = require('../app').listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (engine) await engine.close();
    if (imageDirectory) {
        for (const entry of await fs.readdir(imageDirectory)) await fs.unlink(path.join(imageDirectory, entry));
        await fs.rmdir(imageDirectory);
    }
});

test('fresh schema creates twelve protected tables and starts with no accounts or reports', async () => {
    const tables = await engine.query("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='civictrack'");
    assert.equal(tables.rows.length, 12);
    assert.ok(tables.rows.every(table => table.rowsecurity));
    for (const table of ['residents', 'administrators', 'reported_issues']) {
        assert.equal((await engine.query('SELECT COUNT(*) AS count FROM civictrack.' + table)).rows[0].count, 0);
    }
    assert.equal((await request('/api/health/ready')).status, 200);
});

test('approved administrator and residents register and share case-insensitive sign-in', async () => {
    assert.equal((await register('admin', 'denied@example.invalid', { employee_number: 'unapproved' })).status, 403);
    assert.equal((await register('resident', 'resident@example.invalid')).status, 201);
    assert.equal((await register('resident', 'another@example.invalid')).status, 201);
    assert.equal((await register('admin', 'admin@example.invalid', { employee_number: 'CT-TEST-ADMIN' })).status, 201);
    assert.equal((await register('admin', 'other-admin@example.invalid', { employee_number: 'CT-TEST-ADMIN' })).status, 409);
    const approved = await engine.query('SELECT is_registered FROM civictrack.authorised_employees');
    assert.equal(approved.rows[0].is_registered, true);
    const resident = await login('resident', 'RESIDENT@EXAMPLE.INVALID');
    const admin = await login('admin', 'CT-TEST-ADMIN');
    await login('other', 'another@example.invalid');
    assert.equal(resident.role, 'resident');
    assert.equal(admin.role, 'admin');
    // The separate account ID namespaces still collide safely.
    assert.equal(resident.id, admin.id);
    ids.resident = resident.id;
    for (const role of ['resident', 'admin']) assert.equal((await request('/api/auth/session', { role })).status, 200);
    const stored = await engine.query('SELECT password_hash FROM civictrack.residents WHERE resident_id=$1', [resident.id]);
    assert.ok(await bcrypt.compare(fixture.fixturePassword, stored.rows[0].password_hash));
    assert.equal((await register('resident', 'RESIDENT@EXAMPLE.INVALID')).status, 409);
});

test('PostgreSQL enforces case-insensitive uniqueness and generic ambiguous/inactive sign-in denial', async () => {
    await assert.rejects(engine.query(`INSERT INTO civictrack.residents (full_names,email,phone_number,password_hash)
        VALUES ('duplicate', 'RESIDENT@EXAMPLE.INVALID', '0', 'unused')`), { code: '23505' });
    assert.equal((await register('resident', 'admin@example.invalid')).status, 201);
    const collision = await request('/api/auth/login', { method: 'POST', body: { identifier: 'ADMIN@EXAMPLE.INVALID', password: fixture.fixturePassword } });
    assert.equal(collision.status, 401);
    assert.equal((await login('admin', 'CT-TEST-ADMIN')).role, 'admin');
    await engine.query('UPDATE civictrack.residents SET is_active=FALSE WHERE resident_id=$1', [ids.resident]);
    assert.equal((await request('/api/auth/session', { role: 'resident' })).status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { identifier: 'resident@example.invalid', password: fixture.fixturePassword } })).status, 401);
    await engine.query('UPDATE civictrack.residents SET is_active=TRUE WHERE resident_id=$1', [ids.resident]);
    const expired = jwt.sign({ id: ids.resident, role: 'resident' }, fixture.fixturePassword, { expiresIn: -1 });
    assert.equal((await request('/api/issues', { token: expired })).status, 401);
});

test('real PostgreSQL report queries preserve ownership, binary downloads, pending edits and admin status actions', async () => {
    assert.equal((await report()).status, 201);
    const response = await request('/api/issues?limit=1', { role: 'resident' });
    assert.equal(response.status, 200);
    const [issue] = await response.json();
    ids.issue = issue.issue_id;
    assert.equal(issue.resident_id, ids.resident);
    assert.equal((await request('/api/issues/' + issue.issue_id, { role: 'other' })).status, 403);
    assert.deepEqual(await (await request('/api/issues', { role: 'other' })).json(), []);
    assert.equal((await request(issue.image_url)).status, 401);
    assert.equal((await request(issue.image_url, { role: 'other' })).status, 404);
    for (const role of ['resident', 'admin']) {
        const image = await request(issue.image_url, { role });
        assert.equal(image.status, 200);
        assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
    }
    assert.equal((await request('/api/issues/' + issue.issue_id, { method: 'PUT', role: 'resident', body: {
        title: 'Changed', description: 'Updated', category: 'Other', priority: 'Medium', location_address: 'Joburg'
    } })).status, 200);
    assert.equal((await request('/api/issues/' + issue.issue_id + '/status', { method: 'PATCH', role: 'resident', body: { status: 'Resolved' } })).status, 403);
    assert.equal((await request('/api/issues/' + issue.issue_id + '/status', { method: 'PATCH', role: 'admin', body: { status: 'Resolved' } })).status, 200);
    assert.equal((await request('/api/issues/' + issue.issue_id, { method: 'DELETE', role: 'resident' })).status, 400);
    for (const route of ['/api/issues/stats', '/api/issues/analytics', '/api/issues/residents-list', '/api/residents/stats']) {
        assert.equal((await request(route, { role: 'resident' })).status, 403);
        assert.equal((await request(route, { role: 'admin' })).status, 200);
    }
    assert.equal((await request('/api/issues/' + issue.issue_id, { method: 'DELETE', role: 'admin' })).status, 200);
    assert.deepEqual(await fs.readdir(imageDirectory), []);
});

test('a PostgreSQL check-constraint failure removes the uploaded image', async () => {
    assert.equal((await report('Invalid category')).status, 500);
    assert.deepEqual(await fs.readdir(imageDirectory), []);
});

test('projects, notices, events and poll RETURNING/boolean/date queries execute in PostgreSQL', async () => {
    const cases = [
        ['projects', 'development_projects', 'project_id', { title: 'Test project', description: 'Details', category: 'Other', location_address: 'Joburg', status: 'Planned' }],
        ['notices', 'notices', 'notice_id', { title: 'Test notice', content: 'Details', category: 'General' }],
        ['events', 'events', 'event_id', { title: 'Test event', description: 'Details', location_address: 'Joburg', category: 'Other', event_date: '2099-01-01', start_time: '12:00', end_time: '13:00' }],
        ['polls', 'polls', 'poll_id', { question: 'Test poll?', options: ['Yes', 'No'] }]
    ];
    for (const [route, table, id, body] of cases) {
        assert.equal((await request('/api/' + route, { method: 'POST', role: 'resident', body })).status, 403);
        assert.equal((await request('/api/' + route, { method: 'POST', role: 'admin', body })).status, 201);
        const rows = await engine.query('SELECT ' + id + ' FROM civictrack.' + table);
        const value = rows.rows[0][id];
        for (const role of ['resident', 'admin']) assert.equal((await request('/api/' + route + '?limit=1', { role })).status, 200);
        assert.equal((await request('/api/' + route + '/' + value, { method: 'PUT', role: 'admin', body })).status, 200);
        if (route === 'polls') assert.equal((await request('/api/polls/' + value + '/close', { method: 'PATCH', role: 'admin', body: {} })).status, 200);
        assert.equal((await request('/api/' + route + '/' + value, { method: 'DELETE', role: 'admin' })).status, 200);
    }
});

test('poll votes enforce one vote per resident and deletion handles dependent vote rows atomically', async () => {
    assert.equal((await request('/api/polls', { method: 'POST', role: 'admin', body: {
        question: 'Vote test?', options: ['Yes', 'No']
    } })).status, 201);
    const poll = (await engine.query('SELECT poll_id FROM civictrack.polls')).rows[0];
    const option = (await engine.query('SELECT option_id FROM civictrack.poll_options WHERE poll_id=$1', [poll.poll_id])).rows[0];
    const route = '/api/polls/' + poll.poll_id;
    assert.equal((await request(route + '/vote', { method: 'POST', role: 'resident', body: option })).status, 201);
    assert.equal((await request(route + '/vote', { method: 'POST', role: 'resident', body: option })).status, 409);
    assert.equal((await request(route + '/vote', { method: 'POST', role: 'admin', body: option })).status, 403);
    assert.equal((await request(route, { method: 'DELETE', role: 'admin' })).status, 200);
    for (const table of ['poll_votes', 'poll_options', 'polls']) {
        assert.equal((await engine.query('SELECT COUNT(*) AS count FROM civictrack.' + table + ' WHERE poll_id=$1', [poll.poll_id])).rows[0].count, 0);
    }
});

test('server role cannot authorize employees or change schema; anonymous/Supabase browser roles cannot read private tables', async () => {
    await assert.rejects(engine.query("INSERT INTO civictrack.authorised_employees (employee_number,full_names,role) VALUES ('fake','fake','fake')"), { code: '42501' });
    await assert.rejects(engine.query('CREATE TABLE civictrack.forbidden (id integer)'), { code: '42501' });
    await assert.rejects(engine.query("UPDATE civictrack.authorised_employees SET role='forged'"), { code: '42501' });
    await engine.exec('RESET ROLE');
    try {
        for (const role of ['anon', 'authenticated']) {
            await engine.exec('SET ROLE ' + role);
            await assert.rejects(engine.query('SELECT * FROM civictrack.residents'), { code: '42501' });
            await engine.exec('RESET ROLE');
        }
    } finally { await engine.exec('SET ROLE civictrack_app'); }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const net = require('node:net');
const originalConnect = net.Socket.prototype.connect;
const pg = require('pg');
let offline = true, driverAttempts = 0;
pg.Pool = class extends EventEmitter {
    async connect() {
        driverAttempts++;
        if (offline) throw new Error('Private driver details');
        return { query: async () => ({ rows: [{ value: 1 }], rowCount: 1 }), release() {} };
    }
    async end() {}
};
const fixture = require('./helpers/database.cjs');
// Readiness recovery here tests only the fake database, never hosted Storage.
process.env.NODE_ENV = 'test';
process.env.IMAGE_STORAGE_PROVIDER = 'local';
Object.assign(process.env, { DB_HOST: 'fixture.invalid', DB_USER: 'fixture', DB_PASSWORD: fixture.fixturePassword });
// Even a failed driver replacement cannot contact a real database.
net.Socket.prototype.connect = () => { throw new Error('Database sockets forbidden'); };
const { createDatabase, configuration, bindParameters } = require('../database');

test('PostgreSQL TLS is verified by default; insecure remote modes are rejected', () => {
    const defaults = configuration({});
    assert.equal(defaults.ssl.rejectUnauthorized, true);
    assert.equal(defaults.port, 5432);
    assert.equal(defaults.max, 5);
    assert.equal(defaults.connectionTimeoutMillis, 15000);
    assert.equal(defaults.query_timeout, 15000);
    const local = configuration({ DB_HOST: '127.0.0.1', DB_SSL_MODE: 'disable', DB_POOL_MAX: '3', DB_CONNECT_TIMEOUT_MS: '2000' });
    assert.equal(local.ssl, false);
    assert.equal(local.max, 3);
    assert.equal(local.connectionTimeoutMillis, 2000);
    assert.throws(() => configuration({ DB_HOST: 'remote.invalid', DB_SSL_MODE: 'disable' }));
    assert.throws(() => configuration({ DB_SSL_MODE: 'invalid' }));
    assert.equal(configuration({ DB_POOL_MAX: '-1' }).max, 5);
    assert.equal(defaults.types.getTypeParser(1082)('2027-01-01'), '2027-01-01');
    assert.equal(defaults.types.getTypeParser(20)('12'), 12);
    assert.throws(() => defaults.types.getTypeParser(20)('9007199254740992'));
});

test('named inputs remain bound values, including reused inputs and hostile text', () => {
    const hostile = "'; DROP TABLE residents; --";
    const result = bindParameters('SELECT @email, @email, @id', { email: hostile, id: 1 });
    assert.equal(result.text, 'SELECT $1, $1, $2');
    assert.deepEqual(result.values, [hostile, 1]);
    assert.throws(() => bindParameters('SELECT @missing', {}), /Missing database parameter/);
});

test('relative provider CA paths resolve from Server independently of the launch directory', () => {
    const original = process.cwd();
    try {
        process.chdir(require('node:os').tmpdir());
        const config = configuration({ DB_SSL_CA_FILE: 'certs/supabase-prod-ca-2021.crt' });
        assert.equal(config.ssl.rejectUnauthorized, true);
        assert.match(config.ssl.ca, /-----BEGIN CERTIFICATE-----/);
    } finally { process.chdir(original); }
});

test('binding skips strings, quoted identifiers, nested comments and dollar bodies', () => {
    const text = "SELECT '@email', \"@column\", $$@body$$, @id /* @skip /* @nested */ */ -- @line\n";
    const result = bindParameters(text, { id: 7 });
    assert.equal(result.text, text.replace('@id', '$1'));
    assert.deepEqual(result.values, [7]);
    for (const invalid of ["SELECT 'unclosed", 'SELECT /* unclosed', 'SELECT $$unclosed']) assert.throws(() => bindParameters(invalid));
});

test('lazy PostgreSQL pool retries acquisition, preserves affected rows and never replays writes', async () => {
    let creations = 0, attempts = 0, queries = 0, releases = 0, ends = 0;
    let connected = false;
    const waits = [], pool = new EventEmitter();
    pool.connect = async () => { attempts++; if (!connected) throw new Error('Private connection details'); return {
        query: async request => { queries++; assert.equal(request.text, 'UPDATE example SET x=$1'); return { rows: [], rowCount: 2 }; },
        release() { releases++; }
    }; };
    pool.end = async () => { ends++; };
    const db = createDatabase(() => { creations++; return pool; }, { now: () => 1000, wait: async ms => waits.push(ms) });
    assert.equal(creations, 0);
    await assert.rejects(db.request().input('x', 3).query('UPDATE example SET x=@x'), { status: 503, message: 'Database service unavailable.' });
    connected = true;
    assert.deepEqual((await db.request().input('x', 3).query('UPDATE example SET x=@x')).rowsAffected, [2]);
    assert.equal(creations, 1);
    assert.equal(attempts, 2);
    assert.equal(queries, 1);
    assert.equal(releases, 1);
    assert.deepEqual(waits, [0, 250]);
    pool.emit('error', new Error('Private idle failure'));
    await db.close();
    assert.equal(ends, 1);
});

test('cheap health makes no connection and readiness handles acquisition failure and recovery', async () => {
    net.Socket.prototype.connect = originalConnect;
    const server = require('../app').listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
        const base = 'http://127.0.0.1:' + server.address().port;
        assert.equal((await fetch(base + '/api/health')).status, 200);
        assert.equal(driverAttempts, 0);
        assert.equal((await fetch(base + '/api/health/ready')).status, 503);
        offline = false;
        assert.equal((await fetch(base + '/api/health/ready')).status, 200);
        assert.equal(driverAttempts, 2);
    } finally {
        await new Promise(resolve => server.close(resolve));
        await (await require('../database').poolPromise).close();
    }
});

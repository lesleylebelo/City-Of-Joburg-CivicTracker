const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const sql = require('mssql');

// Replace the driver before importing the app: no network connection can be made.
let offline = true;
let driverAttempts = 0;
sql.ConnectionPool = class extends EventEmitter {
    async connect() {
        driverAttempts++;
        if (offline) throw new Error('Simulated SQL connection failure');
        this.connected = true;
    }
    async close() { this.connected = false; }
    request() { return { query: async statement => {
        assert.equal(statement, 'SELECT 1');
        return { recordset: [{ value: 1 }] };
    } }; }
};
const { createPoolManager, configuration } = require('../db_sqlserver');

test('TLS defaults are strict; local overrides, limits and timeouts are explicit', () => {
    const defaults = configuration({});
    assert.equal(defaults.options.encrypt, true);
    assert.equal(defaults.options.trustServerCertificate, false);
    assert.equal(defaults.pool.max, 5);
    assert.equal(defaults.connectionTimeout, 15000);
    assert.equal(defaults.requestTimeout, 15000);
    const local = configuration({ DB_ENCRYPT: 'false', DB_TRUST_SERVER_CERT: 'true',
        DB_POOL_MAX: '3', DB_CONNECT_TIMEOUT_MS: '2000', DB_REQUEST_TIMEOUT_MS: '4000' });
    assert.equal(local.options.encrypt, false);
    assert.equal(local.options.trustServerCertificate, true);
    assert.equal(local.pool.max, 3);
    assert.equal(local.connectionTimeout, 2000);
    assert.equal(local.requestTimeout, 4000);
    assert.equal(configuration({ DB_POOL_MAX: '-1' }).pool.max, 5);
});

test('lazy shared pool returns clean 503, retries next acquisition with backoff and reuses success', async () => {
    let attempts = 0;
    let closes = 0;
    const waits = [];
    const manager = createPoolManager(() => {
        attempts++;
        const candidate = new EventEmitter();
        candidate.close = async () => { closes++; };
        candidate.connect = async () => {
            if (attempts === 1) throw new Error('Driver details must stay private');
            candidate.connected = true;
        };
        return candidate;
    }, { now: () => 1000, wait: async ms => { waits.push(ms); } });
    assert.equal(attempts, 0);
    const outage = await Promise.allSettled([manager.getPool(), manager.getPool()]);
    assert.equal(attempts, 1);
    for (const result of outage) {
        assert.equal(result.status, 'rejected');
        assert.equal(result.reason.status, 503);
        assert.equal(result.reason.message, 'Database service unavailable.');
    }
    const [first, second] = await Promise.all([manager.getPool(), manager.getPool()]);
    assert.equal(first, second);
    assert.equal(await manager.getPool(), first);
    assert.equal(attempts, 2);
    assert.deepEqual(waits, [0, 250]);
    assert.equal(closes, 1);
    first.emit('error', new Error('Simulated pool loss'));
    assert.notEqual(await manager.getPool(), first);
    assert.equal(attempts, 3);
});

test('app starts without database configuration; cheap health works and readiness fails cleanly', async () => {
    const app = require('../app');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
        const base = 'http://127.0.0.1:' + server.address().port;
        const health = await fetch(base + '/api/health');
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: 'CivicTrack running!' });
        assert.equal(driverAttempts, 0);
        const ready = await fetch(base + '/api/health/ready');
        assert.equal(ready.status, 503);
        assert.deepEqual(await ready.json(), { message: 'Database service unavailable.' });
        offline = false;
        const recovered = await fetch(base + '/api/health/ready');
        assert.equal(recovered.status, 200);
        assert.deepEqual(await recovered.json(), { status: 'ready' });
        assert.equal(driverAttempts, 2);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

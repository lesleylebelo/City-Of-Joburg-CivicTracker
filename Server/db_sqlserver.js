const sql = require('mssql');
require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });

function positiveInteger(value, fallback) {
    return /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) && Number(value) > 0
        ? Number(value) : fallback;
}

function configuration(env = process.env) {
    return {
        server: env.DB_HOST,
        database: env.DB_NAME,
        port: positiveInteger(env.DB_PORT, 1433),
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        connectionTimeout: positiveInteger(env.DB_CONNECT_TIMEOUT_MS, 15000),
        requestTimeout: positiveInteger(env.DB_REQUEST_TIMEOUT_MS, 15000),
        options: {
            encrypt: env.DB_ENCRYPT !== 'false',
            trustServerCertificate: env.DB_TRUST_SERVER_CERT === 'true',
            enableArithAbort: true
        },
        pool: { max: positiveInteger(env.DB_POOL_MAX, 5), min: 0, idleTimeoutMillis: 30000 }
    };
}

// Dependency injection keeps lifecycle tests isolated from the real SQL driver.
function createPoolManager(makePool, { backoffMs = 250, now = Date.now,
    wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    let connecting;
    let pool;
    let retryAt = 0;
    const unavailable = () => Object.assign(new Error('Database service unavailable.'), { status: 503 });
    const close = candidate => Promise.resolve().then(() => candidate?.close()).catch(() => {});

    async function getPool() {
        if (pool?.connected) return pool;
        if (!connecting) {
            if (pool) { void close(pool); pool = undefined; }
            connecting = (async () => {
                await wait(Math.max(0, retryAt - now()));
                let candidate;
                try {
                    candidate = makePool();
                    candidate.on('error', () => {
                        if (pool === candidate) {
                            pool = undefined;
                            retryAt = now() + backoffMs;
                            void close(candidate);
                        }
                    });
                    await candidate.connect();
                    pool = candidate;
                    return pool;
                } catch {
                    retryAt = now() + backoffMs;
                    await close(candidate);
                    throw unavailable();
                }
            })().finally(() => { connecting = undefined; });
        }
        return connecting;
    }
    return { getPool };
}

const manager = createPoolManager(() => new sql.ConnectionPool(configuration()));
// Keep existing `await poolPromise` call sites without an eager connection promise.
const poolPromise = { then(resolve, reject) { return manager.getPool().then(resolve, reject); } };
module.exports = { sql, poolPromise, configuration, createPoolManager };

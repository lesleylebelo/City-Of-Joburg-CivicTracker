const fs = require('node:fs');
const path = require('node:path');
const { Pool, types } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

function positiveInteger(value, fallback) {
    return /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) && Number(value) > 0
        ? Number(value) : fallback;
}

function configuration(env = process.env) {
    const mode = env.DB_SSL_MODE || 'require';
    if (!['require', 'disable'].includes(mode)) throw new Error('Invalid database TLS mode.');
    if (mode === 'disable' && !['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST)) {
        throw new Error('Unencrypted database connections are limited to loopback development.');
    }
    const ssl = mode === 'disable' ? false : {
        rejectUnauthorized: true,
        ...(env.DB_SSL_CA_FILE ? { ca: fs.readFileSync(path.resolve(__dirname, env.DB_SSL_CA_FILE), 'utf8') } : {})
    };
    return {
        host: env.DB_HOST, database: env.DB_NAME || 'postgres',
        port: positiveInteger(env.DB_PORT, 5432), user: env.DB_USER, password: env.DB_PASSWORD,
        ssl, max: positiveInteger(env.DB_POOL_MAX, 5), idleTimeoutMillis: 30000,
        connectionTimeoutMillis: positiveInteger(env.DB_CONNECT_TIMEOUT_MS, 15000),
        query_timeout: positiveInteger(env.DB_REQUEST_TIMEOUT_MS, 15000),
        // Keep dates and aggregate counts compatible with the browser JSON contract.
        types: { getTypeParser(oid, format) {
            if (format !== 'binary' && oid === 1082) return value => value;
            if (format !== 'binary' && oid === 20) return value => {
                const number = Number(value);
                if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds supported range.');
                return number;
            };
            return types.getTypeParser(oid, format);
        } }
    };
}

// Named values are bound as native PostgreSQL $n parameters, never interpolated.
// Skip SQL literals, quoted identifiers, comments and dollar-quoted bodies.
function bindParameters(statement, inputs = {}) {
    let text = '', index = 0;
    const names = new Map(), values = [];
    while (index < statement.length) {
        const rest = statement.slice(index);
        let length = 0;
        if (rest.startsWith('--')) length = (rest.indexOf('\n') + 1) || rest.length;
        else if (rest.startsWith('/*')) {
            let depth = 1, cursor = 2;
            while (depth && cursor < rest.length) {
                if (rest.startsWith('/*', cursor)) { depth++; cursor += 2; }
                else if (rest.startsWith('*/', cursor)) { depth--; cursor += 2; }
                else cursor++;
            }
            if (depth) throw new Error('Unterminated SQL comment.');
            length = cursor;
        } else if (rest[0] === "'" || rest[0] === '"') {
            const quote = rest[0]; let cursor = 1, closed = false;
            while (cursor < rest.length) {
                if (rest[cursor++] === quote) {
                    if (rest[cursor] === quote) cursor++;
                    else { closed = true; break; }
                }
            }
            if (!closed) throw new Error('Unterminated SQL literal.');
            length = cursor;
        } else {
            const dollar = /^\$(?:[A-Za-z_]\w*)?\$/.exec(rest);
            if (dollar) {
                const end = rest.indexOf(dollar[0], dollar[0].length);
                if (end < 0) throw new Error('Unterminated SQL body.');
                length = end + dollar[0].length;
            }
        }
        if (length) { text += rest.slice(0, length); index += length; continue; }
        const parameter = /^@([A-Za-z_]\w*)/.exec(rest);
        if (parameter) {
            const name = parameter[1];
            if (!Object.hasOwn(inputs, name)) throw new Error('Missing database parameter.');
            if (!names.has(name)) { values.push(inputs[name] ?? null); names.set(name, values.length); }
            text += '$' + names.get(name); index += parameter[0].length;
        } else { text += statement[index++]; }
    }
    return { text, values };
}

const unavailable = () => Object.assign(new Error('Database service unavailable.'), { status: 503 });
function createDatabase(makePool, { backoffMs = 250, now = Date.now,
    wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    let pool, retryAt = 0;
    async function query(statement, inputs) {
        const bound = bindParameters(statement, inputs);
        await wait(Math.max(0, retryAt - now()));
        let client;
        try {
            if (!pool) {
                pool = makePool();
                // pg removes failed idle clients itself; never log driver details.
                pool.on('error', () => { retryAt = now() + backoffMs; });
            }
            client = await pool.connect();
        } catch { retryAt = now() + backoffMs; throw unavailable(); }
        let discard = false;
        try {
            const result = await client.query(bound);
            return { recordset: result.rows, rowsAffected: [result.rowCount ?? 0] };
        } catch (error) {
            discard = /^(08|53|57P)/.test(error.code || '') || !error.code;
            if (discard) { retryAt = now() + backoffMs; throw unavailable(); }
            // Preserve only safe classification for unique-constraint handling.
            throw Object.assign(new Error('Database operation failed.'), { code: error.code });
        } finally { client.release(discard); }
    }
    return {
        request() {
            const inputs = Object.create(null);
            return { input(name, value) { inputs[name] = value; return this; },
                query(statement) { return query(statement, inputs); } };
        },
        async close() { if (pool) { const current = pool; pool = undefined; await current.end(); } }
    };
}

const database = createDatabase(() => {
    // Prevent pg's implicit localhost/OS-user defaults when settings are absent.
    if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD) throw unavailable();
    return new Pool(configuration());
});
// Existing handlers share one lazy pool; importing the app never connects.
module.exports = { poolPromise: Promise.resolve(database), configuration, createDatabase, bindParameters };

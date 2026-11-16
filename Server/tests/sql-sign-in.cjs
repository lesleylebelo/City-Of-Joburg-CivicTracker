// Opt-in, read-only account verification against the real SQL Server configuration.
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const required = ['JWT_SECRET', 'TEST_RESIDENT_IDENTIFIER', 'TEST_RESIDENT_PASSWORD', 'TEST_ADMIN_IDENTIFIER', 'TEST_ADMIN_PASSWORD'];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
    console.error('SQL verification pending. Configure locally: ' + missing.join(', '));
    process.exitCode = 1;
} else {
    (async () => {
        const { poolPromise } = require('../db_sqlserver');
        const pool = await poolPromise;
        const server = require('../app').listen(0, '127.0.0.1');
        try {
            await once(server, 'listening');
            const base = 'http://127.0.0.1:' + server.address().port;
            for (const role of ['resident', 'admin']) {
                const prefix = role === 'resident' ? 'TEST_RESIDENT_' : 'TEST_ADMIN_';
                const response = await fetch(base + '/api/auth/login', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifier: process.env[prefix + 'IDENTIFIER'], password: process.env[prefix + 'PASSWORD'] })
                });
                assert.equal(response.status, 200, 'Existing test account must sign in');
                const login = await response.json();
                assert.equal(login.user.role, role);
                const session = await fetch(base + '/api/auth/session', { headers: { Authorization: 'Bearer ' + login.token } });
                assert.equal(session.status, 200);
                assert.equal((await session.json()).user.role, role);
                console.log(role + ': real Express + SQL sign-in/session verification passed');
            }
        } finally {
            await new Promise(resolve => server.close(resolve));
            await pool.close();
        }
    })().catch(() => { console.error('SQL sign-in verification failed. Check local configuration and test accounts.'); process.exitCode = 1; });
}

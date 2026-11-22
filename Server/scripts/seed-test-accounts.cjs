// Explicit opt-in only: creates two accounts in an empty, isolated test database.
const path = require('node:path');
const { once } = require('node:events');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

async function seed() {
    const required = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'TEST_RESIDENT_IDENTIFIER',
        'TEST_RESIDENT_PASSWORD', 'TEST_ADMIN_IDENTIFIER', 'TEST_ADMIN_PASSWORD'];
    if (process.env.TEST_DATABASE_SEED_CONFIRM !== 'empty-test-database' || required.some(name => !process.env[name])) {
        throw new Error('Configure the explicit test-only seed confirmation and required settings locally.');
    }
    // Seed identifiers are emails; ordinary sign-in still supports employee IDs too.
    for (const prefix of ['TEST_RESIDENT_', 'TEST_ADMIN_']) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env[prefix + 'IDENTIFIER']) ||
            process.env[prefix + 'PASSWORD'].length < 8) throw new Error('Invalid private test-account settings.');
    }
    const database = await require('../database').poolPromise;
    let server;
    try {
        const existing = await database.request().query(`SELECT
            (SELECT COUNT(*) FROM civictrack.residents) +
            (SELECT COUNT(*) FROM civictrack.administrators) AS total`);
        if (Number(existing.recordset[0].total) !== 0) throw new Error('Test seeding requires empty account tables.');
        const approval = await database.request().input('employee_number', 'CT-TEST-ADMIN')
            .query('SELECT is_registered FROM civictrack.authorised_employees WHERE employee_number=@employee_number');
        if (approval.recordset.length !== 1 || approval.recordset[0].is_registered) {
            throw new Error('The operator must approve the unused test employee ID first.');
        }
        server = require('../app').listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = 'http://127.0.0.1:' + server.address().port;
        const accounts = [
            ['/api/auth/resident/register', { full_names: 'Test Resident', phone_number: '0000000000',
                email: process.env.TEST_RESIDENT_IDENTIFIER, password: process.env.TEST_RESIDENT_PASSWORD }],
            ['/api/auth/admin/register', { full_names: 'Test Administrator', employee_number: 'CT-TEST-ADMIN',
                email: process.env.TEST_ADMIN_IDENTIFIER, password: process.env.TEST_ADMIN_PASSWORD }]
        ];
        for (const [route, body] of accounts) {
            const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
            if (response.status !== 201) throw new Error('Test-account registration failed; inspect account state before retrying.');
        }
        console.log('Two test accounts created through normal registration. No credentials are printed.');
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await database.close();
    }
}
seed().catch(() => {
    console.error('Test seeding stopped. Check the test-only confirmation, empty account tables, approved employee and private settings. Partial completion is possible; no accounts are deleted automatically.');
    process.exitCode = 1;
});

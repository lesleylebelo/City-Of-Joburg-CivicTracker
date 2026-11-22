const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const setup = require('../scripts/configure-test-login.cjs');

test('operator setup rejects an unapproved project, owner app account, weak password or unverified TLS', () => {
    const approved = { DB_HOST: setup.target.host, DB_PORT: '5432', DB_NAME: 'postgres',
        DB_USER: 'civictrack_app.' + setup.target.project, DB_SSL_MODE: 'require',
        DB_PASSWORD: 'Synthetic-fixture-only-123!' };
    assert.doesNotThrow(() => setup.validateEnvironment(approved));
    for (const patch of [{ DB_HOST: 'another.pooler.supabase.com' }, { DB_PORT: '6543' },
        { DB_NAME: 'another_database' }, { DB_USER: 'postgres.' + setup.target.project },
        { DB_USER: 'civictrack_app.another_project' }, { DB_SSL_MODE: 'disable' }, { DB_PASSWORD: '' }]) {
        assert.throws(() => setup.validateEnvironment({ ...approved, ...patch }));
    }
    assert.throws(() => setup.assertTls({ connection: { stream: { encrypted: true, authorized: false } } }));
    assert.throws(() => setup.assertTls({ connection: { stream: { encrypted: false, authorized: true } } }));
    assert.doesNotThrow(() => setup.assertTls({ connection: { stream: { encrypted: true, authorized: true } } }));
});

test('password verifier agrees with the public RFC 7677 SCRAM-SHA-256 client/server proof vectors', async () => {
    // Public protocol example, not a project credential: https://www.rfc-editor.org/rfc/rfc7677#section-3
    const verifier = await setup.scramVerifier('pencil', Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64'));
    const keys = verifier.split('$')[2].split(':');
    const storedKey = Buffer.from(keys[0], 'base64');
    const serverKey = Buffer.from(keys[1], 'base64');
    const first = 'n=user,r=rOprNGfwEbeRWgbNEkqO';
    const server = 'r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096';
    const final = 'c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0';
    const message = first + ',' + server + ',' + final;
    assert.equal(crypto.createHmac('sha256', serverKey).update(message).digest('base64'),
        '6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=');
    const proof = Buffer.from('dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=', 'base64');
    const signature = crypto.createHmac('sha256', storedKey).update(message).digest();
    const clientKey = Buffer.from(proof.map((byte, index) => byte ^ signature[index]));
    assert.ok(crypto.timingSafeEqual(crypto.createHash('sha256').update(clientKey).digest(), storedKey));
    await assert.rejects(setup.scramVerifier('non-ascii-\u00e9'));
});

test('real disposable PostgreSQL setup changes only LOGIN/password and rolls back unexpected permissions', async () => {
    const engine = await PGlite.create();
    const owner = { query: (sql, values) => engine.query(sql, values) };
    try {
        await engine.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;');
        for (const name of ['001_schema.sql', '002_server_permissions.sql']) {
            await engine.exec(await fs.readFile(path.join(__dirname, '../Database/Postgres', name), 'utf8'));
        }
        const before = (await owner.query(setup.snapshotSql)).rows[0];
        const statements = [];
        const recordingOwner = { query(sql, values) {
            statements.push(sql);
            return owner.query(sql, values);
        } };
        const fixturePassword = 'Synthetic-fixture-only-123!';
        await setup.enableLogin(recordingOwner, fixturePassword);
        assert.deepEqual((await owner.query(setup.snapshotSql)).rows[0], before);
        assert.equal((await owner.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='civictrack_app'")).rows[0].rolcanlogin, true);
        assert.equal(statements.filter(sql => sql.startsWith('ALTER ROLE')).length, 1);
        assert.ok(statements.every(sql => !sql.includes(fixturePassword)));

        await owner.query('ALTER ROLE civictrack_app NOLOGIN');
        const changingOwner = { async query(sql, values) {
            const result = await owner.query(sql, values);
            if (sql.startsWith('ALTER ROLE civictrack_app WITH LOGIN')) {
                await owner.query('GRANT CREATE ON SCHEMA civictrack TO civictrack_app');
            }
            return result;
        } };
        await assert.rejects(setup.enableLogin(changingOwner, fixturePassword), /Unexpected application permissions/);
        assert.equal((await owner.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='civictrack_app'")).rows[0].rolcanlogin, false);
        assert.deepEqual((await owner.query(setup.snapshotSql)).rows[0], before);

        // A pre-existing permission drift is rejected before ALTER ROLE, not silently repaired.
        await owner.query('REVOKE SELECT ON civictrack.residents FROM civictrack_app');
        let altered = false;
        const driftedOwner = { query(sql, values) {
            if (sql.startsWith('ALTER ROLE')) altered = true;
            return owner.query(sql, values);
        } };
        await assert.rejects(setup.enableLogin(driftedOwner, fixturePassword), /Unexpected application permissions/);
        assert.equal(altered, false);
    } finally { await engine.close(); }
});

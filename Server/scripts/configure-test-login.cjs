// One-off operator tool for the approved, empty CivicTrack test project only.
// Owner credentials arrive through redirected stdin, never argv/environment/files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual, promisify } = require('node:util');
const { spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { Client } = require('pg');
const dotenv = require('dotenv');
const derive = promisify(crypto.pbkdf2);
const target = Object.freeze({
    host: 'aws-1-eu-west-1.pooler.supabase.com', port: '5432', database: 'postgres',
    project: 'ogzurumjuxwrvpsewwra', role: 'civictrack_app'
});

function validateEnvironment(env) {
    if (env.DB_HOST !== target.host || env.DB_PORT !== target.port || env.DB_NAME !== target.database ||
        env.DB_USER !== target.role + '.' + target.project || env.DB_SSL_MODE !== 'require' ||
        !/^[\x21-\x7e]{20,}$/.test(env.DB_PASSWORD || '') ||
        process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
        throw new Error('Private configuration does not match the approved test target.');
    }
}

// PostgreSQL's SCRAM verifier format. Like psql's \password, this keeps the
// plaintext application password out of SQL text, history and statement logs.
// ASCII-only input deliberately avoids implementing Unicode SASLprep here.
async function scramVerifier(password, salt = crypto.randomBytes(16), iterations = 4096) {
    if (!/^[\x21-\x7e]+$/.test(password || '') || !Buffer.isBuffer(salt) || salt.length < 16 ||
        !Number.isInteger(iterations) || iterations < 4096 || iterations > 1000000) {
        throw new Error('Unsupported password-verifier input.');
    }
    const salted = await derive(password, salt, iterations, 32, 'sha256');
    const clientKey = crypto.createHmac('sha256', salted).update('Client Key').digest();
    const storedKey = crypto.createHash('sha256').update(clientKey).digest('base64');
    const serverKey = crypto.createHmac('sha256', salted).update('Server Key').digest('base64');
    salted.fill(0);
    clientKey.fill(0);
    return 'SCRAM-SHA-256$' + iterations + ':' + salt.toString('base64') + '$' + storedKey + ':' + serverKey;
}

const snapshotSql = `SELECT
 (SELECT to_jsonb(r) - 'rolcanlogin' FROM
   (SELECT oid, rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
           rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil, rolconfig, rolcanlogin
    FROM pg_roles WHERE rolname='civictrack_app') r) AS role,
 (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor)
    FROM pg_auth_members m WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname='civictrack_app')
       OR m.roleid=(SELECT oid FROM pg_roles WHERE rolname='civictrack_app')) AS memberships,
 (SELECT jsonb_build_object('owner',nspowner,'acl',nspacl)
    FROM pg_namespace WHERE nspname='civictrack') AS schema,
 (SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'kind',c.relkind,
         'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity)
         ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='civictrack' AND c.relkind IN ('r','p','S')) AS objects,
 (SELECT jsonb_agg(jsonb_build_object('table',a.attrelid,'column',a.attnum,'acl',a.attacl)
         ORDER BY a.attrelid,a.attnum) FROM pg_attribute a
    JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='civictrack' AND a.attnum>0 AND NOT a.attisdropped) AS columns,
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname)
    FROM pg_policies p WHERE p.schemaname='civictrack') AS policies`;

async function snapshot(client) { return (await client.query(snapshotSql)).rows[0]; }
function assertRestricted(state) {
    const role = state.role;
    const tables = (state.objects || []).filter(item => ['r', 'p'].includes(item.kind));
    const policies = state.policies || [];
    if (!role || role.rolname !== target.role || role.rolsuper || role.rolinherit || role.rolcreaterole ||
        role.rolcreatedb || role.rolreplication || role.rolbypassrls || !state.schema ||
        tables.length !== 12 || tables.some(table => !table.rls) ||
        (state.memberships || []).some(member => member.member === role.oid) ||
        policies.filter(policy => policy.policyname === 'server_access' &&
            policy.roles.includes(target.role) && policy.cmd === 'ALL' &&
            policy.qual === 'true' && policy.with_check === 'true').length !== 12) {
        throw new Error('Unexpected role, RLS or policy configuration; no changes permitted.');
    }
}

const permissionsSql = `SELECT
 has_schema_privilege('civictrack_app','civictrack','USAGE') AS schema_usage,
 has_schema_privilege('civictrack_app','civictrack','CREATE') AS schema_create,
 has_table_privilege('civictrack_app','civictrack.authorised_employees','SELECT') AS approval_read,
 has_table_privilege('civictrack_app','civictrack.authorised_employees','INSERT') AS approval_insert,
 has_table_privilege('civictrack_app','civictrack.authorised_employees','DELETE') AS approval_delete,
 has_column_privilege('civictrack_app','civictrack.authorised_employees','is_registered','UPDATE') AS approval_consume,
 EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='civictrack.authorised_employees'::regclass
   AND attnum>0 AND NOT attisdropped AND attname<>'is_registered'
   AND has_column_privilege('civictrack_app',attrelid,attname,'UPDATE')) AS approval_other_update,
 (SELECT bool_and(has_table_privilege('civictrack_app',c.oid,'SELECT') AND
   has_table_privilege('civictrack_app',c.oid,'INSERT') AND has_table_privilege('civictrack_app',c.oid,'UPDATE') AND
   has_table_privilege('civictrack_app',c.oid,'DELETE')) FROM pg_class c
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='civictrack'
   AND c.relkind='r' AND c.relname<>'authorised_employees') AS application_crud,
 (SELECT bool_and(has_sequence_privilege('civictrack_app',c.oid,'USAGE') AND
   has_sequence_privilege('civictrack_app',c.oid,'SELECT')) FROM pg_class c
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='civictrack' AND c.relkind='S') AS sequences,
 EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated') AND
   (has_schema_privilege(r.oid,'civictrack','USAGE') OR EXISTS(SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='civictrack' AND c.relkind='r'
    AND (has_table_privilege(r.oid,c.oid,'SELECT') OR has_table_privilege(r.oid,c.oid,'INSERT') OR
         has_table_privilege(r.oid,c.oid,'UPDATE') OR has_table_privilege(r.oid,c.oid,'DELETE'))))) AS browser_access`;

async function verifyPermissions(client) {
    const actual = (await client.query(permissionsSql)).rows[0];
    const expected = { schema_usage: true, schema_create: false, approval_read: true,
        approval_insert: false, approval_delete: false, approval_consume: true,
        approval_other_update: false, application_crud: true, sequences: true, browser_access: false };
    if (!isDeepStrictEqual(actual, expected)) throw new Error('Unexpected application permissions.');
}
function assertTls(client) {
    if (!client.connection?.stream?.encrypted || client.connection.stream.authorized !== true) {
        throw new Error('Verified TLS is required.');
    }
}
async function enableLogin(owner, password) {
    const identity = (await owner.query('SELECT current_database() AS db, current_user AS role')).rows[0];
    if (identity.db !== target.database || identity.role !== 'postgres') throw new Error('Unexpected database owner identity.');
    const before = await snapshot(owner);
    assertRestricted(before);
    await verifyPermissions(owner);
    const verifier = await scramVerifier(password);
    await owner.query('BEGIN');
    try {
        // Verifier alphabet cannot contain SQL quotes. No plaintext password enters SQL.
        if (!/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(verifier)) {
            throw new Error('Invalid verifier.');
        }
        await owner.query("ALTER ROLE civictrack_app WITH LOGIN PASSWORD '" + verifier + "'");
        const after = await snapshot(owner);
        assertRestricted(after);
        await verifyPermissions(owner);
        if (!isDeepStrictEqual(before, after)) throw new Error('Role permissions changed unexpectedly.');
        const login = (await owner.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='civictrack_app'")).rows[0];
        if (!login?.rolcanlogin) throw new Error('LOGIN was not enabled.');
        await owner.query('COMMIT');
    } catch (error) {
        await owner.query('ROLLBACK').catch(() => {});
        throw error;
    }
}

async function verifyApplication(env, makeClient = config => new Client(config)) {
    const { configuration, poolPromise } = require('../database');
    const application = makeClient(configuration(env));
    try {
        await application.connect();
        assertTls(application);
        const identity = (await application.query('SELECT current_user AS role')).rows[0];
        if (identity.role !== target.role) throw new Error('Unexpected application identity.');
        await verifyPermissions(application);
        await application.query('SELECT count(*) FROM civictrack.residents');
    } finally { await application.end().catch(() => {}); }
    let server;
    try {
        server = require('../app').listen(0, '127.0.0.1');
        await once(server, 'listening');
        const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/health/ready',
            { signal: AbortSignal.timeout(20000) });
        if (response.status !== 200 || (await response.json()).status !== 'ready') throw new Error('Express not ready.');
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await (await poolPromise).close();
    }
}

async function main() {
    let phase = 'private configuration validation';
    try {
        const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env')));
        validateEnvironment(env);
        // The reviewed file, not inherited DB_* variables, supplies both processes.
        Object.assign(process.env, env);
        if (process.argv.includes('--check-config')) {
            console.log('Approved CivicTrack test target and verified-TLS configuration confirmed. No secrets displayed.');
            return;
        }
        phase = 'masked owner credential input';
        let input = '';
        for await (const chunk of process.stdin) {
            input += chunk;
            if (input.length > 16384) throw new Error('Input too large.');
        }
        const credentials = JSON.parse(input);
        input = '';
        if (typeof credentials.ownerPassword !== 'string' || !credentials.ownerPassword) throw new Error('Missing credential.');
        const { configuration } = require('../database');
        const owner = new Client({ ...configuration(env), user: 'postgres.' + target.project,
            password: credentials.ownerPassword, application_name: 'civictrack-private-login-setup' });
        credentials.ownerPassword = null;
        phase = 'owner TLS connection and role verification';
        try {
            await owner.connect();
            assertTls(owner);
            console.log('Owner TLS verified; checking project database, role grants and RLS.');
            phase = 'transactional LOGIN/password update';
            await enableLogin(owner, env.DB_PASSWORD);
            console.log('LOGIN and the existing application password configured; grants and policies unchanged.');
        } finally { await owner.end().catch(() => {}); }
        phase = 'dedicated application TLS and Express readiness';
        await verifyApplication(env);
        console.log('Dedicated application identity, verified TLS and real Express database readiness passed.');
        if (process.argv.includes('--seed-test-accounts')) {
            for (const [file, confirmation] of [['scripts/seed-test-accounts.cjs', true], ['tests/sql-sign-in.cjs', false]]) {
                phase = confirmation ? 'one-time test-account seed' : 'resident/admin Express sign-in verification';
                const child = spawnSync(process.execPath, [path.join(__dirname, '..', file)], {
                    env: { ...process.env, TEST_DATABASE_SEED_CONFIRM: confirmation ? 'empty-test-database' : '' },
                    encoding: 'utf8', windowsHide: true, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe']
                });
                // Do not forward exception objects or raw child output. These scripts
                // perform the normal registration/sign-in paths with secret values in memory.
                if (child.status !== 0) throw new Error('Child verification failed.');
                console.log(confirmation ? 'Two test accounts created through normal Express registration.' :
                    'Resident and administrator real Express/PostgreSQL sign-in and session checks passed.');
            }
        }
    } catch (error) {
        console.error('Stopped during ' + phase + '. No credentials or SQL details are printed.');
        if (['SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
            'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(error.code)) {
            console.error('Certificate validation failed. Configure the provider CA privately; do not disable TLS verification.');
        }
        console.error('If an update or seed was attempted, inspect its state before retrying; no automatic retry or reset was performed.');
        process.exitCode = 1;
    }
}
if (require.main === module) main();
module.exports = { target, validateEnvironment, scramVerifier, snapshotSql, assertRestricted,
    permissionsSql, verifyPermissions, enableLogin, assertTls };

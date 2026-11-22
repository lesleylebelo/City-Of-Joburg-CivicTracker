// Explicit hosted test only. Creates and removes uniquely marked disposable data.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { once } = require('node:events');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { validateEnvironment } = require('../scripts/configure-test-login.cjs');

async function verify() {
    if (!process.argv.includes('--disposable-test-data')) throw new Error('Explicit test-data opt-in required.');
    const env = dotenv.parse(await fs.readFile(path.join(__dirname, '../.env')));
    validateEnvironment(env);
    const hostedImages = process.argv.includes('--supabase-images');
    if (hostedImages && (env.IMAGE_STORAGE_PROVIDER !== 'supabase' ||
        env.SUPABASE_URL !== 'https://ogzurumjuxwrvpsewwra.supabase.co' ||
        env.SUPABASE_IMAGE_BUCKET !== 'civictrack-issue-images')) {
        throw new Error('Approved private hosted image configuration required.');
    }
    Object.assign(process.env, env);
    const database = await require('../database').poolPromise;
    const marker = 'Hosted authorization fixture ' + crypto.randomBytes(16).toString('hex');
    const temporaryEmail = crypto.randomBytes(16).toString('hex') + '@civictrack.example';
    const temporaryPassword = 'Aa7!' + crypto.randomBytes(32).toString('base64url');
    const imageDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'civictrack-hosted-auth-'));
    const images = require('../image_storage');
    if (!hostedImages) Object.assign(images, images.createLocalImageStorage(imageDirectory));
    const createdImages = new Set();
    const saveImage = images.saveImage.bind(images);
    images.saveImage = async file => {
        const id = await saveImage(file);
        createdImages.add(id);
        return id;
    };
    let server, setupChecked = false;
    const query = (sql, values = {}) => {
        const request = database.request();
        for (const [name, value] of Object.entries(values)) request.input(name, value);
        return request.query(sql);
    };
    try {
        const initial = (await query(`SELECT (SELECT count(*) FROM civictrack.residents) AS residents,
            (SELECT count(*) FROM civictrack.administrators) AS administrators,
            (SELECT count(*) FROM civictrack.reported_issues) AS reports`)).recordset[0];
        assert.deepEqual(initial, { residents: 1, administrators: 1, reports: 0 });
        setupChecked = true;
        server = require('../app').listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = 'http://127.0.0.1:' + server.address().port;
        async function request(route, { token, method = 'GET', body, headers = {} } = {}) {
            if (token) headers.Authorization = 'Bearer ' + token;
            if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
            return fetch(base + route, { method, headers, body, signal: AbortSignal.timeout(25000) });
        }
        async function login(identifier, password) {
            const response = await request('/api/auth/login', { method: 'POST', body: { identifier, password } });
            assert.equal(response.status, 200);
            return response.json();
        }
        const resident = await login(env.TEST_RESIDENT_IDENTIFIER, env.TEST_RESIDENT_PASSWORD);
        const admin = await login(env.TEST_ADMIN_IDENTIFIER, env.TEST_ADMIN_PASSWORD);
        assert.equal(resident.user.role, 'resident');
        assert.equal(admin.user.role, 'admin');
        assert.equal((await request('/api/health/ready')).status, 200);
        assert.equal((await request('/api/issues')).status, 401);
        assert.equal((await request('/api/auth/login', { method: 'POST', body: {
            identifier: env.TEST_RESIDENT_IDENTIFIER, password: temporaryPassword
        } })).status, 401);
        const expired = jwt.sign({ id: resident.user.id, role: 'resident' }, env.JWT_SECRET,
            { algorithm: 'HS256', expiresIn: -10 });
        assert.equal((await request('/api/issues', { token: expired })).status, 401);
        assert.equal((await request('/api/auth/resident/register', { method: 'POST', body: {
            full_names: marker, email: temporaryEmail, password: temporaryPassword, phone_number: '0000000000'
        } })).status, 201);
        const other = await login(temporaryEmail, temporaryPassword);
        await query('UPDATE civictrack.residents SET is_active=FALSE WHERE resident_id=@id AND email=@email',
            { id: other.user.id, email: temporaryEmail });
        assert.equal((await request('/api/auth/login', { method: 'POST', body: {
            identifier: temporaryEmail, password: temporaryPassword
        } })).status, 401);
        assert.equal((await request('/api/auth/session', { token: other.token })).status, 401);
        await query('UPDATE civictrack.residents SET is_active=TRUE WHERE resident_id=@id AND email=@email',
            { id: other.user.id, email: temporaryEmail });
        const reportBody = { title: marker, category: 'Other', priority: 'Medium',
            location_address: 'Johannesburg test fixture', description: 'Disposable verification data only.',
            latitude: '-26.2', longitude: '28.04' };
        const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=', 'base64');
        const form = new FormData();
        for (const [name, value] of Object.entries(reportBody)) form.set(name, value);
        form.set('issueImage', new Blob([bytes], { type: 'image/png' }), 'fixture.png');
        assert.equal((await request('/api/issues', { token: resident.token, method: 'POST', body: form })).status, 201);
        assert.equal((await request('/api/issues', { token: other.token, method: 'POST', body: reportBody })).status, 201);
        const issue = (await query('SELECT issue_id,image_url FROM civictrack.reported_issues WHERE title=@title AND resident_id=@id',
            { title: marker, id: resident.user.id })).recordset[0];
        const issuePath = '/api/issues/' + issue.issue_id;
        assert.equal((await request(issuePath, { token: resident.token })).status, 200);
        assert.equal((await request(issuePath, { token: admin.token })).status, 200);
        for (const method of ['GET', 'PUT', 'DELETE']) {
            assert.equal((await request(issuePath, { token: other.token, method,
                ...(method === 'PUT' ? { body: reportBody } : {}) })).status, 403);
        }
        const ownList = await (await request('/api/issues', { token: resident.token })).json();
        assert.ok(ownList.length === 1 && ownList.every(item => item.resident_id === resident.user.id));
        assert.equal((await request('/api/issues/stats', { token: resident.token })).status, 403);
        assert.equal((await request('/api/issues/stats', { token: admin.token })).status, 200);
        assert.equal((await request(issuePath, { token: resident.token, method: 'PUT', body: reportBody })).status, 200);
        assert.equal((await request(issuePath + '/status', { token: resident.token, method: 'PATCH', body: { status: 'Resolved' } })).status, 403);
        assert.equal((await request(issuePath + '/status', { token: admin.token, method: 'PATCH', body: { status: 'Resolved' } })).status, 200);
        assert.equal((await (await request(issuePath, { token: resident.token })).json()).status, 'Resolved');
        assert.equal((await request(issuePath, { token: resident.token, method: 'PUT', body: reportBody })).status, 400);
        assert.equal((await request(issuePath, { token: resident.token, method: 'DELETE' })).status, 400);
        for (const token of [resident.token, admin.token]) {
            const photo = await request(issue.image_url, { token });
            assert.equal(photo.status, 200);
            assert.ok(Buffer.from(await photo.arrayBuffer()).equals(bytes));
        }
        assert.equal((await request(issue.image_url, { token: other.token })).status, 404);
        assert.equal((await request(issue.image_url)).status, 401);
        if (hostedImages) {
            const id = path.basename(issue.image_url);
            const restarted = require('../supabase_image_storage').createSupabaseImageStorage(env);
            const chunks = [];
            for await (const chunk of await restarted.getImageStream(id)) chunks.push(chunk);
            assert.ok(Buffer.concat(chunks).equals(bytes));
            const publicPhoto = await fetch(env.SUPABASE_URL + '/storage/v1/object/public/' +
                env.SUPABASE_IMAGE_BUCKET + '/' + encodeURIComponent(id),
                { redirect: 'error', signal: AbortSignal.timeout(25000) });
            assert.ok([400, 401, 403, 404].includes(publicPhoto.status));
            await publicPhoto.body?.cancel();
            console.log('Hosted private Storage upload, byte-exact download, fresh-adapter persistence and public-access denial passed.');
        }
        assert.equal((await request('/api/notices', { token: resident.token })).status, 200);
        assert.equal((await request('/api/notices', { token: admin.token })).status, 200);
        assert.equal((await request('/api/issues', { method: 'OPTIONS', headers: {
            Origin: 'https://unapproved.example', 'Access-Control-Request-Method': 'GET'
        } })).status, 403);
        assert.equal((await request(issuePath, { token: admin.token, method: 'DELETE' })).status, 200);
        if (hostedImages) await assert.rejects(images.getImageStream(path.basename(issue.image_url)), { code: 'ENOENT' });
        const ownOther = (await query('SELECT issue_id FROM civictrack.reported_issues WHERE title=@title AND resident_id=@id',
            { title: marker, id: other.user.id })).recordset[0];
        assert.equal((await request('/api/issues/' + ownOther.issue_id, { token: other.token, method: 'DELETE' })).status, 200);
        console.log('Hosted authorization passed: real sign-ins, inactive/expired denial, resident ownership, administrator status actions, private image access, civic reads and CORS.');
    } finally {
      try {
        if (setupChecked) {
            // Only object IDs returned by this run's uploads are eligible for removal.
            for (const id of createdImages) await images.deleteImage(id);
            // Only this run's unpredictable marker/temporary email are eligible for cleanup.
            await query('DELETE FROM civictrack.reported_issues WHERE title=@marker', { marker });
            await query('DELETE FROM civictrack.residents WHERE email=@email AND full_names=@marker',
                { email: temporaryEmail, marker });
            const remaining = (await query(`SELECT (SELECT count(*) FROM civictrack.residents) AS residents,
                (SELECT count(*) FROM civictrack.administrators) AS administrators,
                (SELECT count(*) FROM civictrack.reported_issues) AS reports`)).recordset[0];
            assert.deepEqual(remaining, { residents: 1, administrators: 1, reports: 0 });
            console.log('Disposable records removed; original test accounts retained (1 resident, 1 administrator, 0 reports).');
        }
      } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await database.close();
        for (const entry of await fs.readdir(imageDirectory)) await fs.unlink(path.join(imageDirectory, entry));
        await fs.rmdir(imageDirectory);
      }
    }
}
verify().catch(() => {
    console.error('Hosted authorization verification stopped. Inspect fixture state before retrying; no secrets are printed.');
    process.exitCode = 1;
});

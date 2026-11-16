const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../docs/Assets/JS/session.js'), 'utf8');

function browser({ token = 'test-token', responseRole = 'resident', status = 200, expires = Date.now() / 1000 + 3600, prefix = '/City-Of-Joburg-CivicTracker/', boot = false } = {}) {
    const storage = new Map([['civictrack_user', JSON.stringify({ role: 'admin', full_names: 'Untrusted browser value' })]]);
    if (token) storage.set('civictrack_token', token);
    const result = { redirects: [], scripts: [], fetches: [], timers: [], storage };
    const location = { href: 'https://example.test' + prefix + 'Pages/Resident/Dashboard/Dashboard.html', origin: 'https://example.test', replace(url) { result.redirects.push(url); }, reload() {} };
    const document = {
        currentScript: { src: 'https://example.test' + prefix + 'Assets/JS/session.js', dataset: boot ? { role: 'resident', dashboard: './Dashboard.js' } : {} },
        documentElement: { classList: { remove() {} } },
        createElement() { return { addEventListener() {} }; },
        body: { append(element) { result.scripts.push(element); }, replaceChildren(...elements) { result.unavailable = elements; } }
    };
    const window = { location, addEventListener() {} };
    const context = {
        window, document, location, URL, Headers, console,
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        setTimeout: (callback, delay) => { result.timers.push({ callback, delay }); return 1; }, clearTimeout() {},
        fetch: async (url, options) => { result.fetches.push({ url: url.href, options }); return { status, ok: status === 200, json: async () => ({ user: { id: 1, role: responseRole, full_names: 'Verified Account' }, expires_at: expires }) }; }
    };
    vm.runInNewContext(source, context);
    result.session = window.CivicSession;
    return result;
}

test('signed-out dashboards redirect to the shared sign-in page for root and project-path hosting', async () => {
    for (const prefix of ['/', '/City-Of-Joburg-CivicTracker/']) {
        const page = browser({ token: null, prefix });
        assert.equal(await page.session.requireRole('resident'), null);
        assert.equal(page.redirects[0], 'https://example.test' + prefix + 'Pages/Public/Sign-In/Sign-In.html');
        assert.equal(page.fetches.length, 0);
    }
});

test('invalid and expired sessions clear stored state and redirect', async () => {
    for (const options of [{ status: 401 }, { expires: Date.now() / 1000 - 1 }]) {
        const page = browser(options);
        assert.equal(await page.session.requireRole('resident'), null);
        assert.equal(page.storage.has('civictrack_token'), false);
        assert.equal(page.storage.has('civictrack_user'), false);
        assert.match(page.redirects[0], /Public\/Sign-In\/Sign-In.html$/);
    }
});

test('server-confirmed roles override localStorage and send users to their own dashboard', async () => {
    const resident = browser();
    assert.equal((await resident.session.requireRole('resident')).role, 'resident');
    assert.equal(JSON.parse(resident.storage.get('civictrack_user')).full_names, 'Verified Account');
    const admin = browser({ responseRole: 'admin' });
    assert.equal(await admin.session.requireRole('resident'), null);
    assert.match(admin.redirects[0], /Administrator\/Dashboard\/Dashboard.html$/);
    assert.equal(admin.scripts.length, 0);
    const other = browser();
    assert.equal(await other.session.requireRole('admin'), null);
    assert.match(other.redirects[0], /Resident\/Dashboard\/Dashboard.html$/);
});

test('expiry timer and explicit sign-out clear the browser session', async () => {
    for (const expire of [false, true]) {
        const page = browser();
        await page.session.requireRole('resident');
        assert.ok(page.timers[0].delay > 0);
        if (expire) page.timers[0].callback(); else page.session.signOut();
        assert.equal(page.storage.size, 0);
        assert.match(page.redirects[0], /Public\/Sign-In\/Sign-In.html$/);
    }
});

test('dashboard code loads only after the session is confirmed', async () => {
    const page = browser({ boot: true });
    assert.equal(page.scripts.length, 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.scripts.length, 1);
    assert.equal(page.scripts[0].src, 'https://example.test/City-Of-Joburg-CivicTracker/Pages/Resident/Dashboard/Dashboard.js');
    assert.equal(page.session.user.full_names, 'Verified Account');
});

test('service outages keep dashboard code blocked and offer a retry', async () => {
    const page = browser({ status: 503, boot: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.scripts.length, 0);
    assert.equal(page.storage.has('civictrack_token'), true);
    assert.equal(page.unavailable[1].textContent, 'Try again');
});

test('authorization failures do not destroy an otherwise valid session', async () => {
    const page = browser({ status: 403 });
    assert.equal((await page.session.fetch('/api/issues/2')).status, 403);
    assert.equal(page.storage.has('civictrack_token'), true);
});

test('tokens are never sent to another origin and report markup is escaped', async () => {
    const page = browser();
    await assert.rejects(page.session.fetch('https://other.test/api/issues'));
    assert.equal(page.fetches.length, 0);
    assert.equal(page.session.escapeHTML('<img onerror="bad()">'), '&lt;img onerror=&quot;bad()&quot;&gt;');
});

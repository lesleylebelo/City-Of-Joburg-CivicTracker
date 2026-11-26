const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../docs/Pages/Resident/Dashboard/Dashboard.js'), 'utf8');
function fixture(responses) {
    const elements = new Map();
    const node = id => {
        if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', dataset: {}, style: {},
            addEventListener() {}, setAttribute() {} });
        return elements.get(id);
    };
    const escapeHTML = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const calls = [];
    const context = vm.createContext({ console, FormData, Date, window: { addEventListener() {}, CivicConfig: { apiUrl: v => v } },
        document: { readyState: 'loading', getElementById: node, querySelectorAll: () => [], querySelector: () => node('nav'), addEventListener() {} },
        CivicSession: { user: {}, escapeHTML, loadReportImages: async () => {}, fetch: async url => { calls.push(url); return {
            ok: responses[url] !== null, json: async () => responses[url] ?? { message: '--' }
        }; } } });
    vm.runInContext(source, context);
    return { context, elements, calls };
}
test('resident overview uses authenticated data, escapes content and excludes past events', async () => {
    const f = fixture({ '/api/issues/my-history': [{status:'Pending'}, {status:'In Progress'}, {status:'Resolved'}],
        '/api/notices': [{title:'<img onerror=bad()>',content:'<script>bad()</script>',category:'General'}],
        '/api/events': [{title:'Past event',event_date:'2000-01-01'}, {title:'Future event',event_date:'2099-01-01',start_time:'09:00'}] });
    await vm.runInContext('loadOverview()', f.context);
    assert.equal(f.elements.get('stat-total').textContent, 3);
    assert.equal(f.elements.get('stat-pending').textContent, 1);
    assert.equal(f.elements.get('stat-progress').textContent, 1);
    assert.equal(f.elements.get('stat-resolved').textContent, 1);
    assert.match(f.elements.get('notices-list').innerHTML, /&lt;script&gt;/);
    assert.doesNotMatch(f.elements.get('notices-list').innerHTML, /<img|<script/);
    assert.match(f.elements.get('events-list').innerHTML, /Future event/);
    assert.doesNotMatch(f.elements.get('events-list').innerHTML, /Past event/);
    assert.ok(f.calls.every(url => ['/api/issues/my-history','/api/notices','/api/events'].includes(url)));
});
test('empty data and failed requests have distinct messages and failures offer retry', async () => {
    const empty = fixture({'/api/issues/my-history':[], '/api/notices':[], '/api/events':[]});
    await vm.runInContext('loadOverview()', empty.context);
    assert.equal(empty.elements.get('stat-total').textContent, 0);
    assert.match(empty.elements.get('notices-list').innerHTML, /caught up/);
    const failed = fixture({'/api/issues/my-history':null, '/api/notices':null, '/api/events':null});
    await vm.runInContext('loadOverview()', failed.context);
    assert.equal(failed.elements.get('stat-total').textContent, '--');
    assert.match(failed.elements.get('notices-list').innerHTML, /data-retry="overview"/);
    assert.match(failed.elements.get('overview-feedback').textContent, /temporarily unavailable/);
});

test('report search matches owned report numbers or titles without rendering unrelated results', async () => {
    const f = fixture({ '/api/issues/my-history': [
        {issue_id:21,title:'Water leak',status:'Pending'},
        {issue_id:22,title:'Streetlight repair',status:'Resolved'}], '/api/notices':[], '/api/events':[] });
    await vm.runInContext("reportSearch = '#22'; loadMyHistory()", f.context);
    assert.match(f.elements.get('history-list').innerHTML, /Streetlight repair/);
    assert.doesNotMatch(f.elements.get('history-list').innerHTML, /Water leak/);
    await vm.runInContext("reportSearch = 'water'; loadMyHistory()", f.context);
    assert.match(f.elements.get('history-list').innerHTML, /Water leak/);
    assert.doesNotMatch(f.elements.get('history-list').innerHTML, /Streetlight repair/);
    await vm.runInContext("reportSearch = 'missing'; loadMyHistory()", f.context);
    assert.match(f.elements.get('history-list').innerHTML, /No matching reports/);
});

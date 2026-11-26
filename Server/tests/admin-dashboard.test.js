const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../docs/Pages/Administrator/Dashboard/Dashboard.js'), 'utf8');
function fixture(fail = false) {
    const nodes = new Map();
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, {value:'',textContent:'',innerHTML:'',style:{},dataset:{},handlers:{},
            addEventListener(event, fn){this.handlers[event]=fn;},setAttribute(){},
            focus(){this.focused=true;},click(){this.clicked=true;}});
        return nodes.get(id);
    };
    const review = node('review'); review.dataset.reviewStatus = 'Pending';
    const create = node('create'); create.dataset.adminCreate = 'notices';
    const responses = {'/api/issues/stats':{total:0,pending:null},'/api/projects/stats':{active:0},'/api/residents/stats':{total:2},
        '/api/issues?limit=5':[], '/api/notices?limit=4':[], '/api/events?limit=4':[]};
    const calls=[];
    const escapeHTML=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const context=vm.createContext({console,Date,window:{CivicConfig:{apiUrl:v=>v}},
        document:{getElementById:node,querySelector:node,querySelectorAll:selector=>selector==='[data-review-status]'?[review]:selector==='[data-admin-create]'?[create]:[]},
        CivicSession:{user:{},escapeHTML,fetch:async url=>{calls.push(url);return{ok:!fail,json:async()=>fail?{message:'Unavailable'}:responses[url]};}}});
    vm.runInContext(source,context);
    return {nodes,node,context,calls,review,create};
}
test('admin overview retains real zero counts and distinguishes failures from an empty database', async()=>{
    const f=fixture();await vm.runInContext('loadStats()',f.context);
    assert.equal(f.node('count-issues').textContent,0);
    assert.equal(f.node('count-pending').textContent,0);
    assert.equal(f.node('count-residents').textContent,2);
    assert.match(f.node('recent-issues-body').innerHTML,/No reports to review/);
    assert.equal(f.node('stats-feedback').textContent,'');
    const failed=fixture(true);await vm.runInContext('loadStats()',failed.context);
    assert.equal(failed.node('count-issues').textContent,'--');
    assert.match(failed.node('stats-feedback').textContent,/unavailable/);
    assert.match(failed.node('recent-issues-body').innerHTML,/data-admin-retry/);
    assert.ok(f.calls.every(url=>url.startsWith('/api/')));
});
test('queue and publishing shortcuts retain existing navigation, filters and authoring forms',()=>{
    const f=fixture(); f.node('filterCategory').value='Water Leak';
    f.review.handlers.click();
    assert.equal(f.node('filterStatus').value,'Pending');
    assert.equal(f.node('filterCategory').value,'');
    assert.equal(f.node('[data-section="issues"]').clicked,true);
    f.create.handlers.click();
    assert.equal(f.node('[data-section="notices"]').clicked,true);
    assert.equal(f.node('add-notice-form').style.display,'block');
    assert.equal(f.node('noticeTitle').focused,true);
});

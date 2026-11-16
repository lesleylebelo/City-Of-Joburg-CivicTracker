// Isolated database substitute: never opens a SQL Server connection.
// Deliberately colliding resident/admin IDs exercise the separate ID namespaces.
const bcrypt = require('bcrypt');
const sql = require('mssql');
const fixturePassword = 'test-only-civictrack-password';
const hash = bcrypt.hashSync(fixturePassword, 4);
const otherHash = bcrypt.hashSync('different-test-only-password', 4);
const accounts = [
    { id: 1, role: 'resident', email: 'resident@example.invalid', is_active: true },
    { id: 2, role: 'resident', email: 'another@example.invalid', is_active: true },
    { id: 3, role: 'resident', email: 'inactive@example.invalid', is_active: false },
    { id: 1, role: 'admin', email: 'admin@example.invalid', employee_number: '1001', is_active: true },
    { id: 2, role: 'admin', email: 'inactive-admin@example.invalid', employee_number: '1002', is_active: false },
    { id: 4, role: 'resident', email: 'shared@example.invalid', is_active: true },
    { id: 4, role: 'admin', email: 'shared@example.invalid', employee_number: '1004', is_active: true },
    { id: 5, role: 'resident', email: 'different@example.invalid', is_active: true },
    { id: 5, role: 'admin', email: 'different@example.invalid', employee_number: '1005', is_active: true, password_hash: otherHash }
].map(account => ({ full_names: 'Test Account', password_hash: hash, ...account }));

const initialIssues = [
    { issue_id: 1, resident_id: 1, status: 'Pending', title: '<img src=x onerror=alert(1)>', image_url: '/uploads/auth-test-photo.png' },
    { issue_id: 2, resident_id: 2, status: 'Pending', title: 'Another resident report' },
    { issue_id: 3, resident_id: 1, status: 'Resolved', title: 'Resolved report' }
].map(issue => ({ category: 'Other', priority: 'Medium', location_address: 'Johannesburg', description: 'Test report', created_at: '2026-01-01', ...issue }));

const state = { queries: [], accounts, issues: [], employees: [], unavailable: false, beforeWrite: null, failIssueInsert: false };
function reset() {
    state.issues = structuredClone(initialIssues);
    state.queries = [];
    state.employees = [];
    state.unavailable = false;
    state.beforeWrite = null;
    state.failIssueInsert = false;
    state.accounts[0].is_active = true;
}
reset();

async function query(statement, inputs) {
    if (state.unavailable) throw new Error('Simulated database outage');
    const text = statement.replace(/\s+/g, ' ').trim();
    state.queries.push({ text, inputs: { ...inputs } });
    const rows = records => ({ recordset: structuredClone(records), rowsAffected: [records.length] });
    if (text.includes('UNION ALL')) {
        const identifier = inputs.identifier.toLowerCase();
        return rows(state.accounts.filter(account => account.email.toLowerCase() === identifier ||
            (account.role === 'admin' && account.employee_number === identifier)));
    }
    if (/FROM (administrators|residents) WHERE (admin_id|resident_id) = @id/.test(text)) {
        const role = text.includes('FROM administrators') ? 'admin' : 'resident';
        return rows(state.accounts.filter(account => account.role === role && account.id === inputs.id));
    }
    if (text.includes('FROM authorised_employees')) return rows(state.employees.filter(employee => employee.employee_number === inputs.employee_number));
    if (text.includes('INSERT INTO reported_issues')) {
        if (state.failIssueInsert) throw new Error('Simulated report insertion failure');
        state.issues.push({ ...inputs, issue_id: 10, status: 'Pending' });
        return rows([{ issue_id: 10 }]);
    }
    if (/^(UPDATE|DELETE FROM) reported_issues/.test(text)) {
        state.beforeWrite?.();
        const issue = state.issues.find(issue => issue.issue_id === Number(inputs.issue_id));
        if (!issue) return rows([]);
        if (text.startsWith('UPDATE') && text.includes('SET status=')) {
            issue.status = inputs.status;
            return rows([issue]);
        }
        // Verify the actual SQL carries the ownership/state predicate, not only a prior read.
        if (!text.includes('resident_id=@resident_id') || !text.includes("status='Pending'")) {
            throw new Error('Missing atomic ownership/business-rule predicate');
        }
        if (!inputs.is_admin && (issue.resident_id !== inputs.resident_id || issue.status !== 'Pending')) return rows([]);
        if (text.startsWith('DELETE')) state.issues = state.issues.filter(item => item !== issue);
        else {
            const { issue_id, resident_id, ...changes } = inputs;
            Object.assign(issue, changes);
        }
        return rows([issue]);
    }
    if (text.includes('FROM reported_issues')) {
        let issues = state.issues;
        if (inputs.image_url !== undefined) issues = issues.filter(issue => issue.image_url === inputs.image_url);
        if (inputs.issue_id !== undefined) issues = issues.filter(issue => issue.issue_id === Number(inputs.issue_id));
        if (inputs.resident_id !== undefined) issues = issues.filter(issue => issue.resident_id === Number(inputs.resident_id));
        if (inputs.rid !== undefined) issues = issues.filter(issue => issue.resident_id === inputs.rid);
        if (text.includes('COUNT(*)')) return rows([{ total: issues.length, pending: 1, in_progress: 0, resolved: 1 }]);
        return rows(issues);
    }
    if (text.includes('SELECT resident_id FROM residents WHERE email')) return rows([]);
    if (text.includes('SELECT admin_id FROM administrators WHERE email')) return rows([]);
    if (text.includes('OUTPUT INSERTED.poll_id')) return rows([{ poll_id: 1 }]);
    if (text.includes('FROM polls WHERE poll_id=')) return rows([{ poll_id: 1, question: 'Test poll', is_active: true }]);
    if (text.includes('COUNT(*)')) return rows([{ total: 1, active: 1 }]);
    if (/^(INSERT|UPDATE|DELETE)/.test(text)) return { recordset: [], rowsAffected: [1] };
    return rows([]);
}

const pool = { request() {
    const inputs = {};
    return { input(name, type, value) { inputs[name] = value; return this; }, query(text) { return query(text, inputs); } };
} };

function install() {
    const filename = require.resolve('../../db_sqlserver');
    require.cache[filename] = { id: filename, filename, loaded: true, exports: { sql, poolPromise: Promise.resolve(pool) } };
}

module.exports = { install, state, reset, fixturePassword };

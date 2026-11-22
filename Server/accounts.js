const { poolPromise } = require('./database');

async function findAccounts(identifier) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('identifier', identifier)
        .query(`SELECT resident_id AS id, 'resident' AS role, full_names, email, password_hash, is_active
                FROM civictrack.residents WHERE LOWER(email) = LOWER(@identifier)
                UNION ALL
                SELECT admin_id AS id, 'admin' AS role, full_names, email, password_hash, is_active
                FROM civictrack.administrators WHERE LOWER(email) = LOWER(@identifier) OR employee_number = @identifier`);
    return result.recordset;
}

async function findAccountById(id, role) {
    const pool = await poolPromise;
    // Identifiers and table names are fixed here, never interpolated from request data.
    const query = role === 'admin'
        ? 'SELECT admin_id AS id, full_names, email, is_active FROM civictrack.administrators WHERE admin_id = @id'
        : 'SELECT resident_id AS id, full_names, email, is_active FROM civictrack.residents WHERE resident_id = @id';
    const result = await pool.request().input('id', id).query(query);
    return result.recordset[0] ? { ...result.recordset[0], role } : null;
}

function publicAccount(account) {
    return { id: account.id, role: account.role, full_names: account.full_names, email: account.email };
}

module.exports = { findAccounts, findAccountById, publicAccount };

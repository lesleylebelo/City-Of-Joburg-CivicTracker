// CIVICTRACK - AUTH ROUTES

// Node.js / Express | SQL Server
// Handles admin & resident registration + login

const express   = require("express");
const bcrypt    = require("bcrypt");
const jwt       = require("jsonwebtoken");
const { sql, poolPromise } = require("./db_sqlserver");

const router = express.Router();
const SALT_ROUNDS = 10;
const verifyToken = require('./auth_middleware');
const { findAccounts, publicAccount } = require('./accounts');
const dummyHash = bcrypt.hashSync('civictrack-invalid-account', SALT_ROUNDS);
const loginError = { message: 'Unable to sign in. Check your details and try again.' };

async function login(req, res) {
    const { identifier, password } = req.body || {};
    res.set('Cache-Control', 'no-store');
    if (typeof identifier !== 'string' || !identifier.trim() || identifier.trim().length > 150 ||
        typeof password !== 'string' || !password || password.length > 1024) {
        return res.status(401).json(loginError);
    }
    try {
        const candidates = await findAccounts(identifier.trim());
        if (!candidates.length) await bcrypt.compare(password, dummyHash);
        const matches = [];
        for (const account of candidates) {
            const valid = await bcrypt.compare(password, account.password_hash);
            if (valid && account.is_active) matches.push(account);
        }
        // Fail closed on collisions without disclosing account types or choosing a row.
        // A client-supplied role/account_type never narrows the lookup.
        if (matches.length !== 1) return res.status(401).json(loginError);
        const user = publicAccount(matches[0]);
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET,
            { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
        return res.json({ message: 'Signed in successfully.', token, user });
    } catch {
        return res.status(503).json({ message: 'Sign-in service unavailable. Please try again.' });
    }
}

router.post('/login', login);
router.get('/session', verifyToken, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: req.user, expires_at: req.sessionExpiresAt });
});

// POST /api/auth/verify-employee
// Checks if an employee number is authorised
// and not already registered

router.post("/verify-employee", async (req, res) => {
    const { employee_number } = req.body;

    if (!employee_number) {
        return res.status(400).json({ message: "Employee number is required!" });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("employee_number", sql.NVarChar, employee_number)
            .query(`
                SELECT employee_number, full_names, role, is_registered
                FROM authorised_employees
                WHERE employee_number = @employee_number
            `);

        // Not in authorised list
        if (result.recordset.length === 0) {
            return res.status(403).json({
                message: "This employee number is not authorised to register as an administrator!"
            });
        }

        const employee = result.recordset[0];

        // Return authorisation status
        return res.status(200).json({
            message:       "Employee number verified.",
            full_names:    employee.full_names,
            role:          employee.role,
            is_registered: employee.is_registered === true || employee.is_registered === 1
        });

    } catch (error) {
        return res.status(500).json({ message: "Server error. Please try again." });
    }
});

// POST /api/auth/admin/register
// Registers a new administrator account

router.post("/admin/register", async (req, res) => {
    const { full_names, email, employee_number, password } = req.body;

    if (!full_names || !email || !employee_number || !password) {
        return res.status(400).json({ message: "All fields are required!" });
    }

    try {
        const pool = await poolPromise;

        // Double-check employee is authorised and not yet registered
        const authCheck = await pool.request()
            .input("employee_number", sql.NVarChar, employee_number)
            .query(`
                SELECT is_registered FROM authorised_employees
                WHERE employee_number = @employee_number
            `);

        if (authCheck.recordset.length === 0) {
            return res.status(403).json({ message: "Unauthorised employee number!" });
        }

        if (authCheck.recordset[0].is_registered) {
            return res.status(409).json({ message: "This employee number is already registered!" });
        }

        // Check email not already in use
        const emailCheck = await pool.request()
            .input("email", sql.NVarChar, email)
            .query(`SELECT admin_id FROM administrators WHERE email = @email`);

        if (emailCheck.recordset.length > 0) {
            return res.status(409).json({ message: "An account with this email already exists!" });
        }

        // Hash the password
        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

        // Insert only after the authorised-employee and registration checks above.
        await pool.request()
            .input("full_names",      sql.NVarChar, full_names)
            .input("email",           sql.NVarChar, email)
            .input("employee_number", sql.NVarChar, employee_number)
            .input("password_hash",   sql.NVarChar, password_hash)
            .query(`
                INSERT INTO administrators (full_names, email, employee_number, password_hash)
                VALUES (@full_names, @email, @employee_number, @password_hash)
            `);

        return res.status(201).json({ message: "Administrator account created successfully!" });

    } catch (error) {
        return res.status(500).json({ message: "Server error. Please try again." });
    }
});

// POST /api/auth/admin/login
// Logs in an administrator

// Compatibility URL; credential verification is shared with /login.
router.post('/admin/login', (req, res) => {
    req.body = { identifier: req.body?.employee_number, password: req.body?.password };
    return login(req, res);
});

// POST /api/auth/resident/register
// Registers a new resident account

router.post("/resident/register", async (req, res) => {
    const { full_names, email, phone_number, password } = req.body;

    if (!full_names || !email || !phone_number || !password) {
        return res.status(400).json({ message: "All fields are required!" });
    }

    try {
        const pool = await poolPromise;

        // Check email not already in use
        const emailCheck = await pool.request()
            .input("email", sql.NVarChar, email)
            .query(`SELECT resident_id FROM residents WHERE email = @email`);

        if (emailCheck.recordset.length > 0) {
            return res.status(409).json({ message: "An account with this email already exists!" });
        }

        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

        await pool.request()
            .input("full_names",    sql.NVarChar, full_names)
            .input("email",         sql.NVarChar, email)
            .input("phone_number",  sql.NVarChar, phone_number)
            .input("password_hash", sql.NVarChar, password_hash)
            .query(`
                INSERT INTO residents (full_names, email, phone_number, password_hash)
                VALUES (@full_names, @email, @phone_number, @password_hash)
            `);

        return res.status(201).json({ message: "Resident account created successfully!" });

    } catch (error) {
        return res.status(500).json({ message: "Server error. Please try again." });
    }
});

// POST /api/auth/resident/login
// Logs in a resident

router.post('/resident/login', (req, res) => {
    req.body = { identifier: req.body?.email, password: req.body?.password };
    return login(req, res);
});

module.exports = router;

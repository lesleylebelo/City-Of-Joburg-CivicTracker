// CIVICTRACK - AUTH ROUTES

// Node.js / Express | SQL Server
// Handles admin & resident registration + login

const express   = require("express");
const bcrypt    = require("bcrypt");
const jwt       = require("jsonwebtoken");
const { sql, poolPromise } = require("./db_sqlserver");

const router = express.Router();
const SALT_ROUNDS = 10;

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
        console.error("Verify employee error:", error);
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

        // Insert the new admin (trigger will auto-update is_registered)
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
        console.error("Admin register error:", error);
        return res.status(500).json({ message: "Server error. Please try again." });
    }
});

// POST /api/auth/admin/login
// Logs in an administrator

router.post("/admin/login", async (req, res) => {
    const { employee_number, password } = req.body;

    if (!employee_number || !password) {
        return res.status(400).json({ message: "All fields are required!" });
    }

    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input("employee_number", sql.NVarChar, employee_number)
            .query(`
                SELECT admin_id, full_names, email, employee_number, password_hash, is_active
                FROM administrators
                WHERE employee_number = @employee_number
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ message: "Invalid employee number or password!" });
        }

        const admin = result.recordset[0];

        if (!admin.is_active) {
            return res.status(403).json({ message: "This account has been deactivated!" });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ message: "Invalid employee number or password!" });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: admin.admin_id, role: "admin", employee_number: admin.employee_number },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
        );

        return res.status(200).json({
            message:    "Login successful!",
            token,
            admin: {
                admin_id:        admin.admin_id,
                full_names:      admin.full_names,
                email:           admin.email,
                employee_number: admin.employee_number
            }
        });

    } catch (error) {
        console.error("Admin login error:", error);
        return res.status(500).json({ message: "Server error. Please try again." });
    }
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
        console.error("Resident register error:", error);
        return res.status(500).json({ message: "Server error. Please try again." });
    }
});

// POST /api/auth/resident/login
// Logs in a resident

router.post("/resident/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "All fields are required!" });
    }

    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input("email", sql.NVarChar, email)
            .query(`
                SELECT resident_id, full_names, email, password_hash, is_active
                FROM residents
                WHERE email = @email
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ message: "Invalid email or password!" });
        }

        const resident = result.recordset[0];

        if (!resident.is_active) {
            return res.status(403).json({ message: "This account has been deactivated!" });
        }

        const passwordMatch = await bcrypt.compare(password, resident.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ message: "Invalid email or password!" });
        }

        const token = jwt.sign(
            { id: resident.resident_id, role: "resident" },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
        );

        return res.status(200).json({
            message: "Login successful!",
            token,
            resident: {
                resident_id: resident.resident_id,
                full_names:  resident.full_names,
                email:       resident.email
            }
        });

    } catch (error) {
        console.error("Resident login error:", error);
        return res.status(500).json({ message: "Server error. Please try again." });
    }
});

module.exports = router;

const bcrypt = require("bcrypt");
const { sql, poolPromise } = require("../../Config/db_sqlserver");
const generateToken = require("../../Utils/GenerateToken"); // Matches your case-sensitive file path utility

const SALT_ROUNDS = 10;

// =============================================
// REGISTER ADMIN
// =============================================
const registerAdmin = async (req, res) => {
    const { full_names, email, employee_number, password } = req.body;

    if (!full_names || !email || !employee_number || !password) {
        return res.status(400).json({ message: "All fields are required!" });
    }

    try {
        const pool = await poolPromise;
        const empNumInt = Number(employee_number);

        // 1. Verify that the employee number is in the authorized city ledger
        const authCheck = await pool.request()
            .input("employee_number", sql.Int, empNumInt)
            .query(`
                SELECT is_registered FROM authorised_employees WHERE employee_number = @employee_number
            `);

        if (authCheck.recordset.length === 0) {
            return res.status(403).json({ message: "Unauthorised employee number!" });
        }

        const employee = authCheck.recordset[0];
        if (employee.is_registered === true || employee.is_registered === 1) {
            return res.status(409).json({ message: "This employee number is already registered!" });
        }

        // 2. Enforce email uniqueness across system administrators
        const emailCheck = await pool.request()
            .input("email", sql.NVarChar, email)
            .query(`
                SELECT admin_id FROM administrators WHERE email = @email
            `);

        if (emailCheck.recordset.length > 0) {
            return res.status(409).json({ message: "An account with this email already exists!" });
        }

        // 3. Cryptographically hash the administrative credentials
        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

        // 4. TRANSACTION/MULTI-QUERY BLOCK: Insert admin account AND flip authorization bit
        await pool.request()
            .input("full_names", sql.NVarChar, full_names)
            .input("email", sql.NVarChar, email)
            .input("employee_number", sql.Int, empNumInt)
            .input("password_hash", sql.NVarChar, password_hash)
            .query(`
                -- Insert new administrator account
                INSERT INTO administrators (full_names, email, employee_number, password_hash)
                VALUES (@full_names, @email, @employee_number, @password_hash);

                -- CRITICAL FIX: Mark employee number as registered to block duplication exploits
                UPDATE authorised_employees 
                SET is_registered = 1 
                WHERE employee_number = @employee_number;
            `);

        return res.status(201).json({ message: "Administrator account created successfully!" });

    } catch (error) {
        console.error("Admin register error:", error);
        return res.status(500).json({ message: "Server error during admin onboarding. Please try again." });
    }
};

// =============================================
// LOGIN ADMIN
// =============================================
const loginAdmin = async (req, res) => {
    const { employee_number, password } = req.body;

    if (!employee_number || !password) {
        return res.status(400).json({ message: "All fields are required!" });
    }

    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input("employee_number", sql.Int, Number(employee_number))
            .query(`
                SELECT admin_id, full_names, email, employee_number, password_hash, is_active
                FROM administrators
                WHERE employee_number = @employee_number
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ message: "Invalid employee number or password!" });
        }

        const admin = result.recordset[0];

        // Explicit fallback security check for deactivated profiles
        if (admin.is_active === false || admin.is_active === 0) {
            return res.status(403).json({ message: "This administrative account has been deactivated!" });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ message: "Invalid employee number or password!" });
        }

        const token = generateToken({
            id: admin.admin_id,
            role: "admin",
            employee_number: admin.employee_number
        });

        return res.status(200).json({
            message: "Login successful!",
            token,
            admin: {
                admin_id: admin.admin_id,
                full_names: admin.full_names,
                email: admin.email,
                employee_number: admin.employee_number
            }
        });

    } catch (error) {
        console.error("Admin login error:", error);
        return res.status(500).json({ message: "Server error during admin verification. Please try again." });
    }
};

module.exports = {
    registerAdmin,
    loginAdmin
};

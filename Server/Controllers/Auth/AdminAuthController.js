const bcrypt = require("bcrypt");

const { sql, poolPromise } = require("../../config/db");

const generateToken = require("../../utils/generateToken");

const SALT_ROUNDS = 10;


// =============================================
// REGISTER ADMIN
// =============================================
const registerAdmin = async (req, res) => {

    const {
        full_names,
        email,
        employee_number,
        password
    } = req.body;

    if (!full_names || !email || !employee_number || !password) {
        return res.status(400).json({
            message: "All fields are required!"
        });
    }

    try {

        const pool = await poolPromise;

        const authCheck = await pool.request()
            .input("employee_number", sql.NVarChar, employee_number)
            .query(`
                SELECT is_registered
                FROM authorised_employees
                WHERE employee_number = @employee_number
            `);

        if (authCheck.recordset.length === 0) {
            return res.status(403).json({
                message: "Unauthorised employee number!"
            });
        }

        if (authCheck.recordset[0].is_registered) {
            return res.status(409).json({
                message: "This employee number is already registered!"
            });
        }

        const emailCheck = await pool.request()
            .input("email", sql.NVarChar, email)
            .query(`
                SELECT admin_id
                FROM administrators
                WHERE email = @email
            `);

        if (emailCheck.recordset.length > 0) {
            return res.status(409).json({
                message: "An account with this email already exists!"
            });
        }

        const password_hash = await bcrypt.hash(
            password,
            SALT_ROUNDS
        );

        await pool.request()
            .input("full_names", sql.NVarChar, full_names)
            .input("email", sql.NVarChar, email)
            .input("employee_number", sql.NVarChar, employee_number)
            .input("password_hash", sql.NVarChar, password_hash)
            .query(`
                INSERT INTO administrators
                (
                    full_names,
                    email,
                    employee_number,
                    password_hash
                )
                VALUES
                (
                    @full_names,
                    @email,
                    @employee_number,
                    @password_hash
                )
            `);

        return res.status(201).json({
            message: "Administrator account created successfully!"
        });

    } catch (error) {

        console.error("Admin register error:", error);

        return res.status(500).json({
            message: "Server error. Please try again."
        });
    }
};


// =============================================
// LOGIN ADMIN
// =============================================
const loginAdmin = async (req, res) => {

    const {
        employee_number,
        password
    } = req.body;

    if (!employee_number || !password) {
        return res.status(400).json({
            message: "All fields are required!"
        });
    }

    try {

        const pool = await poolPromise;

        const result = await pool.request()
            .input("employee_number", sql.NVarChar, employee_number)
            .query(`
                SELECT
                    admin_id,
                    full_names,
                    email,
                    employee_number,
                    password_hash,
                    is_active
                FROM administrators
                WHERE employee_number = @employee_number
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({
                message: "Invalid employee number or password!"
            });
        }

        const admin = result.recordset[0];

        if (!admin.is_active) {
            return res.status(403).json({
                message: "This account has been deactivated!"
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            admin.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid employee number or password!"
            });
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

        return res.status(500).json({
            message: "Server error. Please try again."
        });
    }
};

module.exports = {
    registerAdmin,
    loginAdmin
};
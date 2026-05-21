const bcrypt = require("bcrypt");

const { sql, poolPromise } = require("../../config/db");

const generateToken = require("../../utils/generateToken");

const SALT_ROUNDS = 10;


// =============================================
// REGISTER RESIDENT
// =============================================
const registerResident = async (req, res) => {

    const {
        full_names,
        email,
        phone_number,
        password
    } = req.body;

    if (!full_names || !email || !phone_number || !password) {
        return res.status(400).json({
            message: "All fields are required!"
        });
    }

    try {

        const pool = await poolPromise;

        const emailCheck = await pool.request()
            .input("email", sql.NVarChar, email)
            .query(`
                SELECT resident_id
                FROM residents
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
            .input("phone_number", sql.NVarChar, phone_number)
            .input("password_hash", sql.NVarChar, password_hash)
            .query(`
                INSERT INTO residents
                (
                    full_names,
                    email,
                    phone_number,
                    password_hash
                )
                VALUES
                (
                    @full_names,
                    @email,
                    @phone_number,
                    @password_hash
                )
            `);

        return res.status(201).json({
            message: "Resident account created successfully!"
        });

    } catch (error) {

        console.error("Resident register error:", error);

        return res.status(500).json({
            message: "Server error. Please try again."
        });
    }
};


// =============================================
// LOGIN RESIDENT
// =============================================
const loginResident = async (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "All fields are required!"
        });
    }

    try {

        const pool = await poolPromise;

        const result = await pool.request()
            .input("email", sql.NVarChar, email)
            .query(`
                SELECT
                    resident_id,
                    full_names,
                    email,
                    password_hash,
                    is_active
                FROM residents
                WHERE email = @email
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password!"
            });
        }

        const resident = result.recordset[0];

        if (!resident.is_active) {
            return res.status(403).json({
                message: "This account has been deactivated!"
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            resident.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password!"
            });
        }

        const token = generateToken({
            id: resident.resident_id,
            role: "resident"
        });

        return res.status(200).json({
            message: "Login successful!",
            token,

            resident: {
                resident_id: resident.resident_id,
                full_names: resident.full_names,
                email: resident.email
            }
        });

    } catch (error) {

        console.error("Resident login error:", error);

        return res.status(500).json({
            message: "Server error. Please try again."
        });
    }
};

module.exports = {
    registerResident,
    loginResident
};
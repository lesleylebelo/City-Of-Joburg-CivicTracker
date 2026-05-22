// =============================================
// Employee Authentication Controller
// Handles database logic for employee tracking
// =============================================
const { poolPromise, sql } = require('../../Config/db_sqlserver');

const verifyEmployee = async (req, res) => {
    const { employee_number } = req.body;

    if (!employee_number) {
        return res.status(400).json({ message: "Employee number is required!" });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("employee_number", sql.Int, Number(employee_number)) // Cast as Int to match your SSMS numeric column
            .query(`
                SELECT employee_number, full_names, role, is_registered
                FROM authorised_employees
                WHERE employee_number = @employee_number
            `);

        // Not in authorised list
        if (result.recordset.length === 0) {
            return res.status(404).json({
                message: "Employee number not recognised by the city!"
            });
        }

        const employee = result.recordset[0];
        const isRegistered = employee.is_registered === true || employee.is_registered === 1;

        // If already registered, return a 400 error block to trigger the front-end fallback message
        if (isRegistered) {
            return res.status(400).json({
                is_registered: true,
                message: "This employee number already has a registered account!"
            });
        }

        // Return successful validation payload to frontend
        return res.status(200).json({
            is_registered: false,
            message: "Employee number verified. Proceeding with registration...",
            full_names: employee.full_names,
            role: employee.role
        });

    } catch (error) {
        console.error("Verify employee error:", error);
        return res.status(500).json({ message: "Server error connecting to municipal ledger. Please try again." });
    }
};

module.exports = {
    verifyEmployee
};

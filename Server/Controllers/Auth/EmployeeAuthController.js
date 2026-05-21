// =============================================
// POST /api/auth/verify-employee
// Checks if an employee number is authorised
// and not already registered
// =============================================
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

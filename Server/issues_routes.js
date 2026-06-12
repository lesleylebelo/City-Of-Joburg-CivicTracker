const express    = require("express");
const multer     = require("multer");
const path       = require("path");
const fs         = require("fs");
const { sql, poolPromise } = require("./db_sqlserver");
const verifyToken = require("./auth_middleware");

const router = express.Router();

// Multer setup
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, "issue-" + unique + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype))
            cb(null, true);
        else cb(new Error("Only image files allowed!"));
    }
});

// POST /api/issues - submit with image
router.post("/", verifyToken, upload.single("issueImage"), async (req, res) => {

    const {
        title,
        category,
        priority,
        location_address,
        description,
        latitude,
        longitude
    } = req.body;

    const resident_id = req.user.id;
    const image_url = req.file ? "/uploads/" + req.file.filename : null;

    // Basic validation
    if (!title || !category || !location_address || !description)
        return res.status(400).json({ message: "All required fields must be filled!" });

    // NEW: coordinate validation (IMPORTANT)
    if (!latitude || !longitude)
        return res.status(400).json({ message: "Invalid location selected." });

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    // Johannesburg boundary check (simple geofence)
    const isInJoburg =
        lat >= -26.40 &&
        lat <= -25.80 &&
        lng >= 27.70 &&
        lng <= 28.40;

    if (!isInJoburg) {
        return res.status(400).json({
            message: "Only locations within the City of Johannesburg are allowed."
        });
    }

    try {
        const pool = await poolPromise;

        await pool.request()
            .input("resident_id", sql.Int, resident_id)
            .input("title", sql.NVarChar, title)
            .input("category", sql.NVarChar, category)
            .input("priority", sql.NVarChar, priority || "Medium")
            .input("location_address", sql.NVarChar, location_address)
            .input("latitude", sql.Float, lat)
            .input("longitude", sql.Float, lng)
            .input("description", sql.NVarChar, description)
            .input("image_url", sql.NVarChar, image_url)
            .query(`
                INSERT INTO reported_issues
                (resident_id, title, category, priority,
                 location_address, latitude, longitude,
                 description, image_url)
                VALUES
                (@resident_id, @title, @category, @priority,
                 @location_address, @latitude, @longitude,
                 @description, @image_url)
            `);

        return res.status(201).json({
            message: "Issue reported successfully!"
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error." });
    }
});

// GET /api/issues - all or filtered
router.get("/", verifyToken, async (req, res) => {
    const { limit, status, category } = req.query;
    const { id, role } = req.user;
    try {
        const pool = await poolPromise;
        const req2 = pool.request();
        let query = `SELECT TOP ${parseInt(limit)||100}
            i.issue_id,i.title,i.category,i.priority,i.status,
            i.location_address,i.description,i.image_url,i.created_at,i.updated_at,
            r.full_names AS resident_name, r.email AS resident_email,
            r.phone_number AS resident_phone, r.resident_id
            FROM reported_issues i JOIN residents r ON i.resident_id=r.resident_id WHERE 1=1`;
        if (role === "resident") { req2.input("rid", sql.Int, id); query += " AND i.resident_id=@rid"; }
        if (status)   { req2.input("status",   sql.NVarChar, status);   query += " AND i.status=@status"; }
        if (category) { req2.input("category", sql.NVarChar, category); query += " AND i.category=@category"; }
        query += " ORDER BY i.created_at DESC";
        const result = await req2.query(query);
        return res.status(200).json(result.recordset);
    } catch (err) { return res.status(500).json({ message: "Server error." }); }
});

// GET /api/issues/my-history
router.get("/my-history", verifyToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("resident_id", sql.Int, req.user.id)
            .query(`SELECT issue_id,title,category,priority,status,location_address,
                    description,image_url,created_at,updated_at,resolved_at,admin_notes
                    FROM reported_issues WHERE resident_id=@resident_id ORDER BY created_at DESC`);
        return res.status(200).json(result.recordset);
    } catch (err) { return res.status(500).json({ message: "Server error." }); }
});

// GET /api/issues/resident/:id - admin views resident history
router.get("/resident/:id", verifyToken, async (req, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required." });
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("resident_id", sql.Int, req.params.id)
            .query(`SELECT i.issue_id,i.title,i.category,i.priority,i.status,
                    i.location_address,i.description,i.image_url,i.created_at,
                    i.resolved_at,i.admin_notes,r.full_names,r.email,r.phone_number
                    FROM reported_issues i JOIN residents r ON i.resident_id=r.resident_id
                    WHERE i.resident_id=@resident_id ORDER BY i.created_at DESC`);
        return res.status(200).json(result.recordset);
    } catch (err) { return res.status(500).json({ message: "Server error." }); }
});

// GET /api/issues/stats
router.get("/stats", verifyToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='Pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status='In Progress' THEN 1 ELSE 0 END) AS in_progress,
            SUM(CASE WHEN status='Resolved' THEN 1 ELSE 0 END) AS resolved
            FROM reported_issues`);
        return res.status(200).json(result.recordset[0]);
    } catch (err) { return res.status(500).json({ message: "Server error." }); }
});

// GET /api/issues/analytics
router.get("/analytics", verifyToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        const byCategory = await pool.request().query(`SELECT category, COUNT(*) AS count FROM reported_issues GROUP BY category ORDER BY count DESC`);
        const byStatus   = await pool.request().query(`SELECT status,   COUNT(*) AS count FROM reported_issues GROUP BY status   ORDER BY count DESC`);
        return res.status(200).json({ byCategory: byCategory.recordset, byStatus: byStatus.recordset });
    } catch (err) { return res.status(500).json({ message: "Server error." }); }
});

// PATCH /api/issues/:id/status
router.patch("/:id/status", verifyToken, async (req, res) => {
    const { status, admin_notes } = req.body;
    const validStatuses = ["Pending","In Progress","Resolved","Rejected"];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: "Invalid status!" });
    try {
        const pool = await poolPromise;
        await pool.request()
            .input("issue_id",    sql.Int,      req.params.id)
            .input("status",      sql.NVarChar, status)
            .input("admin_notes", sql.NVarChar, admin_notes || null)
            .query(`UPDATE reported_issues SET status=@status,
                    admin_notes=COALESCE(@admin_notes,admin_notes),updated_at=GETDATE(),
                    resolved_at=CASE WHEN @status='Resolved' THEN GETDATE() ELSE resolved_at END
                    WHERE issue_id=@issue_id`);
        return res.status(200).json({ message: "Status updated!" });
    } catch (err) { return res.status(500).json({ message: "Server error." }); }
});

// GET /api/issues/residents-list - admin gets all residents with issue counts
router.get("/residents-list", verifyToken, async (req, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required." });
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT r.resident_id, r.full_names, r.email, r.phone_number, r.created_at,
            COUNT(i.issue_id) AS total_issues,
            SUM(CASE WHEN i.status='Pending' THEN 1 ELSE 0 END) AS pending_issues,
            SUM(CASE WHEN i.status='Resolved' THEN 1 ELSE 0 END) AS resolved_issues
            FROM residents r
            LEFT JOIN reported_issues i ON r.resident_id=i.resident_id
            WHERE r.is_active=1
            GROUP BY r.resident_id,r.full_names,r.email,r.phone_number,r.created_at
            ORDER BY total_issues DESC`);
        return res.status(200).json(result.recordset);
    } catch (err) { return res.status(500).json({ message: "Server error." }); }
});

// GET /api/issues/:id
router.get("/:id", verifyToken, async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input("issue_id", sql.Int, req.params.id)
            .query(`
                SELECT *
                FROM reported_issues
                WHERE issue_id = @issue_id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                message: "Issue not found."
            });
        }

        const issue = result.recordset[0];

        // Residents can only view their own issues
        if (
            req.user.role === "resident" &&
            issue.resident_id !== req.user.id
        ) {
            return res.status(403).json({
                message: "Access denied."
            });
        }

        return res.status(200).json(issue);

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: "Server error."
        });
    }
});

// PUT /api/issues/:id
router.put("/:id", verifyToken, async (req, res) => {

    const {
        title,
        category,
        priority,
        location_address,
        description
    } = req.body;

    try {

        const pool = await poolPromise;

        const issueResult = await pool.request()
            .input("issue_id", sql.Int, req.params.id)
            .query(`
                SELECT resident_id, status
                FROM reported_issues
                WHERE issue_id = @issue_id
            `);

        if (issueResult.recordset.length === 0) {
            return res.status(404).json({
                message: "Issue not found."
            });
        }

        const issue = issueResult.recordset[0];

        if (issue.resident_id !== req.user.id) {
            return res.status(403).json({
                message: "You can only edit your own issues."
            });
        }

        if (issue.status !== "Pending") {
            return res.status(400).json({
                message: "Only pending issues can be edited."
            });
        }

        await pool.request()
            .input("issue_id", sql.Int, req.params.id)
            .input("title", sql.NVarChar, title)
            .input("category", sql.NVarChar, category)
            .input("priority", sql.NVarChar, priority)
            .input("location_address", sql.NVarChar, location_address)
            .input("description", sql.NVarChar, description)
            .query(`
                UPDATE reported_issues
                SET
                    title=@title,
                    category=@category,
                    priority=@priority,
                    location_address=@location_address,
                    description=@description,
                    updated_at=GETDATE()
                WHERE issue_id=@issue_id
            `);

        return res.status(200).json({
            message: "Issue updated successfully."
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: "Server error."
        });
    }
});

// DELETE /api/issues/:id
router.delete("/:id", verifyToken, async (req, res) => {

    try {

        const pool = await poolPromise;

        const issueResult = await pool.request()
            .input("issue_id", sql.Int, req.params.id)
            .query(`
                SELECT resident_id, status, image_url
                FROM reported_issues
                WHERE issue_id = @issue_id
            `);

        if (issueResult.recordset.length === 0) {
            return res.status(404).json({
                message: "Issue not found."
            });
        }

        const issue = issueResult.recordset[0];

        if (req.user.role === "resident") {

            if (issue.resident_id !== req.user.id) {
                return res.status(403).json({
                    message: "Access denied."
                });
            }

            if (issue.status !== "Pending") {
                return res.status(400).json({
                    message: "Only pending issues can be deleted."
                });
            }
        }

        await pool.request()
            .input("issue_id", sql.Int, req.params.id)
            .query(`
                DELETE FROM reported_issues
                WHERE issue_id = @issue_id
            `);

        // Delete image if it exists
        if (issue.image_url) {

            const imagePath = path.join(
                __dirname,
                issue.image_url.replace("/uploads/", "uploads/")
            );

            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        return res.status(200).json({
            message: "Issue deleted successfully."
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: "Server error."
        });
    }
});

module.exports = router;

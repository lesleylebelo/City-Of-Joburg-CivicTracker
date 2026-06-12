const express = require("express");
const { sql, poolPromise } = require("./db_sqlserver");
const verifyToken = require("./auth_middleware");

const router = express.Router();

// DEVELOPMENT PROJECTS

// GET /api/projects
router.get("/projects", verifyToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT project_id, title, description, category, status,
                   location_address, start_date, expected_end_date, created_at
            FROM development_projects
            ORDER BY created_at DESC
        `);
        return res.status(200).json(result.recordset);
    } catch (error) {
        console.error("Get projects error:", error);
        return res.status(500).json({ message: "Server error." });
    }
});

// GET /api/projects/stats
router.get("/projects/stats", verifyToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) AS active
            FROM development_projects
        `);
        return res.status(200).json(result.recordset[0]);
    } catch (error) {
        return res.status(500).json({ message: "Server error." });
    }
});

// POST /api/projects (admin only)
router.post("/projects", verifyToken, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required." });
    }
    const { title, description, category, status, location_address, start_date, expected_end_date } = req.body;

    if (!title || !description || !category || !location_address) {
        return res.status(400).json({ message: "Required fields missing!" });
    }

    try {
        const pool = await poolPromise;
        await pool.request()
            .input("title",             sql.NVarChar, title)
            .input("description",       sql.NVarChar, description)
            .input("category",          sql.NVarChar, category)
            .input("status",            sql.NVarChar, status || "Planned")
            .input("location_address",  sql.NVarChar, location_address)
            .input("start_date",        sql.Date,     start_date        || null)
            .input("expected_end_date", sql.Date,     expected_end_date || null)
            .input("created_by_admin",  sql.Int,      req.user.id)
            .query(`
                INSERT INTO development_projects
                    (title, description, category, status, location_address, start_date, expected_end_date, created_by_admin)
                VALUES
                    (@title, @description, @category, @status, @location_address, @start_date, @expected_end_date, @created_by_admin)
            `);
        return res.status(201).json({ message: "Project added successfully!" });
    } catch (error) {
        console.error("Add project error:", error);
        return res.status(500).json({ message: "Server error." });
    }
});

// PUT /api/projects/:id
router.put("/projects/:id", verifyToken, async (req, res) => {

    if (req.user.role !== "admin")
        return res.status(403).json({ message: "Admin access required." });

    const {
        title,
        description,
        category,
        status,
        location_address,
        start_date,
        expected_end_date
    } = req.body;

    try {

        const pool = await poolPromise;

        await pool.request()
            .input("project_id", sql.Int, req.params.id)
            .input("title", sql.NVarChar, title)
            .input("description", sql.NVarChar, description)
            .input("category", sql.NVarChar, category)
            .input("status", sql.NVarChar, status)
            .input("location_address", sql.NVarChar, location_address)
            .input("start_date", sql.Date, start_date || null)
            .input("expected_end_date", sql.Date, expected_end_date || null)
            .query(`
                UPDATE development_projects
                SET
                    title=@title,
                    description=@description,
                    category=@category,
                    status=@status,
                    location_address=@location_address,
                    start_date=@start_date,
                    expected_end_date=@expected_end_date
                WHERE project_id=@project_id
            `);

        return res.status(200).json({
            message: "Project updated successfully."
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: "Server error."
        });
    }
});

// DELETE /api/projects/:id
router.delete("/projects/:id", verifyToken, async (req, res) => {

    if (req.user.role !== "admin")
        return res.status(403).json({
            message: "Admin access required."
        });

    try {

        const pool = await poolPromise;

        await pool.request()
            .input("project_id", sql.Int, req.params.id)
            .query(`
                DELETE FROM development_projects
                WHERE project_id=@project_id
            `);

        return res.status(200).json({
            message: "Project deleted successfully."
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: "Server error."
        });
    }
});

// NOTICES

// GET /api/notices
router.get("/notices", verifyToken, async (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("limit", sql.Int, limit)
            .query(`
                SELECT TOP (@limit) notice_id, title, content, category, published_at, created_at
                FROM notices
                WHERE is_published = 1
                ORDER BY created_at DESC
            `);
        return res.status(200).json(result.recordset);
    } catch (error) {
        console.error("Get notices error:", error);
        return res.status(500).json({ message: "Server error." });
    }
});

// POST /api/notices (admin only)
router.post("/notices", verifyToken, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required." });
    }
    const { title, content, category } = req.body;

    if (!title || !content) {
        return res.status(400).json({ message: "Title and content are required!" });
    }

    try {
        const pool = await poolPromise;
        await pool.request()
            .input("title",            sql.NVarChar, title)
            .input("content",          sql.NVarChar, content)
            .input("category",         sql.NVarChar, category || "General")
            .input("created_by_admin", sql.Int,      req.user.id)
            .query(`
                INSERT INTO notices (title, content, category, is_published, published_at, created_by_admin)
                VALUES (@title, @content, @category, 1, GETDATE(), @created_by_admin)
            `);
        return res.status(201).json({ message: "Notice published successfully!" });
    } catch (error) {
        console.error("Add notice error:", error);
        return res.status(500).json({ message: "Server error." });
    }
});

// PUT /api/notices/:id
router.put("/notices/:id", verifyToken, async (req, res) => {

    if (req.user.role !== "admin")
        return res.status(403).json({
            message: "Admin access required."
        });

    const {
        title,
        content,
        category
    } = req.body;

    try {

        const pool = await poolPromise;

        await pool.request()
            .input("notice_id", sql.Int, req.params.id)
            .input("title", sql.NVarChar, title)
            .input("content", sql.NVarChar, content)
            .input("category", sql.NVarChar, category)
            .query(`
                UPDATE notices
                SET
                    title=@title,
                    content=@content,
                    category=@category
                WHERE notice_id=@notice_id
            `);

        return res.status(200).json({
            message: "Notice updated successfully."
        });

    } catch (err) {
        return res.status(500).json({
            message: "Server error."
        });
    }
});

// DELETE /api/notices/:id
router.delete("/notices/:id", verifyToken, async (req, res) => {

    if (req.user.role !== "admin")
        return res.status(403).json({
            message: "Admin access required."
        });

    try {

        const pool = await poolPromise;

        await pool.request()
            .input("notice_id", sql.Int, req.params.id)
            .query(`
                DELETE FROM notices
                WHERE notice_id=@notice_id
            `);

        return res.status(200).json({
            message: "Notice deleted successfully."
        });

    } catch (err) {
        return res.status(500).json({
            message: "Server error."
        });
    }
});

// POLLS

// GET /api/polls
router.get("/polls", verifyToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        const polls = await pool.request().query(`
            SELECT poll_id, question, description, is_active, start_date, end_date
            FROM polls
            WHERE is_active = 1
            ORDER BY created_at DESC
        `);

        // Get options for each poll
        for (let poll of polls.recordset) {
            const options = await pool.request()
                .input("poll_id", sql.Int, poll.poll_id)
                .query(`
                    SELECT option_id, option_text,
                           (SELECT COUNT(*) FROM poll_votes WHERE option_id = po.option_id) AS votes
                    FROM poll_options po
                    WHERE poll_id = @poll_id
                    ORDER BY display_order
                `);
            poll.options = options.recordset;
        }

        return res.status(200).json(polls.recordset);
    } catch (error) {
        console.error("Get polls error:", error);
        return res.status(500).json({ message: "Server error." });
    }
});

// GET /api/polls/:id
router.get("/polls/:id", verifyToken, async (req, res) => {

    try {

        const pool = await poolPromise;

        const pollResult = await pool.request()
            .input("poll_id", sql.Int, req.params.id)
            .query(`
                SELECT
                    poll_id,
                    question,
                    description,
                    is_active,
                    start_date,
                    end_date
                FROM polls
                WHERE poll_id=@poll_id
            `);

        if (pollResult.recordset.length === 0) {
            return res.status(404).json({
                message: "Poll not found."
            });
        }

        const optionsResult = await pool.request()
            .input("poll_id", sql.Int, req.params.id)
            .query(`
                SELECT
                    option_id,
                    option_text,
                    display_order
                FROM poll_options
                WHERE poll_id=@poll_id
                ORDER BY display_order
            `);

        const poll = pollResult.recordset[0];
        poll.options = optionsResult.recordset;

        return res.status(200).json(poll);

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            message: "Server error."
        });
    }
});

// POST /api/polls (admin only)
router.post("/polls", verifyToken, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required." });
    }
    const { question, description, end_date, options } = req.body;

    if (!question || !options || options.length < 2) {
        return res.status(400).json({ message: "Question and at least 2 options are required!" });
    }

    try {
        const pool = await poolPromise;

        // Insert poll
        const pollResult = await pool.request()
            .input("question",         sql.NVarChar, question)
            .input("description",      sql.NVarChar, description || null)
            .input("end_date",         sql.DateTime, end_date    || null)
            .input("created_by_admin", sql.Int,      req.user.id)
            .query(`
                INSERT INTO polls (question, description, end_date, created_by_admin)
                OUTPUT INSERTED.poll_id
                VALUES (@question, @description, @end_date, @created_by_admin)
            `);

        const poll_id = pollResult.recordset[0].poll_id;

        // Insert options
        for (let i = 0; i < options.length; i++) {
            await pool.request()
                .input("poll_id",       sql.Int,      poll_id)
                .input("option_text",   sql.NVarChar, options[i])
                .input("display_order", sql.Int,      i + 1)
                .query(`
                    INSERT INTO poll_options (poll_id, option_text, display_order)
                    VALUES (@poll_id, @option_text, @display_order)
                `);
        }

        return res.status(201).json({ message: "Poll created successfully!" });
    } catch (error) {
        console.error("Add poll error:", error);
        return res.status(500).json({ message: "Server error." });
    }
});

// PUT /api/polls/:id
router.put("/polls/:id", verifyToken, async (req, res) => {

    if (req.user.role !== "admin")
        return res.status(403).json({
            message: "Admin access required."
        });

    const {
        question,
        description,
        end_date,
        options
    } = req.body;

    try {

        const pool = await poolPromise;

        await pool.request()
            .input("poll_id", sql.Int, req.params.id)
            .input("question", sql.NVarChar, question)
            .input("description", sql.NVarChar, description || null)
            .input("end_date", sql.DateTime, end_date || null)
            .query(`
                UPDATE polls
                SET
                    question=@question,
                    description=@description,
                    end_date=@end_date
                WHERE poll_id=@poll_id
            `);

        if (Array.isArray(options) && options.length >= 2) {

            await pool.request()
                .input("poll_id", sql.Int, req.params.id)
                .query(`
                    DELETE FROM poll_options
                    WHERE poll_id=@poll_id
                `);

            for (let i = 0; i < options.length; i++) {

                await pool.request()
                    .input("poll_id", sql.Int, req.params.id)
                    .input("option_text", sql.NVarChar, options[i])
                    .input("display_order", sql.Int, i + 1)
                    .query(`
                        INSERT INTO poll_options
                        (poll_id, option_text, display_order)
                        VALUES
                        (@poll_id, @option_text, @display_order)
                    `);
            }
        }

        return res.status(200).json({
            message: "Poll updated successfully."
        });

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            message: "Server error."
        });
    }
});

// POST /api/polls/:id/vote (resident)
router.post("/polls/:id/vote", verifyToken, async (req, res) => {
    const { option_id } = req.body;
    const poll_id       = req.params.id;
    const resident_id   = req.user.id;

    if (!option_id) {
        return res.status(400).json({ message: "Please select an option!" });
    }

    try {
        const pool = await poolPromise;

        // Check already voted
        const existing = await pool.request()
            .input("poll_id",     sql.Int, poll_id)
            .input("resident_id", sql.Int, resident_id)
            .query(`SELECT vote_id FROM poll_votes WHERE poll_id = @poll_id AND resident_id = @resident_id`);

        if (existing.recordset.length > 0) {
            return res.status(409).json({ message: "You have already voted on this poll!" });
        }

        await pool.request()
            .input("poll_id",     sql.Int, poll_id)
            .input("option_id",   sql.Int, option_id)
            .input("resident_id", sql.Int, resident_id)
            .query(`INSERT INTO poll_votes (poll_id, option_id, resident_id) VALUES (@poll_id, @option_id, @resident_id)`);

        return res.status(201).json({ message: "Vote recorded successfully!" });
    } catch (error) {
        console.error("Vote error:", error);
        return res.status(500).json({ message: "Server error." });
    }
});

// PATCH /api/polls/:id/close
router.patch("/polls/:id/close", verifyToken, async (req, res) => {

    if (req.user.role !== "admin")
        return res.status(403).json({
            message: "Admin access required."
        });

    try {

        const pool = await poolPromise;

        await pool.request()
            .input("poll_id", sql.Int, req.params.id)
            .query(`
                UPDATE polls
                SET is_active = 0
                WHERE poll_id=@poll_id
            `);

        return res.status(200).json({
            message: "Poll closed successfully."
        });

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            message: "Server error."
        });
    }
});

// DELETE /api/polls/:id
router.delete("/polls/:id", verifyToken, async (req, res) => {

    if (req.user.role !== "admin")
        return res.status(403).json({
            message: "Admin access required."
        });

    try {

        const pool = await poolPromise;

        await pool.request()
            .input("poll_id", sql.Int, req.params.id)
            .query(`
                DELETE FROM poll_options
                WHERE poll_id=@poll_id;

                DELETE FROM poll_votes
                WHERE poll_id=@poll_id;

                DELETE FROM polls
                WHERE poll_id=@poll_id;
            `);

        return res.status(200).json({
            message: "Poll deleted successfully."
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: "Server error."
        });
    }
});


// EVENTS

// GET /api/events
router.get("/events", verifyToken, async (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("limit", sql.Int, limit)
            .query(`
                SELECT TOP (@limit)
                    event_id, title, description, category,
                    location_address, event_date, start_time, end_time
                FROM events
                WHERE is_published = 1
                AND event_date >= CAST(GETDATE() AS DATE)
                ORDER BY event_date ASC
            `);
        return res.status(200).json(result.recordset);
    } catch (error) {
        console.error("Get events error:", error);
        return res.status(500).json({ message: "Server error." });
    }
});

// POST /api/events (admin only)
router.post("/events", verifyToken, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required." });
    }
    const { title, description, category, location_address, event_date, start_time, end_time } = req.body;

    if (!title || !description || !location_address || !event_date || !start_time) {
        return res.status(400).json({ message: "Required fields missing!" });
    }

    try {
        const pool = await poolPromise;
        await pool.request()
            .input("title",            sql.NVarChar, title)
            .input("description",      sql.NVarChar, description)
            .input("category",         sql.NVarChar, category || "Community Meeting")
            .input("location_address", sql.NVarChar, location_address)
            .input("event_date",       sql.Date,     event_date)
            .input("start_time",       sql.NVarChar, start_time)
            .input("end_time",         sql.NVarChar, end_time   || null)
            .input("created_by_admin", sql.Int,      req.user.id)
            .query(`
                INSERT INTO events
                    (title, description, category, location_address, event_date, start_time, end_time, is_published, created_by_admin)
                VALUES
                    (@title, @description, @category, @location_address, @event_date, @start_time, @end_time, 1, @created_by_admin)
            `);
        return res.status(201).json({ message: "Event created successfully!" });
    } catch (error) {
        console.error("Add event error:", error);
        return res.status(500).json({ message: "Server error." });
    }
});

// PUT /api/events/:id
router.put("/events/:id", verifyToken, async (req, res) => {

    if (req.user.role !== "admin")
        return res.status(403).json({
            message: "Admin access required."
        });

    const {
        title,
        description,
        category,
        location_address,
        event_date,
        start_time,
        end_time
    } = req.body;

    try {

        const pool = await poolPromise;

        await pool.request()
            .input("event_id", sql.Int, req.params.id)
            .input("title", sql.NVarChar, title)
            .input("description", sql.NVarChar, description)
            .input("category", sql.NVarChar, category)
            .input("location_address", sql.NVarChar, location_address)
            .input("event_date", sql.Date, event_date)
            .input("start_time", sql.NVarChar, start_time)
            .input("end_time", sql.NVarChar, end_time)
            .query(`
                UPDATE events
                SET
                    title=@title,
                    description=@description,
                    category=@category,
                    location_address=@location_address,
                    event_date=@event_date,
                    start_time=@start_time,
                    end_time=@end_time
                WHERE event_id=@event_id
            `);

        return res.status(200).json({
            message: "Event updated successfully."
        });

    } catch (err) {
        return res.status(500).json({
            message: "Server error."
        });
    }
});

// DELETE /api/events/:id
router.delete("/events/:id", verifyToken, async (req, res) => {

    if (req.user.role !== "admin")
        return res.status(403).json({
            message: "Admin access required."
        });

    try {

        const pool = await poolPromise;

        await pool.request()
            .input("event_id", sql.Int, req.params.id)
            .query(`
                DELETE FROM events
                WHERE event_id=@event_id
            `);

        return res.status(200).json({
            message: "Event deleted successfully."
        });

    } catch (err) {
        return res.status(500).json({
            message: "Server error."
        });
    }
});

// RESIDENTS STATS (admin)

router.get("/residents/stats", verifyToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT COUNT(*) AS total FROM residents WHERE is_active = 1
        `);
        return res.status(200).json(result.recordset[0]);
    } catch (error) {
        return res.status(500).json({ message: "Server error." });
    }
});

module.exports = router;
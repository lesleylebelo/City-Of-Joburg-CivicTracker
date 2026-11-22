const express = require("express");
const { poolPromise } = require("./database");
const verifyToken = require("./auth_middleware");
const { requireRole } = verifyToken;

const router = express.Router();

// DEVELOPMENT PROJECTS

// GET /api/projects
router.get("/projects", verifyToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT project_id, title, description, category, status,
                   location_address, start_date, expected_end_date, created_at
            FROM civictrack.development_projects
            ORDER BY created_at DESC
        `);
        return res.status(200).json(result.recordset);
    } catch (error) {
        console.error("Database operation failed.");
        return res.status(error.status === 503 ? 503 : 500).json({ message: "Server error." });
    }
});

// GET /api/projects/stats
router.get("/projects/stats", verifyToken, requireRole("admin"), async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) AS active
            FROM civictrack.development_projects
        `);
        return res.status(200).json(result.recordset[0]);
    } catch (error) {
        return res.status(error.status === 503 ? 503 : 500).json({ message: "Server error." });
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
            .input("title", title)
            .input("description", description)
            .input("category", category)
            .input("status", status || "Planned")
            .input("location_address", location_address)
            .input("start_date", start_date        || null)
            .input("expected_end_date", expected_end_date || null)
            .input("created_by_admin", req.user.id)
            .query(`
                INSERT INTO civictrack.development_projects
                    (title, description, category, status, location_address, start_date, expected_end_date, created_by_admin)
                VALUES
                    (@title, @description, @category, @status, @location_address, @start_date, @expected_end_date, @created_by_admin)
            `);
        return res.status(201).json({ message: "Project added successfully!" });
    } catch (error) {
        console.error("Database operation failed.");
        return res.status(error.status === 503 ? 503 : 500).json({ message: "Server error." });
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
            .input("project_id", req.params.id)
            .input("title", title)
            .input("description", description)
            .input("category", category)
            .input("status", status)
            .input("location_address", location_address)
            .input("start_date", start_date || null)
            .input("expected_end_date", expected_end_date || null)
            .query(`
                UPDATE civictrack.development_projects
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
        console.error("Database operation failed.");
        return res.status(err.status === 503 ? 503 : 500).json({
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
            .input("project_id", req.params.id)
            .query(`
                DELETE FROM civictrack.development_projects
                WHERE project_id=@project_id
            `);

        return res.status(200).json({
            message: "Project deleted successfully."
        });

    } catch (err) {
        console.error("Database operation failed.");
        return res.status(err.status === 503 ? 503 : 500).json({
            message: "Server error."
        });
    }
});

// NOTICES

// GET /api/notices
router.get("/notices", verifyToken, async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("limit", limit)
            .query(`
                SELECT notice_id, title, content, category, published_at, created_at
                FROM civictrack.notices
                WHERE is_published=TRUE
                ORDER BY created_at DESC LIMIT @limit
            `);
        return res.status(200).json(result.recordset);
    } catch (error) {
        console.error("Database operation failed.");
        return res.status(error.status === 503 ? 503 : 500).json({ message: "Server error." });
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
            .input("title", title)
            .input("content", content)
            .input("category", category || "General")
            .input("created_by_admin", req.user.id)
            .query(`
                INSERT INTO civictrack.notices (title, content, category, is_published, published_at, created_by_admin)
                VALUES (@title, @content, @category, TRUE, CURRENT_TIMESTAMP, @created_by_admin)
            `);
        return res.status(201).json({ message: "Notice published successfully!" });
    } catch (error) {
        console.error("Database operation failed.");
        return res.status(error.status === 503 ? 503 : 500).json({ message: "Server error." });
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
            .input("notice_id", req.params.id)
            .input("title", title)
            .input("content", content)
            .input("category", category)
            .query(`
                UPDATE civictrack.notices
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
        return res.status(err.status === 503 ? 503 : 500).json({
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
            .input("notice_id", req.params.id)
            .query(`
                DELETE FROM civictrack.notices
                WHERE notice_id=@notice_id
            `);

        return res.status(200).json({
            message: "Notice deleted successfully."
        });

    } catch (err) {
        return res.status(err.status === 503 ? 503 : 500).json({
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
            FROM civictrack.polls
            WHERE is_active=TRUE
            ORDER BY created_at DESC
        `);

        // Get options for each poll
        for (let poll of polls.recordset) {
            const options = await pool.request()
                .input("poll_id", poll.poll_id)
                .query(`
                    SELECT option_id, option_text,
                           (SELECT COUNT(*) FROM civictrack.poll_votes WHERE option_id = po.option_id) AS votes
                    FROM civictrack.poll_options po
                    WHERE poll_id = @poll_id
                    ORDER BY display_order
                `);
            poll.options = options.recordset;
        }

        return res.status(200).json(polls.recordset);
    } catch (error) {
        console.error("Database operation failed.");
        return res.status(error.status === 503 ? 503 : 500).json({ message: "Server error." });
    }
});

// GET /api/polls/:id
router.get("/polls/:id", verifyToken, async (req, res) => {

    try {

        const pool = await poolPromise;

        const pollResult = await pool.request()
            .input("poll_id", req.params.id)
            .query(`
                SELECT
                    poll_id,
                    question,
                    description,
                    is_active,
                    start_date,
                    end_date
                FROM civictrack.polls
                WHERE poll_id=@poll_id
            `);

        if (pollResult.recordset.length === 0) {
            return res.status(404).json({
                message: "Poll not found."
            });
        }

        const optionsResult = await pool.request()
            .input("poll_id", req.params.id)
            .query(`
                SELECT
                    option_id,
                    option_text,
                    display_order
                FROM civictrack.poll_options
                WHERE poll_id=@poll_id
                ORDER BY display_order
            `);

        const poll = pollResult.recordset[0];
        poll.options = optionsResult.recordset;

        return res.status(200).json(poll);

    } catch (err) {

        console.error("Database operation failed.");

        return res.status(err.status === 503 ? 503 : 500).json({
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
            .input("question", question)
            .input("description", description || null)
            .input("end_date", end_date    || null)
            .input("created_by_admin", req.user.id)
            .query(`
                INSERT INTO civictrack.polls (question, description, end_date, created_by_admin)
                VALUES (@question, @description, @end_date, @created_by_admin) RETURNING poll_id
            `);

        const poll_id = pollResult.recordset[0].poll_id;

        // Insert options
        for (let i = 0; i < options.length; i++) {
            await pool.request()
                .input("poll_id", poll_id)
                .input("option_text", options[i])
                .input("display_order", i + 1)
                .query(`
                    INSERT INTO civictrack.poll_options (poll_id, option_text, display_order)
                    VALUES (@poll_id, @option_text, @display_order)
                `);
        }

        return res.status(201).json({ message: "Poll created successfully!" });
    } catch (error) {
        console.error("Database operation failed.");
        return res.status(error.status === 503 ? 503 : 500).json({ message: "Server error." });
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
            .input("poll_id", req.params.id)
            .input("question", question)
            .input("description", description || null)
            .input("end_date", end_date || null)
            .query(`
                UPDATE civictrack.polls
                SET
                    question=@question,
                    description=@description,
                    end_date=@end_date
                WHERE poll_id=@poll_id
            `);

        if (Array.isArray(options) && options.length >= 2) {

            await pool.request()
                .input("poll_id", req.params.id)
                .query(`
                    DELETE FROM civictrack.poll_options
                    WHERE poll_id=@poll_id
                `);

            for (let i = 0; i < options.length; i++) {

                await pool.request()
                    .input("poll_id", req.params.id)
                    .input("option_text", options[i])
                    .input("display_order", i + 1)
                    .query(`
                        INSERT INTO civictrack.poll_options
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

        console.error("Database operation failed.");

        return res.status(err.status === 503 ? 503 : 500).json({
            message: "Server error."
        });
    }
});

// POST /api/polls/:id/vote (resident)
router.post("/polls/:id/vote", verifyToken, requireRole("resident"), async (req, res) => {
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
            .input("poll_id", poll_id)
            .input("resident_id", resident_id)
            .query(`SELECT vote_id FROM civictrack.poll_votes WHERE poll_id = @poll_id AND resident_id = @resident_id`);

        if (existing.recordset.length > 0) {
            return res.status(409).json({ message: "You have already voted on this poll!" });
        }

        await pool.request()
            .input("poll_id", poll_id)
            .input("option_id", option_id)
            .input("resident_id", resident_id)
            .query(`INSERT INTO civictrack.poll_votes (poll_id, option_id, resident_id) VALUES (@poll_id, @option_id, @resident_id)`);

        return res.status(201).json({ message: "Vote recorded successfully!" });
    } catch (error) {
        console.error("Database operation failed.");
        return res.status(error.status === 503 ? 503 : 500).json({ message: "Server error." });
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
            .input("poll_id", req.params.id)
            .query(`
                UPDATE civictrack.polls
                SET is_active=FALSE
                WHERE poll_id=@poll_id
            `);

        return res.status(200).json({
            message: "Poll closed successfully."
        });

    } catch (err) {

        console.error("Database operation failed.");

        return res.status(err.status === 503 ? 503 : 500).json({
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
            .input("poll_id", req.params.id)
            .query(`
                WITH deleted_votes AS (
                    DELETE FROM civictrack.poll_votes WHERE poll_id=@poll_id RETURNING vote_id
                ), deleted_options AS (
                    DELETE FROM civictrack.poll_options WHERE poll_id=@poll_id
                    AND (SELECT COUNT(*) FROM deleted_votes) >= 0 RETURNING option_id
                )
                DELETE FROM civictrack.polls WHERE poll_id=@poll_id
                AND (SELECT COUNT(*) FROM deleted_options) >= 0
            `);

        return res.status(200).json({
            message: "Poll deleted successfully."
        });

    } catch (err) {
        console.error("Database operation failed.");
        return res.status(err.status === 503 ? 503 : 500).json({
            message: "Server error."
        });
    }
});


// EVENTS

// GET /api/events
router.get("/events", verifyToken, async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("limit", limit)
            .query(`
                SELECT
                    event_id, title, description, category,
                    location_address, event_date, start_time, end_time
                FROM civictrack.events
                WHERE is_published=TRUE
                AND event_date >= CAST(CURRENT_TIMESTAMP AS DATE)
                ORDER BY event_date ASC LIMIT @limit
            `);
        return res.status(200).json(result.recordset);
    } catch (error) {
        console.error("Database operation failed.");
        return res.status(error.status === 503 ? 503 : 500).json({ message: "Server error." });
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
            .input("title", title)
            .input("description", description)
            .input("category", category || "Community Meeting")
            .input("location_address", location_address)
            .input("event_date", event_date)
            .input("start_time", start_time)
            .input("end_time", end_time   || null)
            .input("created_by_admin", req.user.id)
            .query(`
                INSERT INTO civictrack.events
                    (title, description, category, location_address, event_date, start_time, end_time, is_published, created_by_admin)
                VALUES
                    (@title, @description, @category, @location_address, @event_date, @start_time, @end_time, TRUE, @created_by_admin)
            `);
        return res.status(201).json({ message: "Event created successfully!" });
    } catch (error) {
        console.error("Database operation failed.");
        return res.status(error.status === 503 ? 503 : 500).json({ message: "Server error." });
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
            .input("event_id", req.params.id)
            .input("title", title)
            .input("description", description)
            .input("category", category)
            .input("location_address", location_address)
            .input("event_date", event_date)
            .input("start_time", start_time)
            .input("end_time", end_time)
            .query(`
                UPDATE civictrack.events
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
        return res.status(err.status === 503 ? 503 : 500).json({
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
            .input("event_id", req.params.id)
            .query(`
                DELETE FROM civictrack.events
                WHERE event_id=@event_id
            `);

        return res.status(200).json({
            message: "Event deleted successfully."
        });

    } catch (err) {
        return res.status(err.status === 503 ? 503 : 500).json({
            message: "Server error."
        });
    }
});

// RESIDENTS STATS (admin)

router.get("/residents/stats", verifyToken, requireRole("admin"), async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT COUNT(*) AS total FROM civictrack.residents WHERE is_active=TRUE
        `);
        return res.status(200).json(result.recordset[0]);
    } catch (error) {
        return res.status(error.status === 503 ? 503 : 500).json({ message: "Server error." });
    }
});

module.exports = router;

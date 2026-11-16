const express = require('express');
const path = require('path');
const verifyToken = require('./auth_middleware');
const { sql, poolPromise } = require('./db_sqlserver');
const app = express();

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api/auth', require('./auth_routes'));
app.use('/api/issues', require('./issues_routes'));
app.use('/api', require('./data_routes'));
app.get('/api/health', (req, res) => res.json({ status: 'CivicTrack running!' }));
app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint not found.' }));

// Report photos are private report data, not public static assets.
app.get('/uploads/:filename', verifyToken, async (req, res) => {
    const filename = req.params.filename;
    if (filename !== path.basename(filename) || /[\\/]/.test(filename)) return res.sendStatus(404);
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('image_url', sql.NVarChar, '/uploads/' + filename)
            .query('SELECT resident_id FROM reported_issues WHERE image_url=@image_url');
        if (!result.recordset.some(issue => req.user.role === 'admin' || issue.resident_id === req.user.id)) {
            return res.sendStatus(404);
        }
        res.set('Cache-Control', 'no-store');
        return res.sendFile(filename, { root: path.join(__dirname, 'uploads'), dotfiles: 'deny' });
    } catch {
        return res.status(500).json({ message: 'Unable to load photo.' });
    }
});

// Never expose the Server directory, database schema or configuration as static files.
app.use(express.static(path.join(__dirname, '../docs')));
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status >= 400 && error.status < 500 ? error.status : 500)
        .json({ message: 'Unable to complete this request.' });
});

module.exports = app;

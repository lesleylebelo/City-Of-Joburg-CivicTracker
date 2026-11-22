const express = require('express');
const path = require('path');
const verifyToken = require('./auth_middleware');
const images = require('./image_storage');
const { poolPromise } = require('./database');
const app = express();
// Render terminates HTTPS at its single ingress proxy.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(['/api', '/uploads'], require('./cors_policy')());
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api/auth', require('./auth_routes'));
app.use('/api/issues', require('./issues_routes'));
app.use('/api', require('./data_routes'));
app.get('/api/health', (req, res) => res.json({ status: 'CivicTrack running!' }));
app.get('/api/health/ready', async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request().query('SELECT 1');
    } catch {
        return res.status(503).json({ message: 'Database service unavailable.' });
    }
    try { await images.checkReady(); }
    catch { return res.status(503).json({ message: 'Image storage unavailable.' }); }
    return res.json({ status: 'ready' });
});
app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint not found.' }));

// Report photos are private report data, not public static assets.
app.get('/uploads/:filename', verifyToken, async (req, res, next) => {
    const filename = req.params.filename;
    if (filename !== path.basename(filename) || /[\\/]/.test(filename)) return res.sendStatus(404);
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('image_url', '/uploads/' + filename)
            .query('SELECT resident_id FROM civictrack.reported_issues WHERE image_url=@image_url');
        if (!result.recordset.some(issue => req.user.role === 'admin' || issue.resident_id === req.user.id)) {
            return res.sendStatus(404);
        }
        res.set('Cache-Control', 'no-store');
        res.set('X-Content-Type-Options', 'nosniff');
        const stream = await images.getImageStream(filename);
        res.type(filename);
        stream.on('error', () => {
            if (res.headersSent) res.destroy();
            else res.status(500).json({ message: 'Unable to load photo.' });
        });
        res.on('close', () => stream.destroy());
        return stream.pipe(res);
    } catch (error) {
        if (error.code === 'ENOENT' || error.status === 404) return next(Object.assign(error, { status: 404 }));
        return res.status(error.status === 503 ? 503 : 500).json({ message: 'Unable to load photo.' });
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

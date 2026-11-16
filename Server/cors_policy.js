const cors = require('cors');

function createCorsPolicy(value = process.env.CORS_ALLOWED_ORIGINS || '') {
    const allowed = new Set(value.split(',').map(origin => origin.trim()).filter(Boolean));
    for (const origin of allowed) {
        let parsed;
        try { parsed = new URL(origin); } catch { throw new Error('Invalid CORS origin configuration.'); }
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
            throw new Error('Invalid CORS origin configuration.');
        }
    }
    return (req, res, next) => {
        const origin = req.get('Origin');
        const sameOrigin = req.protocol + '://' + req.get('host');
        res.vary('Origin');
        if (origin && origin !== sameOrigin && !allowed.has(origin)) {
            return res.status(403).json({ message: 'Origin not allowed.' });
        }
        return cors({
            origin: origin || false,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Authorization', 'Content-Type'],
            credentials: false,
            maxAge: 600
        })(req, res, next);
    };
}
module.exports = createCorsPolicy;

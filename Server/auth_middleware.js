const jwt = require('jsonwebtoken');
const { findAccountById, publicAccount } = require('./accounts');

async function verifyToken(req, res, next) {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ message: 'Please sign in again.' });
    let claims;
    try {
        claims = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (!Number.isSafeInteger(claims.id) || claims.id <= 0 ||
            !['resident', 'admin'].includes(claims.role) || !Number.isFinite(claims.exp)) {
            throw new Error('Invalid session');
        }
    } catch {
        return res.status(401).json({ message: 'Please sign in again.' });
    }
    try {
        // Deleted and deactivated accounts lose access even before the JWT expires.
        const account = await findAccountById(claims.id, claims.role);
        if (!account || !account.is_active) return res.status(401).json({ message: 'Please sign in again.' });
        req.user = publicAccount(account);
        req.sessionExpiresAt = claims.exp;
        return next();
    } catch {
        return res.status(503).json({ message: 'Sign-in service unavailable. Please try again.' });
    }
}

function requireRole(...roles) {
    return (req, res, next) => roles.includes(req.user?.role)
        ? next()
        : res.status(403).json({ message: 'You do not have permission for this action.' });
}

module.exports = verifyToken;
module.exports.requireRole = requireRole;

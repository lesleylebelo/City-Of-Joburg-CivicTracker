const jwt = require("jsonwebtoken");
require("dotenv").config();

const protect = (req, res, next) => {
    let token;

    // Check for token in the Authorization header (Format: Bearer <token>)
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        try {
            // Extract token string from Bearer array prefix
            token = req.headers.authorization.split(" ")[1];

            // Verify signature using your system environment secret key
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Attach user payload metadata (id, role, etc.) directly to request context
            req.user = decoded;

            // Hand over execution to the next function block safely
            return next();
        } catch (error) {
            console.error("Token authentication signature match failure:", error.message);
            return res.status(401).json({ message: "Not authorized! Token signature has failed or expired." });
        }
    }

    // Fallback if no token was attached to request header context
    if (!token) {
        return res.status(401).json({ message: "Not authorized! Access denied, no security token provided." });
    }
};

module.exports = protect;

const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        // Enforce prerequisite checking to prevent system lookup crashes
        if (!req.user || !req.user.role) {
            return res.status(401).json({ message: "Access Denied! User context profile information missing." });
        }

        // Compare role string value against array parameter limits
        if (!allowedRoles.includes(req.user.role.toLowerCase())) {
            return res.status(403).json({ 
                message: `Forbidden! Your account role (${req.user.role}) is not allowed to access this resource.` 
            });
        }

        // Access matches permission metrics - continue processing request
        next();
    };
};

module.exports = authorizeRoles;

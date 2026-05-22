require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// =============================================
// ROUTE IMPORTS
// =============================================
const adminAuthRoutes = require("./Routes/Auth/AdminAuthRoutes");
const residentAuthRoutes = require("./Routes/Auth/ResidentAuthRoutes");
const employeeVerificationRoutes = require("./Routes/Auth/EmployeeVerificationRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// MIDDLEWARE
// =============================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =============================================
// DEFAULT LANDING ROUTE (Resolves Root First)
// =============================================
app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "../Client/Pages/Public/Landing/Landing.html")
    );
});

// =============================================
// STATIC FILES (Serves Assets, Styles, and Scripts)
// =============================================
app.use(
    express.static(
        path.join(__dirname, "../Client")
    )
);

// =============================================
// API ROUTES
// =============================================
app.use("/api/auth/admin", adminAuthRoutes);
app.use("/api/auth/resident", residentAuthRoutes);
app.use("/api/auth", employeeVerificationRoutes);

// =============================================
// HEALTH CHECK
// =============================================
app.get("/api/health", (req, res) => {
    res.json({
        status: "CivicTrack server is running!"
    });
});

// =============================================
// SERVER INITIALIZATION
// =============================================
app.listen(PORT, () => {
    console.log(`CivicTrack server running at http://localhost:${PORT}`);
});

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// =============================================
// ROUTE IMPORTS
// =============================================
const adminAuthRoutes = require("./Routes/Auth/AdminAuthRoutes");
const residentAuthRoutes = require("./Routes/Auth/ResidentAuthRoutes");
// Aligned to match your exact file tree naming layout: EmployeeAuthRoutes.js
const employeeVerificationRoutes = require("./Routes/Auth/EmployeeVerificationRoutes.js");


const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// GLOBAL MIDDLEWARE CONFIGURATION
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
// API ROUTE MOUNTING POINTS
// =============================================
app.use("/api/auth/admin", adminAuthRoutes);
app.use("/api/auth/resident", residentAuthRoutes);
app.use("/api/auth", employeeVerificationRoutes);

// =============================================
// HEALTH CHECK
// =============================================
app.get("/api/health", (req, res) => {
    res.json({
        status: "success",
        message: "CivicTrack API server is running smoothly!"
    });
});

// =============================================
// SERVER INITIALIZATION
// =============================================
app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(` CivicTrack backend engine active.`);
    console.log(` Listening securely at http://localhost:${PORT}`);
    console.log(`=================================================`);
});

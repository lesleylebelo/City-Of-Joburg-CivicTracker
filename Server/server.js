require("dotenv").config();

const express = require("express");

const cors = require("cors");

const path = require("path");


// Route Imports
const adminAuthRoutes =
    require("./routes/auth/adminAuthRoutes");

const residentAuthRoutes =
    require("./routes/auth/residentAuthRoutes");

const employeeVerificationRoutes =
    require("./routes/auth/employeeVerificationRoutes");


const app = express();

const PORT = process.env.PORT || 3000;


// =============================================
// MIDDLEWARE
// =============================================
app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));


// =============================================
// STATIC FILES
// =============================================
app.use(
    express.static(
        path.join(__dirname, "../client")
    )
);


// =============================================
// ROUTES
// =============================================
app.use(
    "/api/auth/admin",
    adminAuthRoutes
);

app.use(
    "/api/auth/resident",
    residentAuthRoutes
);

app.use(
    "/api/auth",
    employeeVerificationRoutes
);


// =============================================
// HEALTH CHECK
// =============================================
app.get("/api/health", (req, res) => {

    res.json({
        status: "CivicTrack server is running!"
    });

});


// =============================================
// SERVER
// =============================================
app.listen(PORT, () => {

    console.log(
        `CivicTrack server running at http://localhost:${PORT}`
    );

});
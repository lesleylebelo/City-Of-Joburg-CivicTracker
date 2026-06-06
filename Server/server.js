const express  = require("express");
const cors     = require("cors");
const path     = require("path");
require("dotenv").config();

const authRoutes  = require("./auth_routes");
const dataRoutes  = require("./data_routes");
const issueRoutes = require("./issues_routes");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Serve all static files from the Client directory
app.use(express.static(path.join(__dirname, '../docs')));

// Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth",   authRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api",        dataRoutes);

// Default
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../docs/index.html")));
app.get("/api/health", (req, res) => res.json({ status: "CivicTrack running!" }));

app.listen(PORT, () => {
    console.log(`CivicTrack server running at http://localhost:${PORT}`);
});
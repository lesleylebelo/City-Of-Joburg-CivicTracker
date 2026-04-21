const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
const authRoutes = require("./auth_routes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use("/api/auth", authRoutes);

app.get("/api/health", (req, res) => {
    res.json({ status: "CivicTrack server is running!" });
});

app.listen(PORT, () => {
    console.log("✅ CivicTrack server running at http://localhost:" + PORT);
});

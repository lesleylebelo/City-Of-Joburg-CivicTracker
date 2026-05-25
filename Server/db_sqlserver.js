const sql = require("mssql");
require("dotenv").config();

const config = {
    server: "localhost\\SQLEXPRESS",
    database: "civictrack_db",
    port: 21367,
    user: "civictrack_user",
    password: "CivicTrack2026!",
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log("Connected to CivicTrack SQL Server database successfully.");
        return pool;
    })
    .catch(error => {
        console.error("Database connection failed:", error.message);
        process.exit(1);
    });

module.exports = { sql, poolPromise };

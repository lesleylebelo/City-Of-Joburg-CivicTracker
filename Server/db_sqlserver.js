const sql = require("mssql");
require("dotenv").config({ path: "./.env" });

// Safety check (prevents empty login issues)
if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
    console.error("Missing DB credentials in .env file");
    process.exit(1);
}

const config = {
    server: process.env.DB_HOST,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT, 10),

    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,

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
const path     = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
if (!process.env.JWT_SECRET) throw new Error('Configure JWT_SECRET in Server/.env before starting CivicTrack.');
const app = require('./app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`CivicTrack server running at http://localhost:${PORT}`);
});

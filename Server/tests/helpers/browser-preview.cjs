// Local review only: real Express/bcrypt/JWT with isolated, disposable database fixtures.
// Do not use this process as a production server.
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
require('./database.cjs').install();
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const preview = express();
preview.use('/City-Of-Joburg-CivicTracker', express.static(path.join(__dirname, '../../../docs')));
preview.use(require('../../app'));
preview.listen(4176, '127.0.0.1', () => console.log('Isolated Express review preview at http://127.0.0.1:4176 (no SQL connection)'));

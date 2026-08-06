const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'db.json');

module.exports = { DATA_DIR, UPLOAD_DIR, DB_PATH };

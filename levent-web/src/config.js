const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const SITE_URL = (process.env.SITE_URL || 'https://www.levent.mx').replace(/\/$/, '');
const MARCA = process.env.MARCA || 'Levent';

module.exports = { DATA_DIR, UPLOAD_DIR, SITE_URL, MARCA };

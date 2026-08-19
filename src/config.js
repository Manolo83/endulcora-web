const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const SITE_URL = (process.env.SITE_URL || 'https://www.endulcora.com').replace(/\/$/, '');

const META_PIXEL_ID = process.env.META_PIXEL_ID || '';
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN || '';
const META_CAPI_TEST_CODE = process.env.META_CAPI_TEST_CODE || '';

module.exports = { DATA_DIR, UPLOAD_DIR, SITE_URL, META_PIXEL_ID, META_CAPI_TOKEN, META_CAPI_TEST_CODE };

const express = require('express');
const store = require('../store');

const router = express.Router();

router.get('/announcements', (req, res) => {
  res.json(store.getAnnouncements(true));
});

router.get('/media', (req, res) => {
  res.json(store.getMedia());
});

module.exports = router;

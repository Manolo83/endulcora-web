const express = require('express');
const store = require('../store');

const router = express.Router();

router.get('/announcements', (req, res) => {
  res.json(store.getAnnouncements(true));
});

router.get('/media', (req, res) => {
  res.json(store.getMedia());
});

router.get('/content', (req, res) => {
  res.json(store.getContent());
});

router.get('/products', (req, res) => {
  res.json(store.getProducts());
});

router.get('/cursos', (req, res) => {
  res.json(store.getCursos());
});

router.get('/hero-carrusel', (req, res) => {
  res.json(store.getHeroCarrusel());
});

module.exports = router;

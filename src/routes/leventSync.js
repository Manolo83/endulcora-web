// Exporta los contactos de Endulcora para la base de datos general de
// Levent (la matriz), que junta contactos de todas las marcas del grupo
// para campanas de mercadotecnia compartidas. Protegido por su propio
// token (LEVENT_SYNC_KEY), igual que el panel de Google Ads tiene el suyo.
//
// Solo se manda lo que ya autoriza el aviso de privacidad: datos de
// contacto y senales de interes no sensibles. Nunca contrasenas, ni datos
// de facturacion o de pago.

const express = require('express');
const store = require('../store');

const router = express.Router();

function requiereClaveSync(req, res, next) {
  const clave = req.headers['x-levent-sync-key'];
  if (!process.env.LEVENT_SYNC_KEY) {
    return res.status(503).json({ error: 'La sincronizacion con Levent no esta configurada en este servidor.' });
  }
  if (clave !== process.env.LEVENT_SYNC_KEY) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  next();
}

router.get('/contactos', requiereClaveSync, (req, res) => {
  const usuarios = store.getUsers().filter((u) => u.email);
  const contactos = usuarios.map((u) => {
    const pedidos = store.getOrdersByUser(u.id, u.email).filter((o) => o.estado === 'pagado');
    const categorias = new Set();
    pedidos.forEach((o) => {
      (o.items || []).forEach((it) => {
        if (!it.itemId) return;
        const producto = store.getProduct(it.itemId);
        if (producto && producto.categoria) categorias.add(producto.categoria);
      });
    });
    return {
      email: u.email,
      telefono: u.telefono || '',
      nombre: u.nombre || '',
      membresiaActiva: u.membresiaEstado === 'activa',
      totalCompras: pedidos.length,
      categoriasInteres: [...categorias],
    };
  });
  res.json({ marca: 'endulcora', contactos });
});

module.exports = router;

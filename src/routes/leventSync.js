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
  const contactosUsuarios = usuarios.map((u) => {
    const pedidos = store.getOrdersByUser(u.id, u.email).filter((o) => o.estado === 'aprobado');
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

  // Inscripciones al formulario de talleres: solo se manda lo que sirve
  // para mercadotecnia (contacto, interes, como se entero). El anticipo, la
  // fecha, la sede y el horario son datos operativos de Endulcora y nunca
  // salen de aqui.
  const contactosTalleres = store
    .getInscripcionesTaller()
    .filter((i) => i.correo)
    .map((i) => ({
      email: i.correo,
      telefono: i.whatsapp || '',
      nombre: i.nombre || '',
      categoriasInteres: [i.preferencias, `taller:${i.taller}`].filter(Boolean),
      comoSeEntero: i.comoSeEntero || '',
      esPrimeraVez: i.esPrimeraVez,
      aceptaPromociones: i.aceptaPromociones,
    }));

  // Registros del QR de captura (StreamYard, multistream): la marca que
  // marcaron como de interes se manda como etiqueta, para que Levent y las
  // demas marcas del grupo sepan a quien contactar.
  const contactosQr = store
    .getRegistrosQr()
    .filter((r) => r.correo)
    .map((r) => ({
      email: r.correo,
      telefono: r.whatsapp || '',
      nombre: r.nombre || '',
      categoriasInteres: [r.marcaInteres ? `interes:${r.marcaInteres}` : '', 'origen:qr-en-vivo'].filter(Boolean),
      aceptaPromociones: r.aceptaPromociones,
    }));

  // Suscriptores del correo (lead magnet del footer): el solo hecho de
  // suscribirse ya es el consentimiento para recibir campañas.
  const contactosSubscribers = store
    .getSubscribers()
    .filter((s) => s.email)
    .map((s) => ({
      email: s.email,
      telefono: '',
      nombre: '',
      categoriasInteres: ['origen:newsletter'],
      aceptaPromociones: true,
    }));

  // Compras pagadas de quien hizo checkout sin crear cuenta (solo dejo su
  // correo al pagar): sin esto, un cliente real que compro como invitado no
  // aparecia en ningun lado. Se excluyen los correos que ya van en
  // contactosUsuarios para no mandarlos duplicados.
  const emailsConCuenta = new Set(usuarios.map((u) => u.email));
  const emailsYaIncluidos = new Set();
  const contactosPedidosInvitado = store
    .getOrders()
    .filter((o) => o.estado === 'aprobado' && o.email && !emailsConCuenta.has(o.email.toLowerCase()))
    .filter((o) => {
      const correo = o.email.toLowerCase();
      if (emailsYaIncluidos.has(correo)) return false;
      emailsYaIncluidos.add(correo);
      return true;
    })
    .map((o) => ({
      email: o.email.toLowerCase(),
      telefono: '',
      nombre: '',
      categoriasInteres: ['origen:compra-invitado'],
      totalCompras: 1,
    }));

  // Registros de la clase gratis en sala (p.ej. Pan de Muerto): el segmento
  // (si se marco al cierre del dia) se manda como etiqueta, para que las
  // demas marcas del grupo tambien puedan segmentar sus propios envios.
  const contactosClaseGratis = store
    .getRegistrosClaseGratis()
    .filter((r) => r.correo)
    .map((r) => ({
      email: r.correo,
      telefono: r.whatsapp || '',
      nombre: r.nombre || '',
      categoriasInteres: [
        'origen:clase-gratis-pan-de-muerto',
        ...r.interesTemas.map((t) => `interes:${t}`),
        r.segmento ? `segmento:${r.segmento}` : '',
      ].filter(Boolean),
      esPrimeraVez: !r.yaTomoTaller,
    }));

  res.json({ marca: 'endulcora', contactos: [...contactosUsuarios, ...contactosTalleres, ...contactosQr, ...contactosSubscribers, ...contactosPedidosInvitado, ...contactosClaseGratis] });
});

module.exports = router;

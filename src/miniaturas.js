const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ANCHOS = [240, 480, 800, 1200];

module.exports = function miniaturas(UPLOAD_DIR) {
  const dirMini = path.join(UPLOAD_DIR, '_mini');
  return async (req, res, next) => {
    const w = parseInt(req.query.w, 10);
    if (!ANCHOS.includes(w)) return next();
    const archivo = path.basename(req.params.archivo);
    if (!/\.(jpe?g|png|webp)$/i.test(archivo)) return next();
    const origen = path.join(UPLOAD_DIR, archivo);
    const destino = path.join(dirMini, `${w}-${archivo.replace(/\.\w+$/, '')}.webp`);
    try {
      if (!fs.existsSync(destino)) {
        if (!fs.existsSync(origen)) return next();
        fs.mkdirSync(dirMini, { recursive: true });
        const tmp = `${destino}.${process.pid}${Math.random().toString(36).slice(2)}.tmp`;
        await sharp(origen).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(tmp);
        fs.renameSync(tmp, destino);
      }
      res.set('Cache-Control', 'public, max-age=2592000');
      res.type('image/webp');
      return res.sendFile(destino);
    } catch (e) {
      console.error('[miniaturas] No se pudo generar', archivo, e.message);
      return next();
    }
  };
};

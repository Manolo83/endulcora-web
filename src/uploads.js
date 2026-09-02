const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const { UPLOAD_DIR } = require('./config');

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

// Multer compartido para cualquier foto que suba un cliente (o el admin):
// perfil, reseñas, comentarios de comunidad, galería.
const uploadImage = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB, suficiente para fotos de celular
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido. Usa JPG, PNG, WEBP o GIF.'));
  },
});

// Igual, pero acepta tambien video (para publicaciones de comunidad: foto O
// video + descripcion, como una publicacion de red social).
const uploadMedia = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB, de sobra para un video corto de celular
  fileFilter: (req, file, cb) => {
    if ([...ALLOWED_IMAGE, ...ALLOWED_VIDEO].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido. Usa JPG, PNG, WEBP, GIF, MP4, WEBM o MOV.'));
  },
});

// Las fotos subidas desde el celular suelen venir a resolucion de camara
// (varios MB, 4000px+). Eso hace que muchos celulares no puedan decodificarlas
// (se ven como "imagen rota"), aunque en computadora carguen bien. Aqui se
// redimensionan y comprimen antes de guardarlas, para que se vean bien en
// cualquier dispositivo y carguen mas rapido.
const IMAGEN_LADO_MAXIMO = 2000;
async function procesarImagenSubida(req, res, next) {
  if (!req.file || !ALLOWED_IMAGE.includes(req.file.mimetype) || req.file.mimetype === 'image/gif') {
    return next();
  }
  try {
    const ruta = req.file.path;
    const metadata = await sharp(ruta).metadata();
    let imagen = sharp(ruta)
      .rotate() // aplica la orientacion EXIF de la camara y la deja fija en los pixeles
      .resize({ width: IMAGEN_LADO_MAXIMO, height: IMAGEN_LADO_MAXIMO, fit: 'inside', withoutEnlargement: true });
    if (metadata.format === 'png') imagen = imagen.png({ quality: 82, compressionLevel: 8 });
    else if (metadata.format === 'webp') imagen = imagen.webp({ quality: 82 });
    else imagen = imagen.jpeg({ quality: 82, mozjpeg: true });

    const buffer = await imagen.toBuffer();
    fs.writeFileSync(ruta, buffer);
    req.file.size = buffer.length;
  } catch (e) {
    console.error('No se pudo redimensionar la imagen subida, se guarda tal cual:', e.message);
  }
  next();
}

function borrarSiEsSubida(url) {
  if (typeof url === 'string' && url.startsWith('/uploads/')) {
    fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
  }
}

module.exports = { ALLOWED_IMAGE, ALLOWED_VIDEO, uploadImage, uploadMedia, procesarImagenSubida, borrarSiEsSubida };

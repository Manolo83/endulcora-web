// Carga inicial de los talleres de agosto-septiembre 2026.
//
// Es el documento "COPYS DE VENTA · MAESTRO" del equipo de ventas, tal cual,
// con tres cambios: el bloque de fechas se volvio {{FECHAS}} (para que el bot
// anuncie las del calendario y nunca una ya pasada), y el precio y el anticipo
// se volvieron marcadores para poder cambiarlos en un solo lugar.
//
// Despues de importar, la fuente de verdad es /admin > Bot de ventas. Volver a
// importar solo agrega lo que falte; no pisa lo que ya hayas editado ahi.

const NATIVITAS = 'Nativitas';
const DIVISION = 'División del Norte';

const DIR_NATIVITAS =
  '*Sucursal Nativitas:* Calle Antonio Rodríguez No. 34, Col. San Simón Ticumac, CDMX — a 3 cuadras del Metro Portales o Nativitas.';
const DIR_DIVISION =
  '*Sucursal División del Norte:* Av. División del Nte. 3651, Plaza Real de Coyoacán Local 7, San Pablo Tepetlapa, Coyoacán — entre Nezahualpilli y Registro Federal del Tren Ligero.';
const DIR_AMBAS =
  '*Nativitas:* Calle Antonio Rodríguez No. 34, Col. San Simón Ticumac, CDMX — a 3 cuadras del Metro Portales o Nativitas.\n*División del Norte:* Av. División del Nte. 3651, Plaza Real de Coyoacán Local 7, Coyoacán — entre Nezahualpilli y Registro Federal del Tren Ligero.';

const INCLUYE_BASE = `🎁 *INCLUYE*
✔ Todos los ingredientes
✔ Préstamo de utensilios
✔ Recetario digital
✔ Coffee Break
✔ Material de apoyo durante la clase`;

// Cola comun de todos los copys: duración, precio, lo que incluye, ubicación y
// la llamada a la palabra clave.
function cierre({ incluye, direccion, clave, remate }) {
  return `⏳ Duración: *4 horas*

💰 *INVERSIÓN: \${{PRECIO_REGULAR}} MXN*
🔒 Reserva con solo *\${{ANTICIPO_REGULAR}} MXN* y asegura tu lugar.

${incluye}

📍 *UBICACIÓN*
${direccion}

📲 Escribe la palabra *${clave}* al WhatsApp *5665271901*

${remate}`;
}

const TALLERES = [
  {
    nombre: 'Alitas y Salsas',
    palabraClave: 'ALITAS',
    copy: `🍗🔥 *TALLER PRESENCIAL: ALITAS Y SALSAS*
_El negocio de fin de semana más rentable que existe_

😍 Las alitas se venden solas. El problema es que casi nadie logra la costra crujiente que aguanta la salsa sin ablandarse.

👩‍🍳 En este taller 100% práctico aprenderás la técnica de cocción que da ese crujido, y a preparar las salsas desde cero en lugar de comprarlas hechas.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🔥 *Alitas Crujientes*
El secado, el empanizado y el punto exacto de fritura.

🍯 *Salsa BBQ y Salsa Búfalo*
Las dos clásicas que nunca fallan, desde cero.

🥭 *Salsa Mango Habanero*
Dulzor, acidez y picor en equilibrio.

🥗 *Aderezos de Acompañamiento*
Ranch y queso azul con la textura correcta.

💡 *ADEMÁS APRENDERÁS:*
✔ Por qué la alita se seca antes de freírse
✔ Temperatura y tiempo exactos de cocción
✔ Cómo glasear sin ablandar la costra
✔ Boneless: corte, empanizado y fritura
✔ Conservación y recalentado
✔ Costeo por orden y precio de venta

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes sin experiencia previa
🍗 Quienes venden los fines de semana
🍽️ Cocinas económicas y loncherías
🎉 Negocios de eventos deportivos
💰 Emprendedores gastronómicos

📅 *FECHAS DISPONIBLES*
{{FECHAS}}

${cierre({
  incluye: `${INCLUYE_BASE}\n✔ ¡Te llevas tus preparaciones listas!`,
  direccion: DIR_DIVISION,
  clave: 'ALITAS',
  remate: '🔥 _Rinden mucho, se venden caras y generan clientes que regresan cada semana._ ¡Cupos limitados!',
})}`,
    sesiones: [
      { sede: DIVISION, fecha: '2026-08-13', horario: '10:00 AM' },
      { sede: DIVISION, fecha: '2026-08-15', horario: '10:00 AM' },
    ],
  },

  {
    nombre: 'Repostería para Diabéticos',
    palabraClave: 'DIABETICOS',
    // El equipo marca este taller: es tecnica de reposteria, no nutricion.
    aviso: 'Es un taller de técnica de repostería, no de nutrición ni tratamiento médico. No prometas control de glucosa ni que sea apto para toda persona con diabetes. Si preguntan por su caso, que consulten a su médico.',
    copy: `🍰✨ *TALLER PRESENCIAL: REPOSTERÍA PARA DIABÉTICOS*
_Postres sin azúcar añadida, con sabor de verdad_

😍 Hay un mercado enorme que casi nadie atiende: personas que quieren postre y no lo encuentran.

👩‍🍳 En este taller 100% práctico dominarás los sustitutos de azúcar, cómo se comportan en el horno y cómo compensar la textura.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🍫 *Cheesecake sin Azúcar Añadida*
Cremoso, firme y con base crujiente.

🧁 *Panqué y Muffins*
Miga húmeda, sin el regusto amargo de los sustitutos.

🥄 *Postre en Vaso*
Presentación de cafetería, listo para vender por pieza.

💡 *ADEMÁS APRENDERÁS:*
✔ Diferencias entre stevia, eritritol y otros sustitutos
✔ Cómo se comporta cada uno con el calor
✔ Por qué el azúcar da textura y con qué se reemplaza
✔ Cómo evitar el regusto amargo
✔ Conservación y etiquetado
✔ Costeo y precio de venta

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes y amantes de la repostería
☕ Cafeterías que buscan diversificar
🍽️ Restaurantes con clientela que lo pide
💰 Emprendedores en un nicho poco atendido
🎁 Quienes cocinan para alguien de la familia

📅 *FECHAS DISPONIBLES*
{{FECHAS}}

${cierre({
  incluye: `${INCLUYE_BASE}\n✔ ¡Te llevas tus preparaciones listas!`,
  direccion: DIR_DIVISION,
  clave: 'DIABETICOS',
  remate: '🔥 _Un nicho con demanda constante y muy poca competencia._ ¡Cupos limitados!',
})}`,
    sesiones: [
      { sede: DIVISION, fecha: '2026-08-14', horario: '10:00 AM' },
      { sede: DIVISION, fecha: '2026-08-16', horario: '10:00 AM' },
    ],
  },

  {
    nombre: 'Coctelería Básica',
    palabraClave: 'COCTELES',
    aviso: 'Solo para mayores de 18 años.',
    copy: `🍸✨ *TALLER PRESENCIAL: COCTELERÍA BÁSICA*
_Técnica de bar desde cero_

😍 Preparar un buen coctel no es cuestión de receta, es cuestión de técnica. Aprende las tres formas de mezclar y por qué cada trago pide una distinta.

👩‍🍳 Taller 100% práctico con coctelera, cristalería y hielo real.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🍸 *Clásicos Agitados*
Margarita, daiquiri y sour.

🥃 *Clásicos Refrescados*
Martini y old fashioned, con dilución controlada.

🍹 *Construidos en el Vaso*
Mojito, paloma y cuba.

🧂 *Escarchados y Guarniciones*
Sal, azúcar, chile y cítricos.

💡 *ADEMÁS APRENDERÁS:*
✔ Las tres técnicas de mezcla y cuándo usar cada una
✔ Por qué la dilución del hielo es parte de la receta
✔ Preparación de jarabe natural y mezclas base
✔ Cristalería correcta para cada trago
✔ Montaje y presentación de barra
✔ Costeo por trago y armado de carta

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes sin experiencia previa
🍸 Bares, cantinas y cafeterías
🍽️ Restaurantes que quieren carta de bebidas
🎉 Organizadores de eventos
💰 Emprendedores gastronómicos

📅 *FECHAS DISPONIBLES*
{{FECHAS}}

${cierre({
  incluye: `🎁 *INCLUYE*
✔ Todos los ingredientes
✔ Préstamo de utensilios y cristalería
✔ Recetario digital
✔ Coffee Break
✔ Material de apoyo durante la clase
✔ Degustación de las preparaciones`,
  direccion: DIR_NATIVITAS,
  clave: 'COCTELES',
  remate: '🍸 _Solo para mayores de 18 años._ ¡Cupos limitados!',
})}`,
    sesiones: [
      { sede: NATIVITAS, fecha: '2026-08-15', horario: '10:00 AM' },
      { sede: NATIVITAS, fecha: '2026-08-22', horario: '10:00 AM' },
    ],
  },

  {
    nombre: 'Tacos de Canasta',
    palabraClave: 'CANASTA',
    copy: `🌮✨ *TALLER PRESENCIAL: TACOS DE CANASTA*
_El negocio de menor inversión y mayor rotación_

😍 Una canasta, unos guisos sencillos y un punto de venta. Es de los negocios de comida que menos capital requiere y más rápido recupera la inversión.

👩‍🍳 En este taller 100% práctico aprenderás los guisos tradicionales, el armado correcto y el secreto del vaporizado.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🥔 *Papa con Chorizo*
El guiso más vendido, con el punto de sazón y humedad correcto.

🫘 *Frijoles Refritos*
Cremosos, sin humedecer la tortilla de más.

🐖 *Chicharrón Prensado*
Suave, bien sazonado y con la textura tradicional.

🌶️ *Adobo y Salsa de Aceite*
El baño rojo que da color, sabor y conserva el calor.

💡 *ADEMÁS APRENDERÁS:*
✔ Preparación y calentado correcto de la tortilla
✔ Armado y doblado para que no se rompa
✔ La técnica del vaporizado en canasta
✔ Cuánto tiempo aguantan calientes y por qué
✔ Rendimiento por kilo y porciones
✔ Costeo por taco y precio de venta

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes sin experiencia previa
🌮 Quienes quieren emprender con poca inversión
🍽️ Cocinas económicas
🎉 Quienes venden en oficinas o mercados
💰 Emprendedores gastronómicos

📅 *FECHA DISPONIBLE*
{{FECHAS}}

${cierre({
  incluye: `${INCLUYE_BASE}\n✔ ¡Te llevas tus preparaciones listas!`,
  direccion: DIR_NATIVITAS,
  clave: 'CANASTA',
  remate: '🔥 _Poca inversión, alta rotación y clientes que vuelven todos los días._ ¡Cupos limitados!',
})}`,
    sesiones: [{ sede: NATIVITAS, fecha: '2026-08-16', horario: '10:00 AM' }],
  },

  {
    nombre: 'Panadería Mexicana',
    palabraClave: 'PANADERIA',
    copy: `🥐🇲🇽 *TALLER PRESENCIAL: PANADERÍA MEXICANA*
_El pan dulce clásico, desde cero_

😍 Chinos, mantecadas, rebanadas y garibaldis. Los panes que todos reconocen y que se venden todos los días del año.

👩‍🍳 En este taller 100% práctico dominarás masa, batido y horneado con ese sabor casero que la gente busca.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🍞 *Chinos*
Suaves, esponjosos y con su costra de azúcar.

🧁 *Mantecadas*
Clásicas, aireadas y de venta segura.

🍰 *Rebanadas Cubiertas*
Dulces, vistosas y listas para vitrina.

🍥 *Garibaldis*
Esponjosos, con mermelada y cubierta de chochitos.

💡 *ADEMÁS APRENDERÁS:*
✔ Manejo correcto de masa y batidos
✔ Técnicas de horneado y control de temperatura
✔ Textura, volumen y sabor tradicional
✔ Conservación y empaque
✔ Rendimiento por tanda
✔ Costeo y estrategias de venta

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes y amantes del pan dulce
🥐 Panaderías y cafeterías
💰 Emprendedores que inician desde casa
🎁 Quienes venden por encargo
🍽️ Negocios que buscan producto de vitrina

📅 *FECHAS DISPONIBLES*
{{FECHAS}}

${cierre({
  incluye: `${INCLUYE_BASE}\n✔ ¡Te llevas tu pan listo para disfrutar o vender!`,
  direccion: DIR_NATIVITAS,
  clave: 'PANADERIA',
  remate: '🔥 _Aprende el sabor de México y conviértelo en un negocio delicioso._ ¡Cupos limitados!',
})}`,
    sesiones: [
      { sede: NATIVITAS, fecha: '2026-08-19', horario: '10:00 AM' },
      { sede: NATIVITAS, fecha: '2026-08-22', horario: '10:00 AM' },
    ],
  },

  {
    nombre: 'Cocina Oaxaqueña',
    palabraClave: 'OAXACA',
    copy: `🌽✨ *TALLER PRESENCIAL: COCINA OAXAQUEÑA*
_Los secretos mejor guardados del sur_

😍 Trae a tu mesa el auténtico sabor de Oaxaca. Técnicas tradicionales, aromas ahumados y recetas emblemáticas.

👩‍🍳 En este taller 100% práctico elaborarás desde cero las bases, salsas y masas para lograr esa sazón que enamora.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🥘 *Mole Coloradito Tradicional*
El equilibrio entre chiles, especias y el toque artesanal.

🫓 *Tlayudas Callejeras Auténticas*
Base, asiento, frijoles sazonados, quesillo y armado.

📐 *Tetelas Rellenas Artesanales*
Manejo de la masa, doblado en triángulo y rellenos clásicos.

💡 *ADEMÁS APRENDERÁS:*
✔ Técnicas de tatemado y molienda tradicional
✔ Puntos exactos de cocción y sazón oaxaqueña
✔ Secretos de la masa de maíz y el quesillo
✔ Presentación, montajes y acompañamientos
✔ Conservación y manejo de insumos
✔ Costeo y tips para emprender con comida regional

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes y amantes de la cocina mexicana
🌮 Emprendedores gastronómicos
☕ Cafeterías y banquetes
🍽️ Restaurantes que buscan diversificar su menú
🎉 Aficionados a la gastronomía tradicional

📅 *FECHAS DISPONIBLES*
{{FECHAS}}

${cierre({
  incluye: `${INCLUYE_BASE}\n✔ ¡Te llevas tus preparaciones listas!`,
  direccion: DIR_NATIVITAS,
  clave: 'OAXACA',
  remate: '🔥 _Dominar la cocina oaxaqueña es llevar tu sazón a otro nivel._ ¡Cupos limitados!',
})}`,
    sesiones: [
      { sede: NATIVITAS, fecha: '2026-08-21', horario: '10:00 AM' },
      { sede: NATIVITAS, fecha: '2026-08-23', horario: '10:00 AM' },
    ],
  },

  {
    nombre: 'Postres con Nogada',
    palabraClave: 'POSTRES',
    copy: `🌰✨ *TALLER PRESENCIAL: POSTRES CON NOGADA*
_La temporada llevada a la repostería_

😍 Todos venden chiles en nogada. *Nadie vende postres de nogada.* Ofrece lo que nadie más tiene en su carta.

👩‍🍳 En este taller 100% práctico dominarás la nogada base y su estabilización para repostería, con acabados de restaurante.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🍰 *Panqué de Nogada*
Miga húmeda, nuez tostada y cubierta cremosa.

🥄 *Panna Cotta de Nogada*
Textura sedosa, granada fresca y montaje profesional.

🧁 *Cheesecake de Nogada*
El clásico llevado a temporada patria.

💡 *ADEMÁS APRENDERÁS:*
✔ Técnica de nogada base y cómo estabilizarla para postre
✔ Manejo de nuez de Castilla: pelado, remojo y punto exacto
✔ Balance entre dulzor, cremosidad y acidez
✔ Montaje y presentación para venta
✔ Conservación y cadena de frío
✔ Costeo y precio sugerido para temporada

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes y amantes de la repostería
🍰 Reposteros que quieren diferenciarse
☕ Cafeterías y banquetes
🍽️ Restaurantes que buscan postre de temporada
💰 Emprendedores gastronómicos

📅 *FECHAS DISPONIBLES*
{{FECHAS}}

${cierre({
  incluye: `${INCLUYE_BASE}\n✔ ¡Te llevas tus preparaciones listas!`,
  direccion: DIR_AMBAS,
  clave: 'POSTRES',
  remate: '🔥 _Mientras todos pelean por el mismo chile relleno, tú puedes tener la carta de postres que nadie tiene._ ¡Cupos limitados!',
})}`,
    sesiones: [
      { sede: NATIVITAS, fecha: '2026-08-26', horario: '10:00 AM' },
      { sede: DIVISION, fecha: '2026-09-02', horario: '10:00 AM' },
    ],
  },

  {
    nombre: 'Bolillo, Telera y Pambazo',
    palabraClave: 'BOLILLO',
    copy: `🥖✨ *TALLER PRESENCIAL: BOLILLO, TELERA Y PAMBAZO*
_Los tres panes que sostienen la comida mexicana_

😍 Sin bolillo no hay torta. Sin telera no hay guajolota. Sin pambazo no hay antojito. Y casi nadie los hace bien en casa.

👩‍🍳 En este taller 100% práctico dominarás una sola masa base y las tres técnicas de formado que la convierten en tres panes distintos.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🥖 *Bolillo*
Corteza crujiente, greñado abierto y miga blanca y ligera.

🍞 *Telera*
Las dos marcas profundas que la distinguen y su miga más suave.

🔴 *Pambazo*
La masa correcta para que aguante el baño de guajillo.

💡 *ADEMÁS APRENDERÁS:*
✔ Masa base salada: hidratación y amasado
✔ Fermentación: tiempos, temperatura y punto exacto
✔ Formado y boleado de cada pieza
✔ Greñado y marcado correcto
✔ Horneado con vapor para lograr la corteza
✔ Conservación, congelado y costeo por pieza

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes sin experiencia previa
🥖 Panaderías y cafeterías
🍽️ Torterías y cocinas económicas
💰 Emprendedores que quieren producir su propio pan
🎉 Quienes venden desayunos y antojitos

📅 *FECHAS DISPONIBLES*
{{FECHAS}}

${cierre({
  incluye: `${INCLUYE_BASE}\n✔ ¡Te llevas tus preparaciones listas!`,
  direccion: DIR_NATIVITAS,
  clave: 'BOLILLO',
  remate: '🔥 _Quien hace su propio pan deja de depender del proveedor y gana el margen completo._ ¡Cupos limitados!',
})}`,
    sesiones: [
      { sede: NATIVITAS, fecha: '2026-08-26', horario: '10:00 AM' },
      { sede: NATIVITAS, fecha: '2026-08-29', horario: '10:00 AM' },
    ],
  },

  {
    // Agosto y septiembre son el mismo taller: se carga una vez con todas sus
    // fechas, y el calendario decide cual anunciar.
    nombre: 'Chile en Nogada',
    palabraClave: 'NOGADA',
    copy: `🌶️✨ *TALLER PRESENCIAL: CHILE EN NOGADA*
_Tradición, técnica y elegancia mexicana_

😍 Aprende a preparar uno de los platillos más emblemáticos y buscados de la gastronomía mexicana.

👩‍🍳 En este taller 100% práctico elaborarás desde cero el picadillo, la nogada y el montaje, con la técnica que separa un chile correcto de uno memorable.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🥩 *Picadillo Tradicional*
Carne con frutas de temporada y especias en balance exacto.

🌰 *Nogada Casera de Nuez de Castilla*
Cremosa, blanca y sin atajos. Se muele en frío, nunca se cocina.

🔥 *Capeado Esponjoso* _(opcional)_
Ligero, crujiente y sin exceso de grasa.

🍽️ *Montaje y Presentación*
Equilibrio de color, sabor y temperatura al servir.

💡 *ADEMÁS APRENDERÁS:*
✔ Cómo pelar nuez de Castilla sin amargor
✔ Punto exacto del picadillo: ni seco ni aguado
✔ Técnicas tradicionales de cocina mexicana
✔ Secretos del capeado y cuándo conviene usarlo
✔ Montaje elegante y presentación profesional
✔ Costeo y tips de venta para temporada

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes y amantes de la cocina mexicana
🌮 Emprendedores gastronómicos
🍽️ Restaurantes que buscan menú de temporada
☕ Cafeterías y banquetes
💰 Quienes quieren aprovechar la temporada más rentable del año

📅 *FECHAS DISPONIBLES*
{{FECHAS}}

${cierre({
  incluye: `${INCLUYE_BASE}\n✔ ¡Te llevas tus preparaciones listas!`,
  direccion: DIR_AMBAS,
  clave: 'NOGADA',
  remate: '🔥 _Es el platillo más buscado del año. Quien lo domina, vende._ ¡Cupos limitados!',
})}`,
    sesiones: [
      { sede: NATIVITAS, fecha: '2026-08-27', horario: '10:00 AM' },
      { sede: NATIVITAS, fecha: '2026-08-29', horario: '10:00 AM' },
      { sede: DIVISION, fecha: '2026-08-28', horario: '10:00 AM' },
      { sede: DIVISION, fecha: '2026-08-30', horario: '10:00 AM' },
      { sede: DIVISION, fecha: '2026-09-03', horario: '10:00 AM' },
      { sede: NATIVITAS, fecha: '2026-09-04', horario: '10:00 AM' },
      { sede: DIVISION, fecha: '2026-09-05', horario: '10:00 AM' },
      { sede: NATIVITAS, fecha: '2026-09-06', horario: '10:00 AM' },
    ],
  },

  {
    nombre: 'Coctelería de Barrio',
    palabraClave: 'BARRIO',
    aviso: 'Solo para mayores de 18 años. Es el único taller nocturno: 6:00 PM.',
    copy: `🍹🌙 *TALLER NOCTURNO: COCTELERÍA DE BARRIO*
_Sabor popular con técnica profesional_

😍 ¿Te imaginas preparar los tragos más pedidos de la calle, pero con presentación y técnica de bar profesional? Once bebidas que se venden solas.

👩‍🍳 Taller nocturno 100% práctico, con ambientación tipo bar. Aprendes desde cero.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*
🍃 *Mojito de frutos de temporada*
🌊 *Submarinos* — cuatro versiones
🍺 *Michelada clásica*
🌶️ *Michelada cubana*
💙 *Azulito*
🌵 *Pulque de sabores*
🍹 *Aguas Locas "Finas"*
🛢️ *Veneno (Petróleo)* — desde cero
🍅 *Clamatos preparados*
🍅 *Bloody Mary*
❓ *Cocteles sorpresa*

💡 *ADEMÁS APRENDERÁS:*
✔ Técnicas básicas de coctelería
✔ Combinación correcta de sabores
✔ Manejo de hielo, dilución y mezclas
✔ Decoración y presentación profesional
✔ Ambientación nocturna tipo bar
✔ Costeo por trago y tips para vender

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes sin experiencia previa
🍻 Barras móviles y eventos
🎉 Fiestas y reuniones
🍽️ Bares y cantinas de barrio
💰 Emprendedores que quieren un concepto rentable

📅 *FECHA ÚNICA*
{{FECHAS}}

${cierre({
  incluye: `🎁 *INCLUYE*
✔ Todos los insumos y bebidas
✔ Préstamo de utensilios y cristalería
✔ Recetario digital
✔ Coffee Break
✔ Degustación completa
✔ ¡Te llevas técnicas, recetas y tips para emprender!`,
  direccion: DIR_DIVISION,
  clave: 'BARRIO',
  remate: '🌙 _Las bebidas más populares de la calle, con presentación de bar profesional._ Solo para mayores de 18 años. ¡Cupos limitados!',
})}`,
    sesiones: [{ sede: DIVISION, fecha: '2026-08-29', horario: '6:00 PM' }],
  },

  {
    nombre: 'Barbacoa',
    palabraClave: 'BARBACOA',
    copy: `🐑🔥 *TALLER PRESENCIAL: BARBACOA TRADICIONAL*
_Sabor mexicano auténtico y negocio rentable_

😍 Barbacoa jugosa, suave y deshebrada como la de domingo. Uno de los platillos más vendidos y queridos de México.

👩‍🍳 En este taller 100% práctico dominarás desde el adobo hasta el armado de tacos y el consomé.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🥩 *Barbacoa de Res Tradicional*
Carne suave, jugosa y deshebrada al punto.

🌶️ *Adobo Especial*
La mezcla de chiles y especias que da la profundidad.

🍲 *Consomé de Barbacoa*
Con garbanzo, arroz y todo el jugo de la cocción.

🌮 *Tacos de Barbacoa*
Armado perfecto para venta o para consumo en casa.

🍺 *Salsa Borracha*
Con pulque, intensa y tradicional.

🟢 *Salsa Verde*
Fresca, picosita y de acompañamiento clásico.

💡 *ADEMÁS APRENDERÁS:*
✔ Técnicas de marinado y adobo tradicional
✔ Uso de hojas de plátano y sellado correcto
✔ Cocción perfecta para carne suave y deshebrada
✔ Preparación de consomé con sabor profundo
✔ Porcionado y rendimiento por kilo
✔ Presentación, costeo y precio de venta

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes y amantes de la cocina mexicana
🌮 Taquerías y puestos de comida
💰 Emprendedores gastronómicos
🍽️ Cocinas económicas
🎉 Quienes venden los fines de semana

📅 *FECHA ÚNICA*
{{FECHAS}}

${cierre({
  incluye: `🎁 *INCLUYE*
✔ Todos los ingredientes
✔ Préstamo de utensilios
✔ Recetario digital paso a paso
✔ Coffee Break
✔ Material de apoyo durante la clase
✔ Degustación completa de barbacoa, consomé y tacos`,
  direccion: DIR_NATIVITAS,
  clave: 'BARBACOA',
  remate: '🔥 _Un platillo de domingo que se vende solo y deja margen de sobra._ ¡Cupos limitados!',
})}`,
    sesiones: [{ sede: NATIVITAS, fecha: '2026-08-30', horario: '10:00 AM' }],
  },

  {
    nombre: 'Panqués Gourmet',
    palabraClave: 'PANQUES',
    copy: `🫐✨ *TALLER PRESENCIAL: PANQUÉS GOURMET*
_El producto perfecto para emprender_

😍 Aguanta días, viaja bien y tiene margen alto. El panqué es el producto de entrada ideal para quien quiere empezar a vender repostería.

👩‍🍳 En este taller 100% práctico dominarás el método de cremado, el veteado del marmoleado y el crumble que se mantiene crujiente.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🫐 *Panqué de Nata y Blueberry*
Miga húmeda y fruta suspendida, nunca hundida.

🍫 *Panqué Marmoleado*
El veteado limpio, sin que los colores se mezclen.

🍎 *Panqué de Manzana con Crumble*
Cubierta crujiente que no se hunde ni se ablanda.

💡 *ADEMÁS APRENDERÁS:*
✔ Método de cremado y temperatura de la mantequilla
✔ El truco para que la fruta no se vaya al fondo
✔ Cómo lograr el veteado sin sobremezclar
✔ Crumble que aguanta días
✔ Empaque, etiquetado y conservación
✔ Costeo y precio de venta por pieza

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes y amantes de la repostería
☕ Cafeterías y panaderías
💰 Emprendedores que inician desde casa
🎁 Quienes venden por encargo
🍽️ Negocios que buscan producto de vitrina

📅 *FECHAS DISPONIBLES*
{{FECHAS}}

${cierre({
  incluye: `${INCLUYE_BASE}\n✔ ¡Te llevas tus preparaciones listas!`,
  direccion: DIR_NATIVITAS,
  clave: 'PANQUES',
  remate: '🔥 _Tres panqués, tres técnicas y un producto que se vende todo el año._ ¡Cupos limitados!',
})}`,
    sesiones: [
      { sede: NATIVITAS, fecha: '2026-09-02', horario: '10:00 AM' },
      { sede: NATIVITAS, fecha: '2026-09-05', horario: '10:00 AM' },
    ],
  },

  {
    nombre: 'Velas Comestibles',
    palabraClave: 'VELAS',
    aviso: 'Las velas comestibles llevan fuego. No des certezas sobre alérgenos ni seguridad alimentaria: canaliza.',
    copy: `🕯️✨ *TALLER PRESENCIAL: VELAS COMESTIBLES*
_La tendencia gourmet más original_

😍 Sorprende a todos con un producto que parece una vela… y se come. La tendencia que usan restaurantes, cafeterías y banqueteros.

👩‍🍳 En este taller 100% práctico descubrirás las técnicas para lograr acabados elegantes, texturas cremosas y presentaciones que dejan a cualquiera con la boca abierta.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🧈 *Vela Base de Mantequilla*
Cremosa, suave y con una presentación espectacular.

🍫 *Vela Base de Chocolate*
Intensa, elegante y perfecta para acompañar postres.

🫐 *Vela de Frutos Rojos*
Delicado equilibrio entre dulzor y acidez.

💡 *ADEMÁS APRENDERÁS:*
✔ Técnica de mecha comestible y control de flama
✔ Elaboración profesional y estabilización de la grasa
✔ Presentación gourmet para restaurante y cafetería
✔ Decoración y montaje elegante
✔ Conservación, cadena de frío y manejo del producto
✔ Costeo real y estrategia de precio para emprender

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes y reposteros
☕ Cafeterías
🍽️ Restaurantes
🎉 Organizadores de eventos y banqueteros
💰 Emprendedores que buscan alto margen

📅 *FECHAS DISPONIBLES*
{{FECHAS}}

${cierre({
  incluye: `${INCLUYE_BASE}\n✔ ¡Te llevas tus preparaciones listas!`,
  direccion: DIR_AMBAS,
  clave: 'VELAS',
  remate: '🔥 _Una vela que cuesta veinte pesos producir puede venderse en doscientos._ ¡Cupos limitados!',
})}`,
    sesiones: [
      { sede: NATIVITAS, fecha: '2026-09-03', horario: '10:00 AM' },
      { sede: NATIVITAS, fecha: '2026-09-05', horario: '10:00 AM' },
      { sede: DIVISION, fecha: '2026-09-04', horario: '10:00 AM' },
      { sede: DIVISION, fecha: '2026-09-06', horario: '10:00 AM' },
    ],
  },

  {
    nombre: 'Pastelería Mexicana',
    palabraClave: 'PASTELES',
    copy: `🍰✨ *TALLER PRESENCIAL: PASTELERÍA MEXICANA*
_Los pasteles que se venden solos_

😍 Dos pasteles que nunca pasan de moda y que se piden en toda fiesta mexicana.

👩‍🍳 En este taller 100% práctico entenderás por qué el chocoflán se invierte solo en el horno y cómo controlar cada punto para que salga perfecto siempre.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🍫 *Chocoflán*
Las dos capas perfectamente definidas, con caramelo y desmoldado limpio.

🌽 *Pastel de Elote*
Miga húmeda, grano entero y dulzor equilibrado.

💡 *ADEMÁS APRENDERÁS:*
✔ Por qué se invierte el chocoflán y cómo controlarlo
✔ Baño maría correcto: temperatura y tiempo exactos
✔ Preparación de caramelo sin amargor
✔ Desmoldado sin fracturas
✔ Conservación y empaque para venta
✔ Costeo y precio de venta por rebanada

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes y amantes de la repostería
🎂 Reposteros que quieren ampliar su carta
☕ Cafeterías y loncherías
💰 Emprendedores gastronómicos
🎉 Quienes venden para fiestas y eventos

📅 *FECHAS DISPONIBLES*
{{FECHAS}}

${cierre({
  incluye: `${INCLUYE_BASE}\n✔ ¡Te llevas tus preparaciones listas!`,
  direccion: DIR_NATIVITAS,
  clave: 'PASTELES',
  remate: '🔥 _El chocoflán es el pastel más pedido en fiestas mexicanas y el de elote se vende todo el año._ ¡Cupos limitados!',
})}`,
    sesiones: [
      { sede: NATIVITAS, fecha: '2026-09-03', horario: '10:00 AM' },
      { sede: NATIVITAS, fecha: '2026-09-05', horario: '10:00 AM' },
    ],
  },

  {
    nombre: 'Antojitos Mexicanos',
    palabraClave: 'ANTOJITOS',
    copy: `🌮✨ *TALLER PRESENCIAL: ANTOJITOS MEXICANOS*
_La cena del 15 resuelta_

😍 Septiembre pide antojitos. Aprende a preparar los clásicos de la calle con la técnica correcta.

👩‍🍳 En este taller 100% práctico trabajarás la masa desde cero, los guisos tradicionales y las salsas que acompañan.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🫓 *Sopes y Gorditas*
Misma masa, dos técnicas de formado, pellizcado y cocción.

🍞 *Pambazos*
El bañado correcto en salsa de guajillo y el dorado en comal.

🍗 *Tinga de Pollo*
Deshebrado, sofrito y el punto de chipotle justo.

🥘 *Pata en Vinagre*
Preparación tradicional, curtido y sazón.

💡 *ADEMÁS APRENDERÁS:*
✔ Manejo de masa: hidratación, formado y pellizcado
✔ Por qué el pambazo se baña y no se fríe
✔ Salsas de acompañamiento roja y verde
✔ Frijoles sazonados para untar
✔ Montaje de mesa de antojitos
✔ Costeo por pieza y precio sugerido

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes y amantes de la cocina mexicana
🌮 Emprendedores gastronómicos
🎉 Quienes organizan la cena del 15
🍽️ Cocinas económicas y loncherías
💰 Quienes quieren vender durante toda la temporada

📅 *FECHAS DISPONIBLES*
{{FECHAS}}

${cierre({
  incluye: `${INCLUYE_BASE}\n✔ ¡Te llevas tus preparaciones listas!`,
  direccion: DIR_NATIVITAS,
  clave: 'ANTOJITOS',
  remate: '🔥 _La diferencia entre un pambazo de puesto y uno por el que hacen fila está en un solo detalle._ ¡Cupos limitados!',
})}`,
    sesiones: [
      { sede: NATIVITAS, fecha: '2026-09-04', horario: '10:00 AM' },
      { sede: NATIVITAS, fecha: '2026-09-06', horario: '10:00 AM' },
    ],
  },

  {
    nombre: 'Coctelería Mexicana',
    // Comparte la clave COCTELES con Cocteleria Basica a proposito: cuando las
    // dos esten vivas, el bot pregunta cual antes de mandar nada.
    palabraClave: 'COCTELES',
    aviso: 'Solo para mayores de 18 años.',
    copy: `🥃✨ *TALLER PRESENCIAL: COCTELERÍA MEXICANA*
_Diez clásicos con nuestros destilados_

😍 Tequila, mezcal y pulque en diez cocteles clásicos que puedes servir en tu negocio o preparar en cualquier reunión.

👩‍🍳 En este taller 100% práctico aprenderás el balance exacto entre destilado, cítrico y endulzante, además de los escarchados.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🍹 *Diez Cocteles Clásicos Mexicanos*
Margaritas, mezcalitas, palomas, cantaritos y más.

🧂 *Escarchados de Autor*
Sal, chile, chamoy y tajín con la técnica correcta.

🍋 *Balance y Dilución*
El secreto que casi nadie conoce: por qué se agita un coctel.

💡 *ADEMÁS APRENDERÁS:*
✔ Técnica de agitado, refrescado y dilución
✔ Diferencias entre tequila, mezcal y pulque
✔ Preparación de jarabes y mezclas base
✔ Montaje, cristalería y decoración
✔ Costeo por trago y armado de carta
✔ Servicio y presentación para negocio

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes sin experiencia previa
🍸 Bares y cantinas
🍽️ Restaurantes que quieren carta de bebidas
🎉 Organizadores de eventos
💰 Emprendedores gastronómicos

📅 *FECHA DISPONIBLE*
{{FECHAS}}

${cierre({
  incluye: `🎁 *INCLUYE*
✔ Todos los ingredientes
✔ Préstamo de utensilios y cristalería
✔ Recetario digital
✔ Coffee Break
✔ Material de apoyo durante la clase
✔ Degustación de las preparaciones`,
  direccion: DIR_DIVISION,
  clave: 'COCTELES',
  remate: '🍸 _Diez cocteles, una técnica y una carta lista para vender._ Solo para mayores de 18 años. ¡Cupos limitados!',
})}`,
    sesiones: [{ sede: DIVISION, fecha: '2026-09-05', horario: '10:00 AM' }],
  },

  {
    nombre: 'Birria',
    palabraClave: 'BIRRIA',
    copy: `🌮🔥 *TALLER PRESENCIAL: BIRRIA*
_Sabor tradicional y negocio rentable_

😍 Aprende a preparar la auténtica birria mexicana con todo su sabor, aroma y técnica tradicional. Uno de los platillos más rentables del país.

👩‍🍳 En este taller 100% práctico dominarás desde el adobo hasta el montaje de los platillos que hoy se venden en todo México.

👨‍🍳 *¿QUÉ APRENDERÁS A PREPARAR?*

🥩 *Birria Tradicional*
Adobo, cocción lenta y el sazón que la distingue.

🧀 *Quesabirria*
Tortilla dorada en la grasa del consomé, con queso fundido y costra perfecta.

🍜 *Birriamen*
La fusión moderna con caldo de birria y fideos estilo ramen.

💡 *ADEMÁS APRENDERÁS:*
✔ Adobo tradicional: chiles, proporciones y tostado correcto
✔ Técnicas de cocción para carne suave y jugosa
✔ Consomé con cuerpo y profundidad de sabor
✔ Armado y presentación de quesabirrias
✔ Por qué nunca se usa aceite en el comal
✔ Costeo, porciones y precio de venta para negocio

🎯 *IDEAL PARA:*
👩‍🍳 Principiantes y amantes de la cocina mexicana
🌮 Taquerías y puestos de comida
💰 Emprendedores gastronómicos
🍽️ Cocinas económicas
🎉 Quienes venden para eventos y fines de semana

📅 *FECHA DISPONIBLE*
{{FECHAS}}

${cierre({
  incluye: `🎁 *INCLUYE*
✔ Todos los ingredientes
✔ Préstamo de utensilios
✔ Recetario digital
✔ Coffee Break
✔ Material de apoyo durante la clase
✔ Degustación completa`,
  direccion: DIR_NATIVITAS,
  clave: 'BIRRIA',
  remate: '🔥 _Rinde mucho, se vende caro y genera fila. Un negocio completo en un solo taller._ ¡Cupos limitados!',
})}`,
    sesiones: [{ sede: NATIVITAS, fecha: '2026-09-06', horario: '10:00 AM' }],
  },
];

// Cupo de sala: no caben mas de 15 personas por taller.
const CUPO_MAXIMO = 15;
const PRECIO_REGULAR = 1149;
const PRECIO_PROMO = 800;

module.exports = { TALLERES, PRECIO_REGULAR, PRECIO_PROMO, CUPO_MAXIMO, NATIVITAS, DIVISION };

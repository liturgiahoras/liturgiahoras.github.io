AUDIO OFICIAL — cómo añadir una grabación real
================================================

Qué es esto
-----------
Un enchufe para sustituir la voz sintética (la que lee en voz alta con el
botón "Audio") por una grabación de voz real, en piezas que NO cambian de
un día a otro. Hoy esta carpeta está vacía a propósito: no se ha grabado
nada todavía. Esto es solo el mecanismo para poder añadir grabaciones sin
tocar una sola línea de código.

manifest.json
-------------
Un objeto sencillo: { "id-de-la-pieza": "nombre-del-archivo.mp3" }
Ejemplo, una vez grabada la antífona final de Completas:
  { "ant-fona-final-de-la-sant-sima-virgen": "salve-completas.mp3" }
El archivo de audio va suelto en esta misma carpeta (public/audio-oficial/).

Cómo se calcula el "id"
------------------------
Es el mismo id que ya usan los favoritos (★) y las grabaciones propias del
usuario: se toma el texto visible de la referencia de la pieza (lo que
aparece como título dentro del recuadro, la clase .psalm-ref) y se pasa por
Favs.idFor(): todo a minúsculas, y cualquier carácter que no sea a-z o 0-9
se convierte en un guión. Ojo: las tildes y la "ñ" NO son a-z, así que
también se convierten en guión — el resultado es un poco feo pero siempre
el mismo para el mismo texto. Ejemplos reales:
  "Antífona final de la Santísima Virgen"  ->  ant-fona-final-de-la-sant-sima-virgen
  "Salmo 62, 2-9"                          ->  salmo-62-2-9
  "Salve"                                  ->  salve

Manera más fácil de obtener el id exacto de cualquier pieza: abre esa
pantalla en la app, abre la consola del navegador (F12) y ejecuta:
  Favs.idFor(document.querySelector('.psalm-ref').textContent.trim())
(si hay varias piezas en la pantalla, usa querySelectorAll y elige la que
corresponda). Copia el resultado tal cual como clave en manifest.json.

Qué piezas están ya "enganchadas" (listas para recibir audio)
---------------------------------------------------------------
Cualquier cosa que la app dibuje dentro de un recuadro .psalm-block con su
.psalm-ref (lo mismo que hace hookable a un salmo para guardarlo como
favorito). Hoy eso incluye:
  - Los salmos, antífonas y cánticos (Benedictus, Magníficat, Nunc dimittis)
    de las siete horas. Su referencia (p. ej. "Salmo 62, 2-9") es la misma
    cada vez que ese salmo vuelve a tocar en el ciclo de cuatro semanas, así
    que grabarlo una vez sirve para siempre.
  - Las 16 "Oraciones" (Salve, Credo, Acto de contrición…), por su título.
  - El Ángelus y el Regina Caeli, por su título.
  - La antífona final de la Santísima Virgen, al cierre de Completas.

Qué NO está enganchado todavía
-------------------------------
  - Las lecturas (bíblica y patrística) de cada hora y de la Misa del día:
    se dibujan en un recuadro distinto (.reading-box), sin este gancho.
  - El Rosario y la Coronilla de la Divina Misericordia: esas pantallas ni
    siquiera tienen hoy botón de "leer en voz alta" (tienen su propio
    contador de cuentas/pasos); habría que construir eso primero.
  - El rezo en latín: tiene su propio sistema de voz aparte, no usa este
    mecanismo (y además está temporalmente fuera del menú).

Un aviso importante antes de grabar
-------------------------------------
El id se calcula solo con la REFERENCIA (p. ej. "Salmo 62, 2-9"), no con la
antífona. Un mismo salmo puede aparecer con una antífona distinta según el
tiempo litúrgico o la fiesta, aunque la referencia sea igual — si grabas
salmo + antífona juntos, esa grabación se reproducirá también los días en
que la antífona sea otra. Esto ya pasa igual con las grabaciones personales
del propio usuario; no es nuevo de este mecanismo. Lo más seguro para
empezar a grabar es lo verdaderamente fijo: las 16 Oraciones, el Ángelus/
Regina Caeli y la antífona final de Completas.

Orden de prioridad al reproducir
----------------------------------
1. Una grabación PERSONAL del propio usuario para esa pieza (si existe).
2. Una grabación OFICIAL de esta carpeta (si existe).
3. Voz sintética (la mejor voz disponible del dispositivo, ver Ajustes).
Si un archivo de esta carpeta falta o no se puede reproducir, la app cae
automáticamente a la voz sintética: nunca se queda en silencio.

/* ============================================================
   Biblia · Lector con canon católico completo (73 libros)
   - Estructura de libros y capítulos siempre disponible
   - El texto puede importarse (Biblia de Jerusalén, de la CEE
     u otra edición con licencia) mediante un archivo JSON
   - Búsqueda de texto dentro de lo importado
   ============================================================ */

const BOOKS = [
  { group: 'Pentateuco', books: [
    ['Gn', 'Génesis', 50], ['Éx', 'Éxodo', 40], ['Lv', 'Levítico', 27],
    ['Nm', 'Números', 36], ['Dt', 'Deuteronomio', 34]
  ]},
  { group: 'Libros históricos', books: [
    ['Jos', 'Josué', 24], ['Jue', 'Jueces', 21], ['Rt', 'Rut', 4],
    ['1S', '1 Samuel', 31], ['2S', '2 Samuel', 24], ['1R', '1 Reyes', 22],
    ['2R', '2 Reyes', 25], ['1Cr', '1 Crónicas', 29], ['2Cr', '2 Crónicas', 36],
    ['Esd', 'Esdras', 10], ['Neh', 'Nehemías', 13], ['Tob', 'Tobías', 14],
    ['Jdt', 'Judit', 16], ['Est', 'Ester', 10], ['1M', '1 Macabeos', 16],
    ['2M', '2 Macabeos', 15]
  ]},
  { group: 'Libros poéticos y sapienciales', books: [
    ['Job', 'Job', 42], ['Sal', 'Salmos', 150], ['Pr', 'Proverbios', 31],
    ['Qo', 'Eclesiastés (Qohélet)', 12], ['Ct', 'Cantar de los Cantares', 8],
    ['Sb', 'Sabiduría', 19], ['Eclo', 'Eclesiástico (Sirácida)', 51]
  ]},
  { group: 'Profetas', books: [
    ['Is', 'Isaías', 66], ['Jer', 'Jeremías', 52], ['Lam', 'Lamentaciones', 5],
    ['Bar', 'Baruc', 6], ['Ez', 'Ezequiel', 48], ['Dan', 'Daniel', 14],
    ['Os', 'Oseas', 14], ['Jl', 'Joel', 4], ['Am', 'Amós', 9],
    ['Abd', 'Abdías', 1], ['Jon', 'Jonás', 4], ['Miq', 'Miqueas', 7],
    ['Nah', 'Nahúm', 3], ['Hab', 'Habacuc', 3], ['Sof', 'Sofonías', 3],
    ['Ag', 'Ageo', 2], ['Zac', 'Zacarías', 14], ['Mal', 'Malaquías', 3]
  ]},
  { group: 'Evangelios y Hechos', books: [
    ['Mt', 'Evangelio según san Mateo', 28], ['Mc', 'Evangelio según san Marcos', 16],
    ['Lc', 'Evangelio según san Lucas', 24], ['Jn', 'Evangelio según san Juan', 21],
    ['Hch', 'Hechos de los Apóstoles', 28]
  ]},
  { group: 'Cartas de san Pablo', books: [
    ['Rom', 'Romanos', 16], ['1Co', '1 Corintios', 16], ['2Co', '2 Corintios', 13],
    ['Gál', 'Gálatas', 6], ['Ef', 'Efesios', 6], ['Flp', 'Filipenses', 4],
    ['Col', 'Colosenses', 4], ['1Ts', '1 Tesalonicenses', 5], ['2Ts', '2 Tesalonicenses', 3],
    ['1Tim', '1 Timoteo', 6], ['2Tim', '2 Timoteo', 4], ['Tit', 'Tito', 3],
    ['Flm', 'Filemón', 1], ['Heb', 'Hebreos', 13]
  ]},
  { group: 'Cartas católicas y Apocalipsis', books: [
    ['Stgo', 'Santiago', 5], ['1Pe', '1 Pedro', 5], ['2Pe', '2 Pedro', 3],
    ['1Jn', '1 Juan', 5], ['2Jn', '2 Juan', 1], ['3Jn', '3 Juan', 1],
    ['Jud', 'Judas', 1], ['Ap', 'Apocalipsis', 22]
  ]}
];

const Biblia = (() => {

  function flatBooks() {
    const all = [];
    for (const g of BOOKS) for (const b of g.books) all.push({ abbrev: b[0], name: b[1], chapters: b[2] });
    return all;
  }

  function findByAbbrev(abbrev) {
    return flatBooks().find((b) => b.abbrev.toLowerCase() === String(abbrev).toLowerCase());
  }

  function abbrevFromRef(ref) {
    const m = String(ref || '').match(/^([0-9]*\s?[A-Za-z]+)/);
    return m ? m[1].trim().replace(/\.$/, '') : '';
  }

  /* ------------------- Esquema de importación ------------------- */
  /* Formato aceptado (JSON):
     {
       "version": "Biblia de Jerusalén (texto con licencia)",
       "language": "es",
       "books": [
         { "abbrev": "Gn", "name": "Génesis",
           "chapters": [ ["En el principio creó...", "y la tierra era...", "..."], ... ] }
       ]
     }
  */
  function validateImport(obj) {
    if (!obj || !Array.isArray(obj.books)) return { ok: false, error: 'El archivo no tiene el formato esperado (falta "books").' };
    if (!obj.version) obj.version = 'Biblia importada';
    let total = 0;
    for (const b of obj.books) {
      if (!b.abbrev || !Array.isArray(b.chapters)) return { ok: false, error: 'Un libro no tiene "abbrev" o "chapters".' };
      for (const ch of b.chapters) {
        if (!Array.isArray(ch)) return { ok: false, error: 'Un capítulo no es una lista de versículos.' };
        total += ch.length;
      }
    }
    return { ok: true, books: obj.books.length, verses: total };
  }

  function importFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve({ ok: false, error: 'No se pudo leer el archivo.' });
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          const check = validateImport(obj);
          if (!check.ok) return resolve(check);
          // Normaliza: nombre si falta
          for (const b of obj.books) {
            if (!b.name) b.name = nameFor(b.abbrev) || b.abbrev;
          }
          const saved = Store.saveBible(obj);
          if (!saved.ok) return resolve(saved);
          resolve({ ok: true, books: check.books, verses: check.verses, version: obj.version });
        } catch (e) {
          resolve({ ok: false, error: 'El archivo no es JSON válido.' });
        }
      };
      reader.readAsText(file);
    });
  }

  function nameFor(abbrev) {
    const b = findByAbbrev(abbrev);
    return b ? b.name : null;
  }

  /* ------------------- Importar texto plano (sin JSON) -------------------
     Pensado para quien ya tiene el texto en un .txt corriente y no va a
     construir un JSON a mano. Convención esperada (tolerante, no exige
     exactitud): opcionalmente una línea con el nombre del libro, luego un
     capítulo por línea ("Cap. 1" o solo "1") y un versículo por línea
     empezando por su número ("1 En el principio creó Dios…"). Se pueden
     pegar varios libros seguidos si cada uno trae su nombre; si no, hay que
     indicar a mano a qué libro pertenece todo el texto. Los libros ya
     importados se sustituyen por su versión nueva; el resto se conserva. */
  function normalizaTxt(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
  }
  function matchBookLine(line) {
    const n = normalizaTxt(line).replace(/\.$/, '');
    if (!n || n.length > 60) return null;
    return flatBooks().find((b) => normalizaTxt(b.name) === n || b.abbrev.toLowerCase() === n);
  }
  function parseTextoPlano(texto, abbrevForzado) {
    const lines = String(texto || '').replace(/\r\n/g, '\n').split('\n');
    const books = [];
    let current = null, chapter = null, lastVerseIdx = -1;
    function startBook(meta) {
      current = { abbrev: meta.abbrev, name: meta.name, chapters: [] };
      books.push(current);
      chapter = null;
      lastVerseIdx = -1;
    }
    if (abbrevForzado) {
      const meta = findByAbbrev(abbrevForzado);
      if (!meta) return { ok: false, error: 'Libro no reconocido.' };
      startBook(meta);
    }
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const bookMeta = matchBookLine(line);
      if (bookMeta) { startBook(bookMeta); continue; }
      const isChapterMark = /^(?:cap[íi]tulo|cap\.?|chapter)\s*\d+\b/i.test(line) || /^\d+$/.test(line);
      if (isChapterMark) {
        if (!current) continue;
        chapter = [];
        current.chapters.push(chapter);
        lastVerseIdx = -1;
        continue;
      }
      if (!current) continue;
      if (!chapter) { chapter = []; current.chapters.push(chapter); }
      const verseMatch = line.match(/^(\d+)[.\-:)]?\s+(.*)$/);
      if (verseMatch) {
        chapter.push(verseMatch[2]);
        lastVerseIdx = chapter.length - 1;
      } else if (lastVerseIdx >= 0) {
        chapter[lastVerseIdx] += ' ' + line;
      }
    }
    const clean = books.filter((b) => b.chapters.some((c) => c.length));
    if (!clean.length) {
      return { ok: false, error: 'No se ha reconocido ningún capítulo o versículo. Revisa el formato: un capítulo por línea ("Cap. 1") y un versículo por línea empezando por su número.' };
    }
    return { ok: true, books: clean };
  }
  function mergeBooks(existing, newBooks) {
    const books = existing && Array.isArray(existing.books) ? existing.books.slice() : [];
    for (const nb of newBooks) {
      const i = books.findIndex((b) => b.abbrev.toLowerCase() === nb.abbrev.toLowerCase());
      if (i !== -1) books[i] = nb; else books.push(nb);
    }
    return books;
  }
  function importTexto(texto, abbrevForzado) {
    const r = parseTextoPlano(texto, abbrevForzado);
    if (!r.ok) return r;
    const existing = Store.getBible();
    const merged = { version: (existing && existing.version) || 'Texto importado', books: mergeBooks(existing, r.books) };
    const saved = Store.saveBible(merged);
    if (!saved.ok) return saved;
    const verses = r.books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.length, 0), 0);
    return { ok: true, books: r.books.length, verses, names: r.books.map((b) => b.name) };
  }

  function chapter(abbrev, n) {
    const bible = Store.getBible();
    if (!bible) return null;
    const b = bible.books.find((x) => x.abbrev.toLowerCase() === abbrev.toLowerCase());
    if (!b || !b.chapters[n - 1]) return null;
    return b.chapters[n - 1];
  }

  function hasText() {
    const bible = Store.getBible();
    return !!(bible && bible.books && bible.books.length);
  }

  /* Búsqueda: recorre todos los versículos (puede ser lenta en textos grandes;
     se hace una única vez por consulta). */
  function search(q, max = 60) {
    const bible = Store.getBible();
    if (!bible) return [];
    q = String(q || '').toLowerCase();
    const out = [];
    for (const b of bible.books) {
      for (let i = 0; i < b.chapters.length; i++) {
        const ch = b.chapters[i];
        for (let j = 0; j < ch.length; j++) {
          if (String(ch[j]).toLowerCase().includes(q)) {
            out.push({ abbrev: b.abbrev, name: b.name, chapter: i + 1, verse: j + 1, text: ch[j] });
            if (out.length >= max) return out;
          }
        }
      }
    }
    return out;
  }

  return { BOOKS, flatBooks, findByAbbrev, abbrevFromRef, importFile, validateImport, chapter, hasText, search, nameFor, parseTextoPlano, importTexto };
})();

window.Biblia = Biblia;
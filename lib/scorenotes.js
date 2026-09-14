/* ============================================================
   Partituras por salmo/rezo (Mis salmos y rezos)
   -------------------------------------------------------------
   A diferencia de una grabación de voz (una por pieza), una misma pieza
   puede tener VARIAS partituras: la completa y, aparte, solo las
   terminaciones de los versos. Cada una es una imagen (JPG/PNG), un PDF
   escaneado, un MusicXML (formato de pentagrama editable en programas de
   notación -esta app no lo dibuja ni lo edita, solo lo guarda tal cual-)
   o un MIDI (ese sí se puede escuchar aquí mismo, con MidiPlayer).
   ============================================================ */
window.ScoreNotes = (() => {
  'use strict';

  const DB_NAME = 'liturgia-scores-v1';
  const STORE = 'items';
  let dbPromise = null;

  function supported() { return 'indexedDB' in window; }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!supported()) { reject(new Error('sin IndexedDB')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'itemId' });
        store.createIndex('pieceId', 'pieceId', { unique: false });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function kindFor(type, name) {
    type = String(type || '').toLowerCase();
    name = String(name || '').toLowerCase();
    if (type.startsWith('image/')) return 'imagen';
    if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.mid') || name.endsWith('.midi') || type === 'audio/midi' || type === 'audio/x-midi') return 'midi';
    if (name.endsWith('.musicxml') || name.endsWith('.xml') || name.endsWith('.mxl')) return 'musicxml';
    return 'archivo';
  }

  async function add(pieceId, label, file, kindOverride) {
    const db = await openDB();
    const item = {
      itemId: pieceId + '__' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      pieceId,
      label: String(label || '').trim() || 'Partitura',
      kind: kindOverride || kindFor(file.type, file.name),
      type: file.type || '',
      filename: file.name || '',
      blob: file,
      ts: Date.now()
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = () => { try { window.CloudBackup && CloudBackup.scheduleBackup(); } catch (e) { } resolve(item.itemId); };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function list(pieceId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const idx = tx.objectStore(STORE).index('pieceId');
      const req = idx.getAll(pieceId);
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => a.ts - b.ts));
      req.onerror = () => reject(req.error);
    });
  }

  async function get(itemId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(itemId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(itemId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(itemId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Para restaurar desde una copia en la nube: guarda el item TAL CUAL
  // (mismo itemId, pieceId, etiqueta...), a diferencia de add() que
  // siempre genera un itemId nuevo. Si ya existe ese itemId, no hace nada.
  async function putIfMissing(item) {
    const db = await openDB();
    const existing = await get(item.itemId);
    if (existing) return false;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function listAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  return { supported, add, list, get, remove, listAll, kindFor, putIfMissing };
})();

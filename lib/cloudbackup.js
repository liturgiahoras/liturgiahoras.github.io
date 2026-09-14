/* ============================================================
   Copia en tu nube · Mis salmos y rezos + Mis oficios personalizados
   -------------------------------------------------------------
   Sin cuenta, sin servidor propio: el usuario elige UNA CARPETA de su
   propio disco (normalmente la carpeta local de Dropbox, Google Drive,
   OneDrive o iCloud Drive) y esta app escribe ahí sus favoritos, sus
   rezos personalizados, sus oficios propios y sus grabaciones de voz.
   El propio servicio de nube del usuario se encarga de llevarlo a sus
   demás dispositivos -aquí no viaja nada a ningún servidor nuestro-.

   Requiere el "File System Access API" (showDirectoryPicker): hoy solo
   Chrome/Edge de escritorio. En el resto de navegadores (Safari,
   Firefox, y la mayoría de navegadores en el móvil) no está disponible
   -se avisa con claridad y se ofrece en su lugar el archivo de
   exportación/importación manual que ya existe para un oficio suelto-.
   ============================================================ */
window.CloudBackup = (() => {
  'use strict';

  const DB_NAME = 'liturgia-cloud-v1';
  const STORE = 'handle';
  const KEY = 'dir';
  let dbPromise = null;

  function supported() {
    return typeof window.showDirectoryPicker === 'function';
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function saveHandle(handle) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function clearHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // El permiso sobre una carpeta elegida en una sesión anterior hay que
  // volver a confirmarlo (silenciosamente si el navegador lo permite; si
  // no, hace falta el botón "Reconectar", que sí cuenta como gesto del
  // usuario). Nunca se pide sin que el usuario haya tocado algo antes.
  async function verifyPermission(handle, withGesture) {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (!withGesture) return false;
    return (await handle.requestPermission(opts)) === 'granted';
  }

  async function connect() {
    if (!supported()) return { ok: false, error: 'Tu navegador no admite elegir una carpeta (funciona en Chrome o Edge de escritorio).' };
    try {
      const handle = await window.showDirectoryPicker({ id: 'liturgia-backup', mode: 'readwrite' });
      await saveHandle(handle);
      return { ok: true, name: handle.name };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, cancelled: true };
      return { ok: false, error: 'No se pudo conectar con esa carpeta.' };
    }
  }

  async function disconnect() {
    await clearHandle();
  }

  async function status() {
    if (!supported()) return { supported: false, connected: false };
    const handle = await loadHandle().catch(() => null);
    if (!handle) return { supported: true, connected: false };
    const granted = await verifyPermission(handle, false).catch(() => false);
    return { supported: true, connected: true, granted, name: handle.name };
  }

  /* --------------------------- Qué se guarda --------------------------- */
  function readJSON(key, fallback) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
    catch (e) { return fallback; }
  }

  function snapshotLocal() {
    return {
      version: 1,
      exportado: new Date().toISOString(),
      favs: readJSON('liturgia.favs.v1', []),
      customs: readJSON('liturgia.custom.v1', []),
      customOffices: readJSON('liturgia.customoffice.v1', []),
      customOfficeAssign: readJSON('liturgia.customoffice.assign.v1', {})
    };
  }

  const EXT_BY_TYPE = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
  function extFor(type) { return EXT_BY_TYPE[String(type || '').split(';')[0]] || 'audio'; }

  async function writeFile(dirHandle, name, contents) {
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(contents);
    await w.close();
  }

  async function readFileIfExists(dirHandle, name) {
    try {
      const fh = await dirHandle.getFileHandle(name, { create: false });
      return await fh.getFile();
    } catch (e) { return null; }
  }

  async function backupNow(withGesture) {
    if (!supported()) return { ok: false, error: 'no-soportado' };
    const handle = await loadHandle();
    if (!handle) return { ok: false, error: 'no-conectado' };
    const ok = await verifyPermission(handle, withGesture);
    if (!ok) return { ok: false, error: 'sin-permiso' };
    try {
      await writeFile(handle, 'liturgia-backup.json', JSON.stringify(snapshotLocal(), null, 2));
      if (window.AudioNotes && AudioNotes.supported && AudioNotes.supported() && AudioNotes.listIds) {
        const ids = await AudioNotes.listIds();
        if (ids.length) {
          const audiosDir = await handle.getDirectoryHandle('audios', { create: true });
          for (const id of ids) {
            const rec = await AudioNotes.get(id).catch(() => null);
            if (rec && rec.blob) await writeFile(audiosDir, id + '.' + extFor(rec.blob.type), rec.blob);
          }
        }
      }
      return { ok: true, ts: Date.now() };
    } catch (e) {
      return { ok: false, error: 'fallo-al-escribir' };
    }
  }

  // No sobrescribe nada que ya exista en este dispositivo (por id): solo
  // añade lo que falte. Pensado para "tengo un dispositivo nuevo, tráeme
  // lo de siempre", no para sincronizar ediciones entre dos dispositivos
  // ya usados -eso necesitaría comparar versión a versión, y aquí no hay
  // servidor que lleve la cuenta de eso-.
  async function restoreFromFolder(withGesture) {
    if (!supported()) return { ok: false, error: 'no-soportado' };
    const handle = await loadHandle();
    if (!handle) return { ok: false, error: 'no-conectado' };
    const ok = await verifyPermission(handle, withGesture);
    if (!ok) return { ok: false, error: 'sin-permiso' };
    try {
      const file = await readFileIfExists(handle, 'liturgia-backup.json');
      if (!file) return { ok: false, error: 'sin-copia-todavia' };
      const data = JSON.parse(await file.text());
      let nuevos = 0;

      const favs = readJSON('liturgia.favs.v1', []);
      const favIds = new Set(favs.map((f) => f.id));
      for (const f of data.favs || []) if (!favIds.has(f.id)) { favs.push(f); nuevos++; }
      localStorage.setItem('liturgia.favs.v1', JSON.stringify(favs));

      const customs = readJSON('liturgia.custom.v1', []);
      const customIds = new Set(customs.map((c) => c.id));
      for (const c of data.customs || []) if (!customIds.has(c.id)) { customs.push(c); nuevos++; }
      localStorage.setItem('liturgia.custom.v1', JSON.stringify(customs));

      const offices = readJSON('liturgia.customoffice.v1', []);
      const officeIds = new Set(offices.map((o) => o.id));
      for (const o of data.customOffices || []) if (!officeIds.has(o.id)) { offices.push(o); nuevos++; }
      localStorage.setItem('liturgia.customoffice.v1', JSON.stringify(offices));

      const assign = readJSON('liturgia.customoffice.assign.v1', {});
      for (const hourId in (data.customOfficeAssign || {})) if (!assign[hourId]) assign[hourId] = data.customOfficeAssign[hourId];
      localStorage.setItem('liturgia.customoffice.assign.v1', JSON.stringify(assign));

      let audios = 0;
      if (window.AudioNotes && AudioNotes.supported && AudioNotes.supported()) {
        try {
          const audiosDir = await handle.getDirectoryHandle('audios', { create: false });
          for await (const [filename, entry] of audiosDir.entries()) {
            if (entry.kind !== 'file') continue;
            const id = filename.replace(/\.[a-z0-9]+$/i, '');
            if (await AudioNotes.has(id)) continue;
            const f = await entry.getFile();
            await AudioNotes.save(id, f);
            audios++;
          }
        } catch (e) { /* sin carpeta de audios todavía: nada que restaurar */ }
      }

      return { ok: true, nuevos, audios };
    } catch (e) {
      return { ok: false, error: 'fallo-al-leer' };
    }
  }

  // Aviso discreto (sin gesto del usuario, así que si el permiso se
  // hubiera perdido, simplemente no hace nada hasta que el usuario
  // vuelva a tocar "Guardar copia ahora").
  let pending = null;
  function scheduleBackup() {
    if (!supported()) return;
    clearTimeout(pending);
    pending = setTimeout(() => { backupNow(false).catch(() => {}); }, 2500);
  }

  return { supported, connect, disconnect, status, backupNow, restoreFromFolder, scheduleBackup };
})();

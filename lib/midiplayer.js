/* ============================================================
   Reproductor MIDI mínimo (a petición, con botón)
   -------------------------------------------------------------
   Lee un archivo .mid/.midi (Standard MIDI File) y lo reproduce con el
   propio Web Audio del navegador -sin librería externa, sin conexión-.
   No pretende sonar como una orquesta: una sola voz sencilla (para oír
   la melodía y el ritmo, no una interpretación con instrumentos reales).
   Sirve para escuchar una partitura subida en "Mis salmos y rezos",
   no para partituras en imagen (JPG/PDF) o en MusicXML, que no llevan
   aquí sonido -esas se guardan tal cual para verlas o abrirlas en un
   programa de notación-.
   ============================================================ */
window.MidiPlayer = (() => {
  'use strict';

  function readVarLen(bytes, pos) {
    let value = 0, b;
    do { b = bytes[pos.i++]; value = (value << 7) | (b & 0x7f); } while (b & 0x80);
    return value >>> 0;
  }

  function parse(buffer) {
    const bytes = new Uint8Array(buffer);
    const pos = { i: 0 };
    function readStr(n) { let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(bytes[pos.i++]); return s; }
    function readU32() { const v = (bytes[pos.i] * 0x1000000) + (bytes[pos.i + 1] << 16) + (bytes[pos.i + 2] << 8) + bytes[pos.i + 3]; pos.i += 4; return v >>> 0; }
    function readU16() { const v = (bytes[pos.i] << 8) | bytes[pos.i + 1]; pos.i += 2; return v; }

    if (readStr(4) !== 'MThd') throw new Error('No es un archivo MIDI válido (falta la cabecera MThd).');
    readU32(); // longitud de cabecera, siempre 6
    const format = readU16();
    const numTracks = readU16();
    const division = readU16();
    if (division & 0x8000) throw new Error('Este archivo usa código de tiempo SMPTE, no soportado aquí.');
    const ticksPerQuarter = division;

    const tracks = [];
    for (let t = 0; t < numTracks; t++) {
      if (readStr(4) !== 'MTrk') throw new Error('Pista MIDI inválida (falta MTrk).');
      const trackLen = readU32();
      const end = pos.i + trackLen;
      const events = [];
      let runningStatus = null;
      let tick = 0;
      while (pos.i < end) {
        tick += readVarLen(bytes, pos);
        let statusByte = bytes[pos.i];
        if (statusByte & 0x80) { pos.i++; runningStatus = statusByte; }
        else { statusByte = runningStatus; }
        if (statusByte === 0xFF) {
          const type = bytes[pos.i++];
          const len = readVarLen(bytes, pos);
          const data = bytes.slice(pos.i, pos.i + len);
          pos.i += len;
          events.push({ tick, meta: true, metaType: type, data });
        } else if (statusByte === 0xF0 || statusByte === 0xF7) {
          const len = readVarLen(bytes, pos);
          pos.i += len;
        } else {
          const type = statusByte & 0xF0;
          const channel = statusByte & 0x0F;
          if (type === 0xC0 || type === 0xD0) {
            const d1 = bytes[pos.i++];
            events.push({ tick, type, channel, d1 });
          } else {
            const d1 = bytes[pos.i++], d2 = bytes[pos.i++];
            events.push({ tick, type, channel, d1, d2 });
          }
        }
      }
      tracks.push(events);
    }
    return { format, ticksPerQuarter, tracks };
  }

  // Junta todas las pistas en una sola lista de notas con su instante real
  // en segundos, siguiendo los cambios de tempo (mensaje meta 0x51) según
  // van apareciendo, en el orden real de los tiques.
  function toNoteEvents(parsed) {
    const all = [];
    for (const track of parsed.tracks) for (const ev of track) all.push(ev);
    all.sort((a, b) => a.tick - b.tick);

    const notes = [];
    let lastTick = 0, lastSec = 0, usecPerQuarter = 500000; // 120 BPM por defecto
    for (const ev of all) {
      const deltaTicks = ev.tick - lastTick;
      lastSec += (deltaTicks * usecPerQuarter) / 1e6 / parsed.ticksPerQuarter;
      lastTick = ev.tick;
      if (ev.meta && ev.metaType === 0x51 && ev.data.length === 3) {
        usecPerQuarter = (ev.data[0] << 16) | (ev.data[1] << 8) | ev.data[2];
        continue;
      }
      if (ev.meta) continue;
      const isNoteOn = ev.type === 0x90 && ev.d2 > 0;
      const isNoteOff = ev.type === 0x80 || (ev.type === 0x90 && ev.d2 === 0);
      if (isNoteOn) notes.push({ timeSec: lastSec, note: ev.d1, on: true });
      else if (isNoteOff) notes.push({ timeSec: lastSec, note: ev.d1, on: false });
    }
    return notes;
  }

  // ------------------- Melodía escrita a mano (texto simple) -------------------
  // Pensada para la fórmula sencilla de un tono salmódico (entonación,
  // tenor, mediante, terminación): notas separadas por espacios, cada una
  // "Nombre[#/b]Octava[:duración]" (duración en negras, 1 por defecto) o
  // un guion "-" para un silencio. Ejemplo: "sol4 sol4 sol4 fa4:2 mi4 re4:2"
  // (también se aceptan nombres en inglés: C D E F G A B).
  const NOTE_BASE = { do: 0, c: 0, re: 2, d: 2, mi: 4, e: 4, fa: 5, f: 5, sol: 7, g: 7, la: 9, a: 9, si: 11, b: 11 };
  function noteNameToMidi(name) {
    const m = String(name || '').trim().toLowerCase().match(/^(do|re|mi|fa|sol|la|si|[a-g])([#b]?)(\d)$/);
    if (!m) return null;
    const base = NOTE_BASE[m[1]];
    if (base === undefined) return null;
    const accidental = m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0);
    const octave = parseInt(m[3], 10);
    return (octave + 1) * 12 + base + accidental;
  }
  function parseMelodyText(text) {
    const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
    const notes = [];
    for (const tok of tokens) {
      const [namePart, durPart] = tok.split(':');
      const dur = durPart ? parseFloat(durPart) : 1;
      if (namePart === '-' || namePart.toLowerCase() === 'r') { notes.push({ note: null, dur: dur || 1 }); continue; }
      const midi = noteNameToMidi(namePart);
      if (midi == null) throw new Error('No se entiende la nota "' + namePart + '" (usa, p. ej., sol4, fa#4, la4:2 o "-" para un silencio).');
      notes.push({ note: midi, dur: dur || 1 });
    }
    return notes;
  }
  // bpm: pulsos (negras) por minuto de la duración 1.
  function melodyToNoteEvents(notes, bpm) {
    const secPerBeat = 60 / (bpm || 76);
    const events = [];
    let t = 0;
    for (const n of notes) {
      const dur = n.dur * secPerBeat;
      if (n.note != null) {
        events.push({ timeSec: t, note: n.note, on: true });
        events.push({ timeSec: t + dur * 0.92, note: n.note, on: false });
      }
      t += dur;
    }
    return events;
  }

  // --------------------------------- Voces ---------------------------------
  // Todo sintetizado con el propio Web Audio, sin muestras ni librerías: no
  // busca sonar como un instrumento real grabado, solo dar timbres
  // reconocibles y distintos entre sí (para practicar la melodía, no para
  // una grabación de calidad).
  const INSTRUMENTS = {
    sencillo: { label: 'Sencillo' },
    organo: { label: 'Órgano' },
    catedral: { label: 'Órgano de catedral' },
    citara: { label: 'Cítara' }
  };
  function noteToFreq(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  let ctx = null;
  let reverbNode = null;
  function getReverb() {
    if (reverbNode) return reverbNode;
    const len = ctx.sampleRate * 2.6;
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
    reverbNode = ctx.createConvolver();
    reverbNode.buffer = impulse;
    reverbNode.connect(ctx.destination);
    return reverbNode;
  }

  // Crea una "voz" para una nota concreta: osciladores + su propio nudo de
  // volumen, ya conectados a la salida (y, si toca, al eco de catedral).
  // Devuelve { gain, stopAt(t) } -stopAt para de verdad los osciladores-.
  function makeVoice(instrument, freq, when) {
    const oscs = [];
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);

    function addOsc(type, freqMult, level, detune) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq * freqMult, when);
      if (detune) o.detune.setValueAtTime(detune, when);
      const g = ctx.createGain();
      g.gain.setValueAtTime(level, when);
      o.connect(g).connect(gain);
      o.start(when);
      oscs.push(o);
    }

    let peak = 0.18, attack = 0.02;
    if (instrument === 'organo' || instrument === 'catedral') {
      addOsc('sine', 1, 0.5);
      addOsc('sine', 2, 0.22);
      addOsc('sine', 3, 0.12);
      addOsc('triangle', 4, 0.07);
      peak = instrument === 'catedral' ? 0.13 : 0.16;
      attack = 0.02;
    } else if (instrument === 'citara') {
      addOsc('sawtooth', 1, 0.5);
      addOsc('sawtooth', 2, 0.18, 4);
      peak = 0.22;
      attack = 0.002;
    } else {
      addOsc('triangle', 1, 1);
      peak = 0.18;
      attack = 0.02;
    }

    gain.gain.linearRampToValueAtTime(peak, when + attack);
    gain.connect(ctx.destination);
    if (instrument === 'catedral') gain.connect(getReverb());

    return {
      gain,
      when,
      stopAt(t) {
        for (const o of oscs) { try { o.stop(t); } catch (e) { } }
      }
    };
  }

  let voices = [];      // voces activas, para poder pararlas todas
  let playToken = 0;    // invalida una reproducción anterior si se pide otra

  function stop() {
    playToken++;
    for (const v of voices) {
      try { v.gain.gain.cancelScheduledValues(0); v.gain.gain.setValueAtTime(0, ctx.currentTime); v.stopAt(ctx.currentTime); } catch (e) { /* ya parada */ }
    }
    voices = [];
  }

  async function scheduleNoteEvents(events, instrument, onEnd) {
    const myToken = playToken;
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    if (!events.length) return;
    const release = instrument === 'citara' ? 0.9 : (instrument === 'catedral' ? 0.5 : 0.06);

    const t0 = ctx.currentTime + 0.15;
    const openByNote = {};
    let maxEnd = 0;
    for (const ev of events) {
      const when = t0 + ev.timeSec;
      if (ev.on) {
        const voice = makeVoice(instrument, noteToFreq(ev.note), when);
        voices.push(voice);
        openByNote[ev.note] = voice;
      } else {
        const openNote = openByNote[ev.note];
        if (openNote) {
          const end = Math.max(when, openNote.when + 0.05);
          openNote.gain.gain.setValueAtTime(openNote.gain.gain.value, when);
          openNote.gain.gain.linearRampToValueAtTime(0, end + release);
          openNote.stopAt(end + release + 0.05);
          maxEnd = Math.max(maxEnd, end + release + 0.05);
          delete openByNote[ev.note];
        }
      }
    }
    // Notas que se quedaron sin "note off" explícito (raro, pero pasa):
    for (const n in openByNote) {
      const o = openByNote[n];
      o.gain.gain.linearRampToValueAtTime(0, o.when + 1.5);
      o.stopAt(o.when + 1.55);
      maxEnd = Math.max(maxEnd, o.when + 1.55);
    }
    if (onEnd) {
      const waitMs = Math.max(0, (maxEnd - ctx.currentTime) * 1000) + 80;
      setTimeout(() => { if (myToken === playToken) onEnd(); }, waitMs);
    }
  }

  // file: Blob/File de un .mid. instrument: clave de INSTRUMENTS.
  async function play(file, instrument, onEnd) {
    stop();
    const buffer = await file.arrayBuffer();
    const parsed = parse(buffer);
    const events = toNoteEvents(parsed);
    await scheduleNoteEvents(events, instrument, onEnd);
  }

  // text: melodía escrita (ver parseMelodyText). bpm opcional.
  async function playMelodyText(text, instrument, bpm, onEnd) {
    stop();
    const notes = parseMelodyText(text);
    const events = melodyToNoteEvents(notes, bpm);
    await scheduleNoteEvents(events, instrument, onEnd);
  }

  return { parse, toNoteEvents, parseMelodyText, melodyToNoteEvents, INSTRUMENTS, play, playMelodyText, stop };
})();

/* Teleprompter — app web para iPhone con control Bluetooth (MOCUTE-052F u otro).
 * Escucha tres tipos de entrada:
 *   k:<tecla>   teclado Bluetooth (modo GAME/iCade manda letras, otros mandan flechas, espacio, etc.)
 *   m:<acción>  botones multimedia (play/pausa, siguiente, anterior) vía Media Session
 *   g:<botón>   gamepad (Gamepad API, si iOS lo reconoce como control de juego)
 */
'use strict';

const $ = (id) => document.getElementById(id);
const LS = {
  get(k, d) { try { const v = localStorage.getItem('tp.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tp.' + k, JSON.stringify(v)); } catch {} },
};

/* ---------------- Acciones y botones ---------------- */
const ACTIONS = {
  toggle:  'Iniciar / Pausar',
  faster:  'Más rápido',
  slower:  'Más lento',
  back:    'Retroceder',
  forward: 'Avanzar',
  bigger:  'Letra más grande',
  smaller: 'Letra más chica',
  restart: 'Volver al inicio',
  mirror:  'Activar/desactivar espejo',
  exit:    'Salir del prompter',
};
// Acciones que no deben repetirse si se mantiene presionado el botón.
const NO_REPEAT = new Set(['toggle', 'restart', 'mirror', 'exit']);

// iCade (modo GAME del MOCUTE): cada botón manda una letra al presionar y otra al soltar.
const ICADE_PRESS = { w: 'Joystick ↑', d: 'Joystick →', x: 'Joystick ↓', a: 'Joystick ←',
  y: 'Botón 1', h: 'Botón 2', u: 'Botón 3', j: 'Botón 4', i: 'Botón 5', k: 'Botón 6', o: 'Botón 7', l: 'Botón 8' };
const ICADE_RELEASE = new Set(['e', 'c', 'z', 'q', 't', 'r', 'f', 'n', 'm', 'p', 'g', 'v']);

const DEFAULT_MAP = {
  toggle:  ['k:space', 'k:enter', 'k:mediaplaypause', 'k:y', 'k:h', 'k:u', 'k:j', 'k:i', 'k:k', 'k:o', 'k:l',
            'm:play', 'm:pause', 'g:b0', 'g:b1', 'g:b2', 'g:b3'],
  faster:  ['k:arrowup', 'k:w', 'k:+', 'm:seekforward', 'g:up'],
  slower:  ['k:arrowdown', 'k:x', 'k:-', 'm:seekbackward', 'g:down'],
  back:    ['k:arrowleft', 'k:a', 'k:pageup', 'k:mediatrackprevious', 'm:previoustrack', 'g:left'],
  forward: ['k:arrowright', 'k:d', 'k:pagedown', 'k:mediatracknext', 'm:nexttrack', 'g:right'],
  bigger:  ['g:b5'],
  smaller: ['g:b4'],
  restart: ['k:home'],
  mirror:  [],
  exit:    ['k:escape', 'g:b9'],
};

let map = LS.get('map', null) || structuredClone(DEFAULT_MAP);
for (const a of Object.keys(ACTIONS)) if (!Array.isArray(map[a])) map[a] = [];

function actionFor(code) {
  for (const [a, codes] of Object.entries(map)) if (codes.includes(code)) return a;
  return null;
}

function codeLabel(code) {
  const [t, v] = [code.slice(0, 1), code.slice(2)];
  if (t === 'k') {
    if (ICADE_PRESS[v]) return `Tecla ${v.toUpperCase()} · ${ICADE_PRESS[v]}`;
    const names = { space: 'Espacio', enter: 'Enter', arrowup: 'Flecha ↑', arrowdown: 'Flecha ↓', arrowleft: 'Flecha ←', arrowright: 'Flecha →',
      pageup: 'Re Pág', pagedown: 'Av Pág', escape: 'Esc', home: 'Inicio', mediaplaypause: 'Tecla Play/Pausa',
      mediatracknext: 'Tecla Siguiente', mediatrackprevious: 'Tecla Anterior' };
    return names[v] || `Tecla ${v.length === 1 ? v.toUpperCase() : v}`;
  }
  if (t === 'm') {
    const names = { play: 'Multimedia ▶ Play', pause: 'Multimedia ❚❚ Pausa', nexttrack: 'Multimedia ⏭ Siguiente',
      previoustrack: 'Multimedia ⏮ Anterior', seekforward: 'Multimedia ⏩', seekbackward: 'Multimedia ⏪', stop: 'Multimedia ⏹' };
    return names[v] || 'Multimedia ' + v;
  }
  if (t === 'g') {
    const names = { up: 'Gamepad ↑', down: 'Gamepad ↓', left: 'Gamepad ←', right: 'Gamepad →' };
    return names[v] || `Gamepad botón ${v.replace('b', '')}`;
  }
  return code;
}

/* ---------------- Ajustes ---------------- */
const DEFAULT_SETTINGS = {
  speed: 5, fontSize: 48, lineHeight: 1.35, margin: 6, guidePos: 30, align: 'left', countdown: 3,
  mirrorH: true, mirrorV: false, showGuide: true, media: true,
};
let settings = { ...DEFAULT_SETTINGS, ...LS.get('settings', {}) };
const saveSettings = () => LS.set('settings', settings);

const FMT = {
  speed: (v) => v.toFixed(1),
  fontSize: (v) => v + ' px',
  lineHeight: (v) => v.toFixed(2),
  margin: (v) => v + ' %',
  guidePos: (v) => v + ' %',
};

function bindSettings() {
  for (const k of Object.keys(FMT)) {
    const el = $('s_' + k);
    el.value = settings[k];
    $('o_' + k).textContent = FMT[k](settings[k]);
    el.addEventListener('input', () => {
      settings[k] = parseFloat(el.value);
      $('o_' + k).textContent = FMT[k](settings[k]);
      saveSettings(); applyLayout();
    });
  }
  for (const k of ['align', 'countdown']) {
    const el = $('s_' + k);
    el.value = String(settings[k]);
    el.addEventListener('change', () => {
      settings[k] = k === 'countdown' ? parseInt(el.value, 10) : el.value;
      saveSettings(); applyLayout();
    });
  }
  for (const k of ['mirrorH', 'mirrorV', 'showGuide', 'media']) {
    const el = $('s_' + k);
    el.checked = settings[k];
    el.addEventListener('change', () => {
      settings[k] = el.checked; saveSettings(); applyLayout();
      if (k === 'media') settings.media ? startMedia() : stopMedia();
    });
  }
}
function syncSettingsUI() {
  for (const k of Object.keys(FMT)) { $('s_' + k).value = settings[k]; $('o_' + k).textContent = FMT[k](settings[k]); }
  $('s_mirrorH').checked = settings.mirrorH; $('s_mirrorV').checked = settings.mirrorV;
}

/* ---------------- Guiones ---------------- */
const SAMPLE = `Hola, bienvenidos a una nueva edición de la Social Magazine.

Este es un texto de prueba para el teleprompter. Presiona un botón del control para iniciar o pausar.

[PAUSA]

Mueve el joystick hacia arriba para ir más rápido y hacia abajo para ir más lento. A los lados retrocedes o avanzas un par de renglones.

Si algún botón no responde, entra a Ajustes, busca "Botones del control" y asígnalo.

¡Gracias por vernos!`;

let scripts = LS.get('scripts', null);
if (!Array.isArray(scripts) || !scripts.length) scripts = [{ id: uid(), title: 'Guion de prueba', text: SAMPLE }];
let currentId = LS.get('current', scripts[0].id);
if (!scripts.find((s) => s.id === currentId)) currentId = scripts[0].id;

function uid() { return Math.random().toString(36).slice(2, 10); }
const current = () => scripts.find((s) => s.id === currentId);
const saveScripts = () => { LS.set('scripts', scripts); LS.set('current', currentId); };

function renderScriptList() {
  const sel = $('scriptSelect');
  sel.innerHTML = '';
  for (const s of scripts) {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.title || 'Sin título';
    sel.appendChild(o);
  }
  sel.value = currentId;
  const c = current();
  $('scriptTitle').value = c.title;
  $('scriptText').value = c.text;
  updateCount();
}
function updateCount() {
  const words = (current().text.match(/\S+/g) || []).length;
  const mins = words / 140; // ~140 palabras por minuto al hablar
  $('wordCount').textContent = `${words} palabras · ~${mins < 1 ? Math.max(1, Math.round(mins * 60)) + ' s' : mins.toFixed(1) + ' min'}`;
}

$('scriptSelect').addEventListener('change', (e) => { currentId = e.target.value; saveScripts(); renderScriptList(); });
$('scriptTitle').addEventListener('input', (e) => {
  current().title = e.target.value; saveScripts();
  $('scriptSelect').selectedOptions[0].textContent = e.target.value || 'Sin título';
});
$('scriptText').addEventListener('input', (e) => { current().text = e.target.value; saveScripts(); updateCount(); });
$('btnNew').addEventListener('click', () => {
  const s = { id: uid(), title: 'Guion nuevo', text: '' };
  scripts.unshift(s); currentId = s.id; saveScripts(); renderScriptList(); $('scriptText').focus();
});
$('btnDelete').addEventListener('click', () => {
  if (!confirm(`¿Borrar "${current().title || 'Sin título'}"? No se puede deshacer.`)) return;
  scripts = scripts.filter((s) => s.id !== currentId);
  if (!scripts.length) scripts = [{ id: uid(), title: 'Guion nuevo', text: '' }];
  currentId = scripts[0].id; saveScripts(); renderScriptList();
});
$('fileInput').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text();
  const s = { id: uid(), title: f.name.replace(/\.[^.]+$/, ''), text };
  scripts.unshift(s); currentId = s.id; saveScripts(); renderScriptList();
  e.target.value = '';
});

/* ---------------- Prompter ---------------- */
const stage = $('stage'), scroller = $('scroller'), content = $('content');
let inPrompter = false, playing = false, pos = 0, curSpeed = 0, jumpTarget = null;
let elapsed = 0, lastT = 0, countdownLeft = 0;

function escapeHTML(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function renderContent() {
  const text = current().text.trim() || '(El guion está vacío)';
  content.innerHTML = text.split(/\n\s*\n/).map((p) =>
    '<p>' + escapeHTML(p).replace(/\[([^\]]+)\]/g, '<span class="cue">[$1]</span>').replace(/\n/g, '<br>') + '</p>'
  ).join('');
}

const linePx = () => settings.fontSize * settings.lineHeight;
const speedPx = () => settings.speed * linePx() * 0.1; // velocidad 5 ≈ medio renglón por segundo
const guideY = () => stage.clientHeight * settings.guidePos / 100;
// Termina cuando el último renglón pasó la línea guía.
const maxPos = () => Math.max(0, content.offsetHeight - stage.clientHeight - guideY() + linePx());

function applyLayout() {
  const ratio = maxPos() ? pos / maxPos() : 0;
  content.style.fontSize = settings.fontSize + 'px';
  content.style.lineHeight = settings.lineHeight;
  content.style.textAlign = settings.align;
  content.style.padding = `${guideY()}px ${settings.margin}vw ${stage.clientHeight}px`;
  stage.classList.toggle('mirrorH', settings.mirrorH);
  stage.classList.toggle('mirrorV', settings.mirrorV);
  $('guide').style.top = guideY() + settings.fontSize * settings.lineHeight * 0.5 + 'px';
  $('guide').classList.toggle('hidden', !settings.showGuide);
  pos = ratio * maxPos();
  draw(); updateHud();
}

function draw() {
  scroller.style.transform = `translate3d(0, ${-pos}px, 0)`;
  const m = maxPos();
  $('progressFill').style.width = (m ? Math.min(100, pos / m * 100) : 0) + '%';
}

function fmtTime(s) { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function updateHud() {
  $('hudState').textContent = countdownLeft > 0 ? '…' : playing ? '▶' : '❚❚';
  $('hudSpeed').textContent = 'Vel ' + settings.speed.toFixed(1);
  const remain = (maxPos() - pos) / Math.max(1, speedPx());
  $('hudTime').textContent = `${fmtTime(elapsed)} · faltan ~${fmtTime(remain)}`;
  $('tbToggle').textContent = playing || countdownLeft > 0 ? '❚❚' : '▶';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
}

let flashTimer;
function flash(msg) {
  if (!inPrompter) return;
  const f = $('flash'); f.textContent = msg; f.classList.add('show');
  clearTimeout(flashTimer); flashTimer = setTimeout(() => f.classList.remove('show'), 700);
}

function openPrompter() {
  if (inPrompter) return;
  document.activeElement?.blur();
  renderContent();
  $('home').classList.add('hidden');
  $('prompter').classList.remove('hidden');
  inPrompter = true; playing = false; pos = 0; elapsed = 0; curSpeed = 0; jumpTarget = null;
  applyLayout();
  keepAwake(true);
  startMedia();
  showToolbar();
}
function closePrompter() {
  playing = false; countdownLeft = 0; $('countdown').classList.remove('show');
  inPrompter = false;
  $('prompter').classList.add('hidden');
  $('home').classList.remove('hidden');
  keepAwake(false);
}

let cdTimer;
function togglePlay() {
  if (countdownLeft > 0) { // cancelar cuenta regresiva
    clearInterval(cdTimer); countdownLeft = 0; $('countdown').classList.remove('show'); updateHud(); return;
  }
  if (playing) { playing = false; flash('❚❚ Pausa'); updateHud(); return; }
  if (pos >= maxPos() - 1) { pos = 0; elapsed = 0; draw(); }
  if (settings.countdown > 0 && pos < 1) {
    countdownLeft = settings.countdown;
    const cd = $('countdown'); cd.textContent = countdownLeft; cd.classList.add('show');
    cdTimer = setInterval(() => {
      countdownLeft--;
      if (countdownLeft <= 0) { clearInterval(cdTimer); cd.classList.remove('show'); playing = true; }
      else cd.textContent = countdownLeft;
      updateHud();
    }, 1000);
    updateHud(); return;
  }
  playing = true; flash('▶'); updateHud();
}

function changeSpeed(d) {
  settings.speed = Math.min(20, Math.max(0.5, +(settings.speed + d).toFixed(1)));
  saveSettings(); syncSettingsUI(); updateHud(); flash('Velocidad ' + settings.speed.toFixed(1));
}
function changeFont(d) {
  settings.fontSize = Math.min(160, Math.max(24, settings.fontSize + d));
  saveSettings(); syncSettingsUI(); applyLayout(); flash('Letra ' + settings.fontSize);
}
function jump(lines) {
  const base = jumpTarget ?? pos;
  jumpTarget = Math.min(maxPos(), Math.max(0, base + lines * linePx()));
}

function runAction(a) {
  if (['sheet', 'learn', 'fsHelp'].some((id) => !$(id).classList.contains('hidden'))) return false; // ajustes abiertos
  if (!inPrompter) {
    // Desde el inicio, el botón de iniciar abre el prompter (útil con el teléfono ya montado).
    if (a === 'toggle' && !isTyping()) { openPrompter(); return true; }
    return false;
  }
  switch (a) {
    case 'toggle': togglePlay(); break;
    case 'faster': changeSpeed(+0.5); break;
    case 'slower': changeSpeed(-0.5); break;
    case 'back': jump(-2); break;
    case 'forward': jump(+2); break;
    case 'bigger': changeFont(+4); break;
    case 'smaller': changeFont(-4); break;
    case 'restart': playing = false; jumpTarget = 0; elapsed = 0; flash('⏮ Inicio'); updateHud(); break;
    case 'mirror': settings.mirrorH = !settings.mirrorH; saveSettings(); syncSettingsUI(); applyLayout(); break;
    case 'exit': closePrompter(); break;
    case 'settings': openSettings(); break;
    case 'fullscreen': toggleFullscreen(); break;
  }
  return true;
}

function frame(t) {
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
  lastT = t;
  if (inPrompter) {
    const target = playing ? speedPx() : 0;
    curSpeed += (target - curSpeed) * Math.min(1, dt * 5); // arranque/frenado suave
    if (jumpTarget !== null) {
      const d = jumpTarget - pos;
      pos += d * Math.min(1, dt * 10);
      if (Math.abs(d) < 0.5) { pos = jumpTarget; jumpTarget = null; }
    } else if (!dragging) {
      pos += curSpeed * dt;
    }
    const m = maxPos();
    if (pos >= m) { pos = m; if (playing) { playing = false; flash('Fin ✓'); } }
    if (pos < 0) pos = 0;
    if (playing) elapsed += dt;
    draw();
    if (Math.floor(t / 250) !== Math.floor((t - dt * 1000) / 250)) updateHud();
  }
  pollGamepads();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---- Tacto: tocar muestra la barra, arrastrar mueve el texto ---- */
let dragging = false, dragY = 0, dragMoved = 0;
stage.addEventListener('pointerdown', (e) => { dragging = true; dragY = e.clientY; dragMoved = 0; jumpTarget = null; });
stage.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const d = e.clientY - dragY; dragY = e.clientY; dragMoved += Math.abs(d);
  pos -= settings.mirrorV ? -d : d;
});
const endDrag = () => { if (dragging && dragMoved < 8) showToolbar(true); dragging = false; };
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', () => { dragging = false; });

let tbTimer;
function showToolbar(toggle) {
  const tb = $('toolbar');
  if (toggle && !tb.classList.contains('faded')) { tb.classList.add('faded'); return; }
  tb.classList.remove('faded');
  clearTimeout(tbTimer); tbTimer = setTimeout(() => tb.classList.add('faded'), 4000);
}
$('toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  startMedia(); // aprovecha el toque para activar el audio de los botones multimedia
  runAction(b.dataset.act); showToolbar();
});

/* ---------------- Entrada: teclado ---------------- */
function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'range'));
}
function keyCode(e) {
  let k = e.key;
  if (k === ' ' || k === 'Spacebar') k = 'space';
  if (!k || k === 'Unidentified' || k === 'Dead') k = e.code || 'code' + e.keyCode;
  return 'k:' + k.toLowerCase();
}

let lastFire = {};
function handleInput(code, { repeat = false, event = null } = {}) {
  showLast(code);
  if (learning) { finishLearn(code); event?.preventDefault(); return; }
  const a = actionFor(code);
  if (!a) return;
  if (repeat && NO_REPEAT.has(a)) { event?.preventDefault(); return; }
  // Evita dobles disparos (p. ej. tecla + multimedia del mismo botón).
  const now = performance.now();
  if (NO_REPEAT.has(a) && now - (lastFire[a] || 0) < 300) return;
  lastFire[a] = now;
  if (runAction(a)) event?.preventDefault();
}

document.addEventListener('keydown', (e) => {
  if (isTyping() && !learning) { showLast(keyCode(e)); return; }
  if (e.metaKey || e.ctrlKey) return;
  const code = keyCode(e);
  const k = code.slice(2);
  if (ICADE_RELEASE.has(k) && !actionFor(code)) { showLast(code, true); e.preventDefault(); return; }
  handleInput(code, { repeat: e.repeat, event: e });
});

/* ---------------- Entrada: botones multimedia ---------------- */
// iOS solo entrega play/pausa/siguiente/anterior a una página que está reproduciendo audio,
// así que se reproduce un audio silencioso en bucle mientras la app está abierta.
let silentAudio = null;
function silentWavURL() {
  const rate = 8000, secs = 2, n = rate * secs;
  const buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
function startMedia() {
  if (!settings.media || !('mediaSession' in navigator)) return;
  if (!silentAudio) {
    silentAudio = new Audio(silentWavURL());
    silentAudio.loop = true;
    silentAudio.setAttribute('playsinline', '');
    silentAudio.addEventListener('pause', () => { if (settings.media) setTimeout(() => silentAudio.play().catch(() => {}), 50); });
    const acts = ['play', 'pause', 'nexttrack', 'previoustrack', 'seekforward', 'seekbackward', 'stop'];
    for (const a of acts) {
      try { navigator.mediaSession.setActionHandler(a, () => { handleInput('m:' + a); silentAudio.play().catch(() => {}); }); } catch {}
    }
  }
  try { navigator.mediaSession.metadata = new MediaMetadata({ title: current()?.title || 'Teleprompter', artist: 'Teleprompter' }); } catch {}
  navigator.mediaSession.playbackState = 'playing';
  silentAudio.play().catch(() => {});
}
function stopMedia() { if (silentAudio) silentAudio.pause(); }
// El primer toque en cualquier parte activa el audio (Safari exige un gesto del usuario).
document.addEventListener('pointerdown', () => startMedia(), { once: true });

/* ---------------- Entrada: gamepad ---------------- */
// Con [flecha abajo + encendido] el MOCUTE-052F se conecta como "Xbox Wireless Controller":
// A=b0, B=b1, X=b2, Y=b3, LB=b4, RB=b5, cruceta b12–b15, joystick izquierdo = axes 0/1.
const padPrev = {}, padHeld = {};
function pollGamepads() {
  if (!navigator.getGamepads) return;
  for (const gp of navigator.getGamepads()) {
    if (!gp) continue;
    const prev = padPrev[gp.index] || {};
    const now = {};
    gp.buttons.forEach((b, i) => { now['b' + i] = b.pressed || b.value > 0.5; });
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    now.up = now.b12 || ay < -0.6; now.down = now.b13 || ay > 0.6;
    now.left = now.b14 || ax < -0.6; now.right = now.b15 || ax > 0.6;
    const t = performance.now();
    const held = padHeld[gp.index] || (padHeld[gp.index] = {});
    for (const [k, on] of Object.entries(now)) {
      if (['b12', 'b13', 'b14', 'b15'].includes(k)) continue; // ya se reportan como up/down/left/right
      if (on && !prev[k]) { handleInput('g:' + k); held[k] = t + 450; }
      // Mantener presionado repite (velocidad, avanzar/retroceder).
      else if (on && held[k] && t >= held[k]) { handleInput('g:' + k, { repeat: true }); held[k] = t + 160; }
      else if (!on) delete held[k];
    }
    padPrev[gp.index] = now;
  }
}
window.addEventListener('gamepadconnected', (e) => showLast('Gamepad conectado: ' + e.gamepad.id, false, true));

/* ---------------- Indicador del último botón ---------------- */
let lastTimer;
function showLast(code, release = false, raw = false) {
  const txt = raw ? code : codeLabel(code) + (release ? ' (al soltar)' : '') + (actionFor(code) ? ' → ' + ACTIONS[actionFor(code)] : '');
  for (const id of ['lastInput', 'lastInput2']) { const el = $(id); el.textContent = txt; el.classList.add('live'); }
  clearTimeout(lastTimer);
  lastTimer = setTimeout(() => { for (const id of ['lastInput', 'lastInput2']) $(id).classList.remove('live'); }, 1500);
}

/* ---------------- Ajustes y asignación de botones ---------------- */
let wasPlaying = false;
function openSettings() {
  wasPlaying = playing; playing = false; updateHud();
  renderMap(); $('sheet').classList.remove('hidden');
}
function closeSettings() {
  $('sheet').classList.add('hidden');
  if (inPrompter) { applyLayout(); if (wasPlaying) togglePlay(); }
}
$('btnSettings').addEventListener('click', openSettings);
$('btnCloseSettings').addEventListener('click', closeSettings);
$('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSettings(); });

function renderMap() {
  const box = $('mapTable'); box.innerHTML = '';
  for (const [a, label] of Object.entries(ACTIONS)) {
    const row = document.createElement('div'); row.className = 'map-row';
    const name = document.createElement('div'); name.textContent = label;
    const btn = document.createElement('button'); btn.textContent = 'Asignar';
    btn.addEventListener('click', () => startLearn(a));
    const chips = document.createElement('div'); chips.className = 'chips';
    const codes = map[a];
    if (!codes.length) { const c = document.createElement('span'); c.className = 'chip empty'; c.textContent = 'Sin botón'; chips.appendChild(c); }
    for (const code of codes) {
      const c = document.createElement('span'); c.className = 'chip'; c.textContent = codeLabel(code);
      const x = document.createElement('button'); x.textContent = '×'; x.setAttribute('aria-label', 'Quitar');
      x.addEventListener('click', () => { map[a] = map[a].filter((v) => v !== code); LS.set('map', map); renderMap(); });
      c.appendChild(x); chips.appendChild(c);
    }
    row.append(name, btn, chips); box.appendChild(row);
  }
}
$('btnResetMap').addEventListener('click', () => {
  if (!confirm('¿Regresar todos los botones a como venían?')) return;
  map = structuredClone(DEFAULT_MAP); LS.set('map', map); renderMap();
});

let learning = null, learnArmedAt = 0;
function startLearn(a) {
  startMedia();
  document.activeElement?.blur();
  learning = a; learnArmedAt = performance.now();
  $('learnAction').textContent = ACTIONS[a];
  $('learn').classList.remove('hidden');
}
function finishLearn(code) {
  if (performance.now() - learnArmedAt < 250) return; // ignora rebotes
  if (code.startsWith('k:') && ICADE_RELEASE.has(code.slice(2))) return; // letra de "soltar" en iCade
  for (const k of Object.keys(map)) map[k] = map[k].filter((v) => v !== code);
  map[learning].push(code);
  LS.set('map', map);
  learning = null;
  $('learn').classList.add('hidden');
  renderMap();
}
$('btnLearnCancel').addEventListener('click', () => { learning = null; $('learn').classList.add('hidden'); });

/* ---------------- Pantalla siempre encendida ---------------- */
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (inPrompter) keepAwake(true); startMedia(); }
});
window.addEventListener('resize', () => { if (inPrompter) applyLayout(); });

/* ---------------- Pantalla completa ---------------- */
// Abierta desde el ícono de inicio ya es pantalla completa. En iPhone, Safari no permite
// la Fullscreen API para páginas, así que ahí se muestran los pasos para instalarla.
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches ||
  matchMedia('(display-mode: fullscreen)').matches;
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
function updateFsButtons() {
  const hide = isStandalone();
  document.querySelectorAll('.fs-btn').forEach((b) => b.classList.toggle('hidden', hide));
}
async function toggleFullscreen() {
  if (fsElement()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) {
    try { await req.call(el); return; } catch {}
  }
  wasPlaying = playing; playing = false; updateHud();
  $('fsHelp').classList.remove('hidden');
}
$('btnFsHelpClose').addEventListener('click', () => {
  $('fsHelp').classList.add('hidden');
  if (inPrompter && wasPlaying) togglePlay();
});
document.querySelectorAll('[data-fs]').forEach((b) => b.addEventListener('click', toggleFullscreen));
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(ev, () => setTimeout(() => { if (inPrompter) applyLayout(); }, 100));
}
updateFsButtons();

/* ---------------- Arranque ---------------- */
$('btnStart').addEventListener('click', () => { startMedia(); openPrompter(); });
bindSettings();
renderScriptList();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

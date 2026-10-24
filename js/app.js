import { buildRecord, ndefRecord, ndefTlv, normalizeUrl } from './ndef.js';
import { nfcFields, nfcFileText, safeName, shareLink, TAG_TYPES } from './flipper.js';

const $ = (id) => document.getElementById(id);
const form = $('form');
const send = $('send');
const meter = $('meter');
const MAX_BYTES = TAG_TYPES.at(-1).cc * 8;

let kind = 'url';
let current = null;
let loadedName = false;

const fieldsOf = (k) => form.querySelectorAll(`fieldset[data-kind="${k}"] [name]`);

function readData() {
  return Object.fromEntries([...fieldsOf(kind)].map((el) => [el.name, el.name === 'password' ? el.value : el.value.trim()]));
}

function writeData(k, data) {
  setKind(k);
  for (const el of fieldsOf(k)) if (data[el.name] !== undefined) el.value = data[el.name];
}

function validate(k, d) {
  if (k === 'url') return d.url ? null : 'Enter a link';
  if (k === 'text') return d.text ? null : 'Enter some text';
  if (k === 'wifi') {
    if (!d.ssid) return 'Enter the network name';
    if (d.security !== 'open' && d.password.length < 8) return 'Wi-Fi passwords are at least 8 characters';
    return null;
  }
  return d.name || d.phone || d.email ? null : 'Enter a name, phone or email';
}

function autoName(k, d) {
  if (k === 'url') {
    try {
      const u = new URL(normalizeUrl(d.url));
      if (u.hostname) return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '');
    } catch {}
    return d.url.replace(/^[a-z]+:/i, '');
  }
  if (k === 'text') return d.text.split(/\s+/).slice(0, 3).join('_');
  if (k === 'wifi') return 'WiFi_' + d.ssid;
  return d.name || d.phone || d.email;
}

function summary(k, d) {
  if (k === 'url') return normalizeUrl(d.url);
  if (k === 'text') return d.text;
  if (k === 'wifi') return `Wi-Fi: ${d.ssid}`;
  return [d.name, d.phone, d.email].filter(Boolean).join(' · ');
}

// Returns the tag for some form data, or { error }.
function build(k, d, nameInput = '') {
  const error = validate(k, d);
  if (error) return { error };
  const tlv = ndefTlv(ndefRecord(buildRecord(k, d).record));
  if (tlv.length > MAX_BYTES) return { error: `Too long: ${tlv.length} of ${MAX_BYTES} bytes` };
  const name = safeName(nameInput || autoName(k, d));
  const { type, fields } = nfcFields(tlv);
  return { name, kind: k, data: d, type, fields, bytes: tlv.length, link: shareLink(name, fields) };
}

function setKind(k) {
  kind = k;
  for (const tab of document.querySelectorAll('.tabs button')) tab.setAttribute('aria-selected', tab.dataset.kind === k);
  for (const fs of form.querySelectorAll('fieldset')) fs.hidden = fs.dataset.kind !== k;
}

function update() {
  const result = build(kind, readData(), form.elements.tagName.value);
  const typed = [...fieldsOf(kind)].some((el) => el.tagName !== 'SELECT' && el.value);
  current = result.error ? null : result;
  meter.classList.toggle('error', !current && typed);
  meter.textContent = current
    ? `${current.name}.nfc · ${current.type.name} · ${current.bytes} of ${current.type.cc * 8} bytes`
    : typed ? result.error : '';
  form.elements.tagName.placeholder = current ? current.name : 'Auto';
  if (current) send.href = current.link; else send.removeAttribute('href');
  send.setAttribute('aria-disabled', !current);
  for (const id of ['write', 'save', 'copy', 'download']) $(id).disabled = !current;
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

const STORE = 'flipper-nfc-helper.saved';

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; }
}

function storeSaved(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch { return false; }
}

function el(tag, props) {
  return Object.assign(document.createElement(tag), props);
}

function renderSaved() {
  const list = loadSaved();
  $('savedSection').hidden = list.length === 0;
  $('saved').replaceChildren(...list.map((item) => {
    const built = build(item.kind, item.data, item.name);
    const info = el('button', { className: 'info', type: 'button', title: 'Edit' });
    info.append(el('b', { textContent: item.name }), el('span', { textContent: summary(item.kind, item.data) }));
    info.onclick = () => {
      writeData(item.kind, item.data);
      form.elements.tagName.value = item.name;
      loadedName = true;
      update();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const del = el('button', { className: 'del', type: 'button', textContent: 'Delete' });
    del.setAttribute('aria-label', `Delete ${item.name}`);
    del.onclick = () => {
      storeSaved(loadSaved().filter((s) => s.name !== item.name));
      renderSaved();
    };
    const li = el('li');
    li.append(info);
    if (built.link) li.append(el('a', { textContent: 'Send', href: built.link }));
    li.append(del);
    return li;
  }));
}

document.querySelector('.tabs').addEventListener('click', (e) => {
  const k = e.target.closest('button')?.dataset.kind;
  if (k) { forgetLoadedName(); setKind(k); update(); }
});

// A loaded saved tag keeps its name only until its content changes.
function forgetLoadedName() {
  if (loadedName) form.elements.tagName.value = '';
  loadedName = false;
}

form.addEventListener('input', (e) => {
  if (e.target.name === 'tagName') loadedName = false; else forgetLoadedName();
  update();
});
form.addEventListener('submit', (e) => e.preventDefault());

$('chips').addEventListener('click', (e) => {
  const text = e.target.dataset.insert;
  if (!text) return;
  const input = form.elements.url;
  input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
  input.focus();
  update();
});

$('paste').addEventListener('click', async () => {
  try {
    form.elements.url.value = (await navigator.clipboard.readText()).trim();
    update();
  } catch {
    toast('Paste is blocked. Long-press the field to paste.');
  }
});

$('save').addEventListener('click', () => {
  const { name, kind: k, data } = current;
  const list = [{ name, kind: k, data }, ...loadSaved().filter((s) => s.name !== name)];
  toast(storeSaved(list) ? `Saved ${name}` : 'Could not save on this browser');
  renderSaved();
});

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(current.link);
    toast('Link copied');
  } catch {
    toast('Could not copy');
  }
});

$('download').addEventListener('click', () => {
  const a = el('a', {
    href: URL.createObjectURL(new Blob([nfcFileText(current.fields)], { type: 'text/plain' })),
    download: `${current.name}.nfc`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// Desktop Chrome exposes NDEFReader but has no NFC reader.
if ('NDEFReader' in window && /Android/i.test(navigator.userAgent)) {
  const write = $('write');
  $('writeBox').hidden = false;
  let abort = null;
  write.addEventListener('click', async () => {
    if (abort) return abort.abort();
    abort = new AbortController();
    const timer = setTimeout(() => abort?.abort(), 30000);
    write.textContent = 'Hold phone to Flipper… (tap to cancel)';
    try {
      const { webNfc } = buildRecord(current.kind, current.data);
      await new NDEFReader().write({ records: [webNfc] }, { signal: abort.signal });
      toast('Written. Press Back on the Flipper to keep it.');
    } catch (err) {
      toast(err.name === 'AbortError' ? 'Cancelled' : `Write failed: ${err.message}`);
    } finally {
      clearTimeout(timer);
      abort = null;
      write.textContent = 'Write to Flipper over NFC';
    }
  });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

update();
renderSaved();

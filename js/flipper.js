// Flipper Zero .nfc files (NTAG21x) and flpr.app share links.
// Format: flipperzero-firmware/documentation/file_formats/NfcFileFormats.md

const hex = (b) => b.toString(16).toUpperCase().padStart(2, '0');
const hexBytes = (bytes) => Array.from(bytes, hex).join(' ');

// User memory starts at page 4. NDEF capacity is cc * 8 bytes. Config pages follow the dynamic lock page.
export const TAG_TYPES = [
  { name: 'NTAG213', pages: 45, userPages: 36, cc: 0x12, version: 0x0f },
  { name: 'NTAG215', pages: 135, userPages: 126, cc: 0x3e, version: 0x11 },
  { name: 'NTAG216', pages: 231, userPages: 222, cc: 0x6d, version: 0x13 },
];

// Smallest tag that fits, which also keeps the share link short.
export function pickTagType(tlvLength) {
  return TAG_TYPES.find((t) => t.cc * 8 >= tlvLength) ?? null;
}

export function randomUid() {
  const uid = new Uint8Array(7);
  crypto.getRandomValues(uid);
  uid[0] = 0x04; // NXP manufacturer code
  return uid;
}

function buildPages(type, uid, tlv) {
  const pages = Array.from({ length: type.pages }, () => [0, 0, 0, 0]);
  const bcc0 = 0x88 ^ uid[0] ^ uid[1] ^ uid[2];
  const bcc1 = uid[3] ^ uid[4] ^ uid[5] ^ uid[6];
  pages[0] = [uid[0], uid[1], uid[2], bcc0];
  pages[1] = [uid[3], uid[4], uid[5], uid[6]];
  pages[2] = [bcc1, 0x48, 0x00, 0x00];
  pages[3] = [0xe1, 0x10, type.cc, 0x00]; // Capability container: NDEF v1.0, read/write
  tlv.forEach((b, i) => { pages[4 + (i >> 2)][i & 3] = b; });
  const cfg = 4 + type.userPages;
  pages[cfg] = [0x00, 0x00, 0x00, 0xbd];     // Dynamic lock bytes
  pages[cfg + 1] = [0x04, 0x00, 0x00, 0xff]; // CFG0: AUTH0 = FF, no password
  pages[cfg + 2] = [0x00, 0x05, 0x00, 0x00]; // CFG1
  return pages;
}

// Ordered key/value pairs of the .nfc file (comments omitted).
export function nfcFields(tlv, uid = randomUid()) {
  const type = pickTagType(tlv.length);
  if (!type) throw new Error('Too much data for any NTAG tag');
  const fields = [
    ['Filetype', 'Flipper NFC device'],
    ['Version', '4'],
    ['Device type', 'NTAG/Ultralight'],
    ['UID', hexBytes(uid)],
    ['ATQA', '00 44'],
    ['SAK', '00'],
    ['Data format version', '2'],
    ['NTAG/Ultralight type', type.name],
    ['Signature', hexBytes(new Uint8Array(32))],
    ['Mifare version', hexBytes([0x00, 0x04, 0x04, 0x02, 0x01, 0x00, type.version, 0x03])],
    ['Counter 0', '0'], ['Tearing 0', '00'],
    ['Counter 1', '0'], ['Tearing 1', '00'],
    ['Counter 2', '0'], ['Tearing 2', '00'],
    ['Pages total', String(type.pages)],
    ['Pages read', String(type.pages)],
  ];
  buildPages(type, uid, tlv).forEach((p, i) => fields.push([`Page ${i}`, hexBytes(p)]));
  fields.push(['Failed authentication attempts', '0']);
  return { type, fields };
}

export function nfcFileText(fields) {
  return fields.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n';
}

// Flipper NFC app limit: 21 characters (NFC_NAME_SIZE).
export function safeName(name) {
  const s = name.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 21);
  return s || 'Tag';
}

// Both mobile apps decode the fragment as form encoding (+ = space).
const formEncode = (s) => encodeURIComponent(s).replace(/%20/g, '+').replace(/%2F/g, '/');

// https://flpr.app/s#path=nfc/Name.nfc&Filetype=... opens the Flipper mobile app.
export function shareLink(name, fields) {
  const pairs = [['path', `nfc/${safeName(name)}.nfc`], ...fields];
  return 'https://flpr.app/s#' + pairs.map(([k, v]) => `${formEncode(k)}=${formEncode(v)}`).join('&');
}

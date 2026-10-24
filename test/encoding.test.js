import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecord, ndefRecord, ndefTlv, normalizeUrl, uriPayload, wifiPayload } from '../js/ndef.js';
import { nfcFields, nfcFileText, pickTagType, safeName, shareLink } from '../js/flipper.js';

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
const tlvFor = (kind, data) => ndefTlv(ndefRecord(buildRecord(kind, data).record));

// Decodes a share link the way the Android app does (URLDecoder, + = space).
function decodeLink(link) {
  const url = new URL(link);
  assert.equal(url.host, 'flpr.app');
  assert.equal(url.pathname, '/s');
  return url.hash.slice(1).split('&').map((kv) => {
    const [k, v] = [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)];
    const dec = (s) => decodeURIComponent(s.replace(/\+/g, ' '));
    return [dec(k), dec(v)];
  });
}

test('URL record matches the NFC Forum layout', () => {
  assert.equal(
    hex(tlvFor('url', { url: 'https://example.com' })),
    '03 10 d1 01 0c 55 04 65 78 61 6d 70 6c 65 2e 63 6f 6d fe',
  );
});

test('URI prefixes pick the longest match', () => {
  assert.equal(uriPayload('https://www.a.io')[0], 0x02);
  assert.equal(uriPayload('tel:+15551234')[0], 0x05);
  assert.equal(uriPayload('mailto:a@b.c')[0], 0x06);
  assert.equal(uriPayload('geo:1,2')[0], 0x00);
});

test('bare domains get https://', () => {
  assert.equal(normalizeUrl(' example.com/x '), 'https://example.com/x');
  assert.equal(normalizeUrl('tel:123'), 'tel:123');
});

test('text record has status byte and language', () => {
  const { record } = buildRecord('text', { text: 'hi' });
  assert.equal(hex(record.payload), '02 65 6e 68 69');
});

test('long payloads use a 4-byte length and 3-byte TLV length', () => {
  const tlv = tlvFor('text', { text: 'x'.repeat(300) });
  assert.equal(tlv[1], 0xff);
  assert.equal((tlv[2] << 8) | tlv[3], tlv.length - 5);
  assert.equal(tlv[4], 0xc1); // MB | ME | TNF well-known, no SR
});

test('Wi-Fi payload is a WSC credential', () => {
  const p = wifiPayload({ ssid: 'Home', password: 'secret123', security: 'wpa2' });
  assert.equal(hex(p.slice(0, 2)), '10 0e');
  assert.equal((p[2] << 8) | p[3], p.length - 4);
  assert.ok(hex(p).includes('10 45 00 04 48 6f 6d 65')); // SSID "Home"
});

test('smallest tag type that fits is chosen', () => {
  assert.equal(pickTagType(144).name, 'NTAG213');
  assert.equal(pickTagType(145).name, 'NTAG215');
  assert.equal(pickTagType(496).name, 'NTAG215');
  assert.equal(pickTagType(497).name, 'NTAG216');
  assert.equal(pickTagType(872).name, 'NTAG216');
  assert.equal(pickTagType(873), null);
});

test('.nfc file has valid header, BCCs, CC and data pages', () => {
  const uid = Uint8Array.from([0x04, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66]);
  const tlv = tlvFor('url', { url: 'https://example.com' });
  const { type, fields } = nfcFields(tlv, uid);
  const f = Object.fromEntries(fields);
  assert.equal(type.name, 'NTAG213');
  assert.equal(f['Device type'], 'NTAG/Ultralight');
  assert.equal(f['NTAG/Ultralight type'], 'NTAG213');
  assert.equal(f['Mifare version'], '00 04 04 02 01 00 0F 03');
  assert.equal(f['Pages total'], '45');
  assert.equal(f['UID'], '04 11 22 33 44 55 66');
  assert.equal(f['Page 0'], '04 11 22 BF'); // 0x88^04^11^22
  assert.equal(f['Page 2'], '44 48 00 00'); // 33^44^55^66
  assert.equal(f['Page 3'], 'E1 10 12 00');
  assert.equal(f['Page 4'], '03 10 D1 01');
  assert.equal(f['Page 7'], '6C 65 2E 63');
  assert.equal(f['Page 8'], '6F 6D FE 00');
  assert.equal(f['Page 9'], '00 00 00 00');
  assert.equal(f['Page 41'], '04 00 00 FF');
  assert.equal(f['Page 44'], '00 00 00 00');
  assert.equal(f['Page 45'], undefined);

  const text = nfcFileText(fields);
  assert.ok(text.startsWith('Filetype: Flipper NFC device\nVersion: 4\n'));
  assert.ok(text.endsWith('Failed authentication attempts: 0\n'));
});

test('share link round-trips through the app decoder', () => {
  const { fields } = nfcFields(tlvFor('text', { text: 'a+b & c=d' }));
  const pairs = decodeLink(shareLink('My tag!', fields));
  assert.deepEqual(pairs[0], ['path', 'nfc/My_tag.nfc']);
  assert.deepEqual(pairs.slice(1), fields);
  assert.ok(pairs.some(([k]) => k === 'NTAG/Ultralight type'));
});

test('safe names', () => {
  assert.equal(safeName('example.com'), 'example_com');
  assert.equal(safeName('  '), 'Tag');
  assert.equal(safeName('x'.repeat(40)).length, 21);
});

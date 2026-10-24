// NDEF encoding (NFC Forum NDEF + RTD URI/Text, Wi-Fi Simple Config, vCard).

const utf8 = new TextEncoder();

// NFC Forum URI identifier codes. Index = code.
const URI_PREFIXES = [
  '', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:',
  'ftp://anonymous:anonymous@', 'ftp://ftp.', 'ftps://', 'sftp://', 'smb://',
  'nfs://', 'ftp://', 'dav://', 'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:',
  'pop:', 'sip:', 'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://',
  'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:', 'urn:epc:tag:',
  'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:',
];

const TNF_WELL_KNOWN = 0x01;
const TNF_MIME = 0x02;

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

export function normalizeUrl(input) {
  const s = input.trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return 'https://' + s;
}

export function uriPayload(uri) {
  let code = 0;
  for (let i = 1; i < URI_PREFIXES.length; i++) {
    const p = URI_PREFIXES[i];
    if (uri.toLowerCase().startsWith(p) && p.length > URI_PREFIXES[code].length) code = i;
  }
  return concat([code], utf8.encode(uri.slice(URI_PREFIXES[code].length)));
}

export function textPayload(text) {
  return concat([0x02], utf8.encode('en'), utf8.encode(text)); // UTF-8, 2-byte language code
}

const WSC_AUTH = { open: 0x0001, wpa2: 0x0020, wpa: 0x0022 };
const WSC_ENC = { open: 0x0001, wpa2: 0x0008, wpa: 0x000c };

function wscTlv(type, value) {
  return concat([type >> 8, type & 0xff, value.length >> 8, value.length & 0xff], value);
}

const u16 = (n) => new Uint8Array([n >> 8, n & 0xff]);

// security: 'open' | 'wpa2' | 'wpa' (WPA/WPA2 mixed)
export function wifiPayload({ ssid, password = '', security = 'wpa2' }) {
  const credential = concat(
    wscTlv(0x1026, new Uint8Array([0x01])),            // Network index
    wscTlv(0x1045, utf8.encode(ssid)),                 // SSID
    wscTlv(0x1003, u16(WSC_AUTH[security])),           // Authentication type
    wscTlv(0x100f, u16(WSC_ENC[security])),            // Encryption type
    wscTlv(0x1027, utf8.encode(security === 'open' ? '' : password)), // Network key
    wscTlv(0x1020, new Uint8Array(6).fill(0xff)),      // MAC address (any)
  );
  return wscTlv(0x100e, credential);
}

function vcardEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

function vcardText({ name = '', phone = '', email = '', org = '', website = '' }) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:;${vcardEscape(name)};;;`, `FN:${vcardEscape(name)}`];
  if (org) lines.push(`ORG:${vcardEscape(org)}`);
  if (phone) lines.push(`TEL:${vcardEscape(phone)}`);
  if (email) lines.push(`EMAIL:${vcardEscape(email)}`);
  if (website) lines.push(`URL:${vcardEscape(normalizeUrl(website))}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

// A single-record NDEF message.
export function ndefRecord({ tnf, type, payload }) {
  const t = utf8.encode(type);
  const short = payload.length < 256;
  const header = 0x80 | 0x40 | (short ? 0x10 : 0) | tnf; // MB | ME | SR? | TNF
  const len = short
    ? [payload.length]
    : [payload.length >>> 24, (payload.length >> 16) & 0xff, (payload.length >> 8) & 0xff, payload.length & 0xff];
  return concat([header, t.length], len, t, payload);
}

// NDEF message wrapped in a Type 2 Tag TLV, with terminator.
export function ndefTlv(message) {
  const len = message.length < 0xff ? [message.length] : [0xff, message.length >> 8, message.length & 0xff];
  return concat([0x03], len, message, [0xfe]);
}

// Turns form data into the NDEF record plus the matching Web NFC record.
export function buildRecord(kind, data) {
  switch (kind) {
    case 'url': {
      const url = normalizeUrl(data.url);
      return {
        record: { tnf: TNF_WELL_KNOWN, type: 'U', payload: uriPayload(url) },
        webNfc: { recordType: 'url', data: url },
      };
    }
    case 'text':
      return {
        record: { tnf: TNF_WELL_KNOWN, type: 'T', payload: textPayload(data.text) },
        webNfc: { recordType: 'text', data: data.text, lang: 'en' },
      };
    case 'wifi': {
      const payload = wifiPayload(data);
      return {
        record: { tnf: TNF_MIME, type: 'application/vnd.wfa.wsc', payload },
        webNfc: { recordType: 'mime', mediaType: 'application/vnd.wfa.wsc', data: payload },
      };
    }
    case 'contact': {
      const payload = utf8.encode(vcardText(data));
      return {
        record: { tnf: TNF_MIME, type: 'text/vcard', payload },
        webNfc: { recordType: 'mime', mediaType: 'text/vcard', data: payload },
      };
    }
    default:
      throw new Error(`Unknown kind: ${kind}`);
  }
}

# Contributing

Keep it simple: plain HTML, CSS and ES modules. No framework, build step or runtime dependencies.

## Layout

| Path | Purpose |
|---|---|
| `index.html`, `styles.css` | UI |
| `js/app.js` | UI, saved tags, Web NFC |
| `js/ndef.js` | NDEF encoding (URI, Text, Wi-Fi, vCard) |
| `js/flipper.js` | Flipper `.nfc` file and `flpr.app` share link |
| `sw.js`, `manifest.webmanifest` | Offline and install |
| `test/` | Encoding tests |

`ndef.js` and `flipper.js` have no DOM code, so they run in Node tests.

## Rules

- `npm test` must pass. Add a test (known bytes) for every encoding change.
- Follow the [Flipper NFC file format](https://github.com/flipperdevices/flipperzero-firmware/blob/dev/documentation/file_formats/NfcFileFormats.md).
- Tag names: max 21 characters, `A-Z a-z 0-9 _ -` (Flipper limit).
- Capacity is the capability container size (`cc * 8`): 144, 496, 872 bytes.
- Test format changes on a real Flipper and phone.
- Adding or renaming a file: update `FILES` and bump `VERSION` in `sw.js`.
- Comments only for spec references and non-obvious numbers.
- Never commit secrets, IPs, hostnames or local paths.

## Develop

```sh
npm start   # http://<your-ip>:8080 for a phone on the same Wi-Fi
npm test
```

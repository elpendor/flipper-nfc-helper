# Flipper NFC Helper

An offline web app for making Flipper Zero NFC tags on your phone, so you don't type URLs on the D-pad.

**Open it on your phone:** <https://elpendor.github.io/flipper-nfc-helper/>

<img src="qr.svg" alt="QR code for the app" width="160">

Inspired by [FlipperMaker](https://github.com/FlipperMaker/flippermaker.github.io), which first used `flpr.app`
share links to send generated files to the Flipper mobile app.

Not affiliated with Flipper Devices Inc.

## How it works

1. Fill in the form and tap **Send to Flipper app**.
2. The Flipper Mobile App opens with the tag. Tap **Save**, then **Emulate**.

## Features

- Link, text, Wi-Fi and contact tags.
- iPhone and Android. Installable, works offline.
- Saved tags for one-tap reuse.
- **Write to Flipper over NFC** (Android): no Flipper app needed.
- Private: no server, no tracking.

## Limitations

- **Send to Flipper app** needs the Flipper Mobile App, paired over Bluetooth.
- **Write to Flipper over NFC** needs Chrome on Android.
- iPhones only read link tags.
- Must be served over HTTPS for offline use and NFC writing.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## References

- [Flipper NFC file formats](https://github.com/flipperdevices/flipperzero-firmware/blob/dev/documentation/file_formats/NfcFileFormats.md)
- Share-link parsing: [Android](https://github.com/flipperdevices/Flipper-Android-App/tree/dev/components/keyparser/impl/src/main/kotlin/com/flipperdevices/keyparser/impl/parsers/url),
  [iOS](https://github.com/flipperdevices/Flipper-iOS-App/tree/dev/Flipper/Packages/Core/Sources/Sharing)

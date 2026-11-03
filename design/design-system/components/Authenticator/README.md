# Authenticator

The built-in authenticator lists codes with a countdown ring, and QR pairing registers a new OTP secret, revealed only on request.

- **Material 3 primitive:** List, progress indicator (circular), card
- **Covers:** `authenticator`, `qr-pairing`, `element-locks`

## Provide
- Issuer, account, grouped digits, a countdown with a text equivalent, copy and reveal; QR on true white with quiet zone.

## Do
- Announce code changes, not every second.

## Don't
- Don't tint the QR or write it to disk, logs or screenshots.

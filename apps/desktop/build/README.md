# Desktop packaging icon

This is Google's existing Material Symbols Rounded `deployed_code` symbol, not a new Fleet logo. The imported reference at `design/design-system/README.md`, source commit `3aa1ca8`, specifies this symbol beside the product name and explicitly states that no logo exists. The local raster uses the reference's light-theme primary color, `#526600`, on transparency. Geometry is retained from the official outlined 24 px symbol.

## Source and license

- Source repository: <https://github.com/google/material-design-icons>
- Immutable source revision: `10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7`
- Original SVG: <https://github.com/google/material-design-icons/blob/10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7/symbols/web/deployed_code/materialsymbolsrounded/deployed_code_24px.svg>
- Original SVG SHA-256: `66e8b330ee102b6860f6de043e7a79ab278e3ac610cd99f5ea59633d526ac3c7`
- License: Apache License 2.0, included byte-for-byte in `LICENSE.material-symbols`.
- License SHA-256: `58d1e17ffe5109a7ae296caafcadfdbe6a7d176f0bc4ab01e12a689b0499d8bd`

`generate-icon.py` is a deterministic converter for this pinned symbol, using Python and Pillow. It checks the source digest, interprets only the source's supported line/quadratic commands, preserves the outline and three interior faces, and uses supersampling for small sizes. Run `python apps/desktop/build/generate-icon.py` to reproduce `icon.png` and the seven-size `icon.ico` (16, 24, 32, 48, 64, 128 and 256 px). These are packaging artwork, never runtime screenshots.

The client and three portable companions share `icon.ico`. Squirrel's `iconUrl` points to the exact public raw `main` asset; release preparation must verify that the icon is available there before invoking packaging. Icon configuration does not sign an executable. Executable signing remains disabled, and actual release signatures require independent inspection.

Because `signAndEditExecutable: false` also disables the builder's normal application resource editing, `apply-icon.cjs` runs at `afterPack` and invokes only the builder's existing `rcedit --set-icon` resource operation. It does not call a signer, select a certificate or change the unsigned packaging settings. The installed builder's Squirrel target edits the final installer through its shared `win.icon` resource path; portable wrappers also use `win.icon`. The unsupported `squirrelWindows.setupIcon` field is deliberately absent.

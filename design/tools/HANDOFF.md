# Local tools design handoff

Two productive workspaces share the existing application theme and language preferences. No external assets are required.

## Base64 workspace

A labelled source editor and optional file picker lead into explicit encode/decode actions. Options expose alphabet, strictness, padding, wrapping and character encoding. Results show byte sizes, safe text or hex previews, SHA-256, explicit copy and download. Processing runs in a module worker, with cancellation terminating the worker. Payloads never enter storage, diagnostics or network requests. Invalid input replaces no completed output. Files are bounded to 8 MiB; streaming, pause/resume, ZIP export and durable undo are explicitly unavailable.

## Converter workspace

A batch picker feeds a sequential worker queue with individual outcomes and explicit cancellation. Compatible source/target pairs are selected from grouped capability cards. JSON, CSV and TSV use bounded local parsing; PNG, JPEG and WebP use detected signatures, header dimension checks and actual browser decode/encode. Codec probes disable unavailable output formats. Originals remain unchanged. Image conversion explicitly warns about metadata, animation, transparency and lossy encoding. Text previews render only escaped React text, never HTML. Downloads require explicit clicks.

## States and accessibility

States: empty, selected, running, cancelled, completed, validation failure and unsupported capability. Native labels, buttons, selects, file pickers and progress make keyboard operation direct. Status updates are polite; failures have a bounded localized explanation without source content. A one-column layout supports 320 CSS pixels; two columns begin at 800 pixels. Theme colors inherit application variables. English, Cantonese and bilingual copy use useUI().t.

## Verification and remaining scope

Core tests cover Base64 canonical padding, alphabet isolation, encoding, malformed data URLs, CSV quoted fields and unsupported input. Runtime evidence must cover normal/minimum viewport, all language/theme modes and 100/125/150/200 percent scales. PDF/audio/video/archive adapters, YAML/TOML/XML, persistent unlimited queues, storage preflight, complete category regex builders and packaged codec proof remain unavailable. Browser codec availability is a capability probe, not packaged-artifact acceptance.

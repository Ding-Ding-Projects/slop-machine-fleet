# Local tools

The authenticated application provides two explicit, local-only workflows. Open **Local tools** and select **Base64 toolkit** or **File converter**. Payloads are never sent to an API or placed in logs. The bounded editor uses memory. The streaming Base64 workspace requires explicit consent before using private browser temporary storage and removes exact owned copies on clear; crash-retention limits are disclosed. Metadata-only history persists separately. Tool switching retains drafts and participates in lifecycle safety. Copy and download are explicit actions.

## Base64

For large or multiple files, streamed text/data URLs, ZIP output and transactional metadata history, see [streaming Base64](streaming-base64.md).

Enter text or choose one file. Select UTF-8, UTF-16 LE/BE or Latin-1, then encode or decode. Standard and URL-safe alphabets, optional padding, custom line wrapping and strict decoding are supported. Lenient decoding ignores ASCII whitespace and accepts omitted padding; both modes reject noncanonical trailing bits. Strict validation reports the invalid-character offset without repeating content. Data URLs support Base64 and non-Base64 percent-encoded octets with bounded MIME and parameter syntax. Literal plus signs stay plus signs; non-UTF-8 payload bytes are preserved. Encoding a data URL uses the standard alphabet regardless of ordinary output options.

Encoding verifies a decode round-trip with SHA-256. Results display original/output sizes and output SHA-256. The escaped text preview is bounded to 65,536 characters, with a hexadecimal fallback for nontext bytes. Invalid UTF-8 is not replaced silently. Full downloads remain available when the preview is truncated. Copy appears only when the complete text is available.

## File conversion

Structured data supports JSON, CSV and TSV. JSON input is a rectangular array of arrays containing scalar values. Object records, nested values and uneven row widths are rejected. CSV/TSV cells become strings, and JSON null becomes literal text `null`; table conversions intentionally do not preserve JSON scalar types. Quoting handles embedded delimiters, quotes and line breaks. There is no inferred header or silent flattening. Formula-like cells remain unchanged, so exercise care when importing exported text into a spreadsheet application.

Images support PNG, JPEG and static WebP when the browser's worker canvas codec returns the requested MIME and actual signature. Input type is detected from bytes, dimensions are validated before decoding, and output is decoded again to verify dimensions. Animation is rejected when detected. JPEG uses quality 90% and a white transparency background. WebP uses quality 90%. Metadata and color profiles may be removed. Conversion is an explicit action after these disclosures.

## Bounds and cancellation

Each input and output is limited to 8 MiB. Base64 expansion can therefore reject a file smaller than 8 MiB when its encoded output exceeds the output bound. Images are limited to 8192 pixels on either side and 16 million pixels total. A batch has at most 100 files and 32 MiB of selected input; completed output retention is also bounded to 32 MiB. Files process sequentially in a worker with a 30-second timeout per operation. Cancellation terminates the worker and invalidates stale completions. Sources are never overwritten. Each download uses a temporary object URL that is revoked after activation.

## Verification and unavailable capabilities

Seven focused tests cover byte round-trips, strict negative cases, text encodings, data URLs, quoted tables, resource rejection and image-header bounds. TypeScript compilation passes for the complete web source.

No runtime or packaged acceptance is claimed here. The Base64 streaming, ZIP and metadata-history additions have separate focused evidence documented in the linked article; actual browser acceptance remains pending. Remaining converter requirements include persistent unlimited queues and recovery, destination-space preflight, category regex catalogs, PDF tools, audio/video/archive adapters and YAML/TOML/XML adapters. The UI lists these unavailable capabilities rather than claiming universal conversion. Parent integration owns navigation, command-palette access, built visual verification and deployment.

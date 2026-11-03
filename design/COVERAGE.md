# Design coverage

Which user-facing requirements have a design in `design-system/components/`. A design here is a visual reference, not an implementation.

| Requirement | Designed in |
| --- | --- |
| Material 3 Expressive conformance | Every component; colour roles in `tokens.json` |
| Frameless window with custom title bar | TitleBar |
| Browser-style tabs (pin, groups, overflow, tab search) | TabStrip |
| Primary destinations | NavigationRail |
| Command palette on Ctrl+Shift+F with live settings and teleport | CommandPalette |
| Context menu on every element with working shortcuts | ContextMenu |
| Regex builder beside every search | SearchWithRegexBuilder, ContextMenu, CommandPalette, AppearanceEditor |
| Non-blocking notifications and notification centre | Notifications |
| Language modes (English, Cantonese, bilingual) | LanguageMode |
| Funny-level sliders and dialog emoji switch | FunnyLevel |
| Personal wording file import, drop and reset | VocabularyDrop |
| School mode (renamable, unlockable) | SchoolMode |
| Narrator voices and action sounds | VoiceAndSound |
| Scheduled settings | ScheduledSettings |
| App renaming | TitleBar (display name), README Logo section |
| ADHD modes | FocusModes |
| Dim sum surprise from the public photo source | DimSumSurprise |
| Motion with reduced-motion path | README Motion section; StatusChip, LiveChart, Authenticator |
| Live charts | LiveChart |
| Per-element appearance editor | AppearanceEditor |
| Infinite colour picker and translator | ColorPicker |
| Collapsible filters and statistics | FilterPanel, Chips |
| Accessibility, sizing, contrast | Tokens (`target-min`, contrast-checked roles), every component |
| Functional UI and truthful empty states | EmptyState, WorkerCard |
| Onboarding wizard with save and resume | SetupWizard |
| Rich controls where values are shown | WorkerCard, CostReview, LiveChart |
| Guided forms with suggested defaults | TextField, SetupWizard, CostReview |
| Per-control info icon with example and playground | InfoIconButton |
| Settings that explain themselves | SelectionControls, InfoIconButton |
| Presets for blank editors | EmptyState, AppearanceEditor (presets) |
| Two-key super confirmation | SuperConfirmation |
| Toy locks on elements and the unlock ladder | ElementLock |
| Support tickets recovery desk | SupportDesk |
| Built-in authenticator and QR pairing | Authenticator |
| Honest costs | CostReview |
| Local version history | History |
| Export in every format | ExportDialog |
| Bulk actions everywhere | BulkActionBar, WorkerCard selection |
| Changelog viewer | Changelog |
| Offline documentation | DocsBrowser |
| Provider-authored text rendered | Terminal (output), DocsBrowser |
| Progress and recovery in place | WorkerCard (failed launch), BulkActionBar, SetupWizard |
| Front-screen version provenance | ProvenanceFooter |
| Built-in tools hub | ToolsHub |
| Product: guided sign-in and pairing | DeviceLoginPanel, WorkerCard |
| Product: cost review and machine cap | CostReview |
| Product: worker terminal | Terminal |

## Designed only at hub level (full screens still to design)

- File converter, Base64 toolkit, Minecraft server manager and its world generator (with the chunk-size canvas), local Ollama suite, external editor hand-off, drawing and annotation.
- The full regex builder screen (flavours, debugger, library), the full settings surface with grouped search, and the public documentation site.

## Not design surfaces

Build entry points, installers, signing, updates, release pipeline, repository records, status integrations and vocabulary tooling have no visual design in this pass. They are tracked in the implementation applicability matrix.

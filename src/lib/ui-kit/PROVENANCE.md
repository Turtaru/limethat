# UI kit source

Copied from `godenk/ui-kit/src/lib/`. This directory is Limethat's authoritative UI library source; edit it here. No runtime or build dependency on the Godenk checkout exists.

The showcase and demo assets are intentionally excluded. Application routes, folder access, persistence, and model translation belong outside this directory. Appearance belongs in `styles/`; components own semantic markup and local interaction.

Integration additions include precision-aware dates, image snippets, complete editor drafts, configurable validation, and the original screen prototype's floating dock/sticky toolbar layout. Creation/editing components render full pages with caller-owned drafts, not dialogs. Editor pages, pickers and the viewer accept application-owned dock snippets; only pickers and the viewer use native modal surfaces. Keep these generic: no archive paths, storage operations, or application URLs.

Diecast Archive Lite v0.2.2

- Compact density across the interface.
- Settings > Catalogue view: Compact (model and brand/make only) or Detailed (all six fields).
- Edit and Delete icons remain accessible in both modes.
- Mode preference persists separately in localStorage; catalogue storage and JSON format are unchanged.
- Version remains visible in the header.
- Offline cache version updated.

Export a JSON backup before replacing the deployed files. Test both views and reload to verify preference persistence.

V0.2.3: Settings-only Archive Editing mode. Confirm to enable; floating Done button to exit. Editing defaults off on page load. No record schema changes.


v0.3.0: Optional comma-separated tags in Add/Edit. Tags are searchable using the existing search bar. A bottom-right icon shows tag count and expands labels; selecting a label searches it. Existing records and version 1 JSON backups remain compatible.
\nv0.3.1: Emoji + label per tag, multiple tags per diecast, reusable label suggestions, expanded searchable labels, backward-compatible string tags, responsive emoji wrapping.\n
v0.3.2: Add menu (Diecast/Tag), independent persistent tag library, tag management in Settings, selectable tags in diecast editor, backup v2 with v1 restore compatibility. Always export a backup before upgrading.

v0.3.2 search: typing suggests matching registered tags. Tap to add a tag filter; multiple selected tags match ANY tag (OR), while text further narrows matches (AND). Tap a chip to remove it or Clear filters to reset.

---
page: settings
pageHash: 4f55767a7280e9a20c261db2f16278fc1832da3d85f462b6fd5bb5dca3dde800
sonora: [kit:mobile/settings, kit:desktop/settings]
---

# Settings

Canvas renders: `settings/canvas-phone.png` (390 px), `settings/canvas-desktop.png` (1440 px).
Sonora UI kit renders, the design this page is compared against: `sonora/kit-mobile-settings.png`
(the mobile kit driven to its settings sheet) and `sonora/kit-desktop-settings.png` (the desktop
kit's Settings destination). No Spotify screen was needed for intent.

## What the Sonora UI kit renders show

- **Sonora mobile kit.** Settings opens as a sheet over Browse: a "Browse" back link, a
  "Settings" heading, the "Library folder" `FieldRow`, then three `SettingRow` cards
  (Auto-download requests, Wi-Fi only, Gapless playback), 10 px apart, 20 px below the field.
- **Sonora desktop kit.** Settings is a rail destination: title "Settings" in the app bar, the
  same field and four setting cards in a column capped at the form width (640 px), starting
  near the top of the content pane.

## What the canvas page draws

`PageBody` at the form width, a "Server" `FieldRow`, then the mobile kit's first two
`SettingRow` cards with its descriptions, in a one-column `LayoutGrid` 10 px apart, the field and the rows
each in an untitled `Section` for the gap between.

Measured in the browser (`getBoundingClientRect`), kit against page: page margin 16 px against
16 px on the phone, 28 px against 28 px on desktop; desktop column 640 px against 640 px; rows
10 px apart against 10 px on both.

## Differences

- Matches, after the one-accent change: the switches stay in the violet accent in both kits
  and on the page; settings are not play-related, so nothing here turned rose. Re-shot, the
  renders are otherwise unchanged.
- Fixed: the first draw split the rows under "Playback" and "Downloads" headings. At desktop
  density `SectionHeader` is the feed's display heading, far heavier than either kit, which
  shows one unheaded list. The rows are now one list, as both kits draw them.
- Fixed: the field and the rows had no gap between them in plain markup; untitled `Section`s
  carry it, as the kits' column gap does, and the rows sit 10 px apart, as in both kits (they
  were 8 px).
- Fixed: the page sat 8 px further in on every side, the browser's own body margin. The web
  app's base styles now reset it, as the kits' pages do.
- Fixed: the desktop column was 584 px, since `PageBody` capped its width with the margin
  inside it. Sonora's `PageBody` now caps the content alone, 640 px, as the desktop kit does.
- Fixed: a fourth "Show explicit content" row came from the desktop kit. The plan names no
  explicit-content setting, so it is gone, and the page follows the mobile kit's rows.
- Fixed: the first two descriptions now read as the mobile kit's ("Fetch approved requests
  automatically.", "Pause transfers on mobile data.").
- Open: the field sits 24 px above the rows on the phone, where the mobile kit leaves 16 px;
  `Section`'s phone gap is 24 px, and a page cannot set a gap between two sections. Desktop
  matches, 20 px against 20 px.
- Changed on purpose: no "Gapless playback" row. Gapless playback is always on, so it is not a
  setting; both kits still draw the row.
- Open: the desktop kit's wording of the first two rows differs from the mobile kit's; one
  placeholder serves both, so the page carries the mobile kit's.
- Changed on purpose: "Library folder" is "Server", since Auralis reads a server, not a
  folder on the device. Its value is a placeholder address, not a real host.
- Shell, part 2: no "Settings" title, back link (mobile sheet) or app bar; the desktop kit's
  content also starts lower, under the front layer's header, which the shell brings.

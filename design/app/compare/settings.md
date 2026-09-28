---
page: settings
pageHash: dc38c656ba28b1973743c3467ef16015aa9f949822fe3d65138ac90d5fe9e2c0
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

`PageBody` at the form width, a "Server" `FieldRow`, then four `SettingRow` cards in a
one-column `LayoutGrid` with a small gap, each in an untitled `Section` for the gap between.

## Differences

- Fixed: the first draw split the rows under "Playback" and "Downloads" headings. At desktop
  density `SectionHeader` is the feed's display heading, far heavier than either kit, which
  shows one unheaded list. The rows are now one list, as both kits draw them.
- Fixed: the field and the rows had no gap between them in plain markup; untitled `Section`s
  carry it, as the kits' 20 px column gap does, and the rows sit `--spacing-sm` apart.
- Changed on purpose: "Library folder" is "Server", since Auralis reads a server, not a
  folder on the device. Its value is a placeholder address, not a real host.
- Shell, part 2: no "Settings" title, back link (mobile sheet) or app bar; the desktop kit's
  content also starts lower, under the front layer's header, which the shell brings.

---
page: settings
pageHash: c909a275e096f4aac51154388825213dd84f7c3a1968865ed69958a59ef1d785
sonora: [kit:mobile/settings, kit:desktop/settings]
---

# Settings

Canvas renders: `settings/canvas-phone.png` (390 px, the bottom bar's layout) and
`settings/canvas-desktop.png` (1440 px, the labelled rail with the Now Playing panel), both in the
app shell. Also compared: Sonora's Backdrop cards, the latest mockups of the shell itself.
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

The page in the app shell, Sonora's backdrop. The back layer holds the heading "Settings", led by
a close control, since Settings closes to whatever opened it. The front layer has no subheader,
since Settings has no section titles to spy, just `PageBody` at the form width: a "Server" `FieldRow`, then the
mobile kit's first two `SettingRow` cards with its descriptions, in a one-column `LayoutGrid` 10 px
apart, the field and the rows each in an untitled `Section` for the gap between. Around it: the
bottom bar (nothing lit) and the mini-player on the phone; on desktop the labelled rail with
Settings lit at its foot, the docked transport bar and the Now Playing panel.

Measured in the browser (`getBoundingClientRect`), kit against page: page margin 16 px against
16 px on the phone, 28 px against 28 px on desktop; desktop column 640 px against 640 px; rows
10 px apart against 10 px on both; on desktop the field's label 120 px from the top against about
184 px in the kit, whose content starts under a header band the page no longer has.

## Differences

- Matches, after the one-accent change: the switches stay in the violet accent in both kits
  and on the page; settings are not play-related, so nothing here turned rose.
- Changed on purpose, from the Backdrop cards: the kits draw the old `AppShell`; the page now sits
  in the backdrop, its content on the rounded 1dp front layer under the heading.
- Changed on purpose: on the phone the mobile kit opens Settings as a sheet over Browse, with a
  "Browse" back link and a "Settings" heading inside the content; here Settings is a page of its
  own, its heading on the back layer and a ✕ leading it, which returns to whatever opened it. The
  kit's sheet also keeps Browse's filters above it; the page has none.
- Changed on purpose: on desktop Settings is lit at the rail's foot (NavRail `footerItems`) and
  closes with a ✕ before its heading; the desktop kit lists it among the destinations with no close.
- Changed on purpose: no subheader on the front layer, so no empty band above the field. Settings
  has no section titles for a scroll spy to show. The field's label sits 84 px from the top on the
  phone, right under the heading, where the kit's sheet puts it at about 215 px under Browse's
  heading, filters and back link, and 120 px on desktop against about 184 px.
- Open: the field sits 24 px above the rows on the phone, where the mobile kit leaves 16 px;
  `Section`'s phone gap is 24 px, and a page cannot set a gap between two sections. Desktop
  matches, 20 px against 20 px.
- Changed on purpose: no "Gapless playback" row. Gapless playback is always on, so it is not a
  setting; both kits still draw the row.
- Changed on purpose: no "Show explicit content" row, from the desktop kit. The plan names no
  explicit-content setting.
- Open: the desktop kit's wording of the first two rows differs from the mobile kit's; one
  placeholder serves both, so the page carries the mobile kit's.
- Changed on purpose: "Library folder" is "Server", since Auralis reads a server, not a
  folder on the device. Its value is a placeholder address, not a real host.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Settings lit at the rail's foot.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-icon`).

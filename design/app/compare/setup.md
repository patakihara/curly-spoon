---
page: setup
pageHash: 69380910f66e1ec894b7f4746f789ccf77f1e6b2c1060919c177c0524be518ff
sonora: [none]
---

# Setup

Canvas renders: `setup/canvas-phone.png` (390 px) and `setup/canvas-desktop.png` (1440 px). No
Sonora UI kit screen exists for Setup (nav.json names `none`); the page is compared with the
Search, Fields, Settings & Sliders card (`FieldRow`, `SettingRow`), the Browse, Status &
Disclosure card (`StatusBanner`) and the kickoff project's onboarding screen (tag `legacy`,
`Auralis-Redesign.dc.html`): a note, then Audiobookshelf's server URL, username and password,
Connect or Skip, then Jellyfin's URL.

## What the canvas page draws

A bare page: no rail, bottom bar, mini-player, player panel or account avatar, since nobody is
signed in to the app yet; the heading "Setup" as a top app bar on the phone and over the front
layer on desktop, with no close control. Heading and content share one centred column
(`BackdropShell column`), the heading starting at the page margin as the content does. In
`PageBody` at the form width:

- An info `StatusBanner`: "Nobody signs up in Auralis: everyone signs in with their household
  account. Setup makes you its admin and connects the servers you already run."
- **Step 1 of 4, One-time code**: a `FieldRow` for the code the server wrote to its data folder.
- **Step 2 of 4, Services**: `FieldRow`s with Audiobookshelf's, Jellyfin's and the household
  sign-on's addresses.
- **Step 3 of 4, Providers**: `SettingRow`s for Prowlarr, AudiobookBay, YouTube Music and
  ListenBrainz, each saying what it is for.
- **Step 4 of 4, Requests**: the `SettingRow` "Approve requests", off.
- A primary "Finish setup" button, to Browse.

**Empty state**, per nav.json (not drawn): setup already done goes straight to Browse.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Changed on purpose: no username or password fields, where the kickoff screen asked for
  Audiobookshelf's. Everyone signs in through the household sign-on; Auralis holds no passwords.
- Changed on purpose: the first step is the one-time code, which claims the admin role, and the
  steps name themselves in each section's eyebrow ("Step 1 of 4"); the kickoff screen had no code.
- Changed on purpose: no "Skip for now". Browse makes no sense before the servers are connected.
- Changed on purpose: the page is bare (nav.json's `presentation: bare`), with nothing of the app
  around it; the kickoff screen sat inside the app's navigation.
- Changed on purpose: with nothing beside it, the page sits in one centred column on desktop,
  Sonora's `BackdropShell column`, and its heading starts at the page margin on both platforms,
  16 px on the phone, level with the content.
- Open: the providers listed are the plan's search and recommendation sources as placeholder copy;
  which ones Setup offers is settled with the admin endpoints.

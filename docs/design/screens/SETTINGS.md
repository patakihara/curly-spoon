# Settings and Onboarding — shared behaviour spec (wave 16e-settings)

Status: **spec only, nothing implemented against it yet.** This is the shared spec both
`16e-settings-W` (web) and `16e-settings-A` (Android) build from, independently, followed by a
`16e-settings-P` parity review by an agent that wrote neither half. Per `ROADMAP.md` §16 this is
the **last** `16e` screen — after book detail, podcast detail, album detail, search, now playing,
and For You/browse.

**Binding contract vs. recon — read this before anything else.** §6, §7, §8 and §11 are the
**contract**: every sentence in them is something an implementing wave must satisfy or explicitly
decline with a reason. §2, §3 and §4 are **recon** — evidence gathered to justify the contract,
never a requirement in their own right. A file:line citation anywhere in this document is
evidence for the sentence stating a decision, not itself the requirement.

**Re-verify the recon, don't trust it.** Four of this project's prior screen specs carried a
wrong count or a wrong claim — `SEARCH.md` said `MusicRow` had two other call sites where it has
nine and said track rows used `MusicRow` when they use a separate, art-less component; one caused
a whole wave to ship a broken screen before anyone noticed. Every count in §2–§4 below is written
with the exact command that produced it. **Before building anything, re-run that command against
the tree you're building on and report the number you get** — code moves between when this is
written and when a wave picks it up, and the number in this document may already be stale by
then.

---

## 1. What these screens are for

**Settings** is the one screen every other `16e` triple deferred to: theme mode, the 17-preset
accent colour picker (`docs/USER_DECISIONS.md`; Symphony's picker, not artwork-derived colour —
see `docs/HANDOVER.md`'s still-open queue item `dbfb46e`), connected-service status, and — web
only today — provider/indexer and per-medium request configuration. It is reached from app chrome,
never from the primary nav destinations (`SONORA.md` §7: `settings`/`onboarding` map to **no** rail
highlight — `activeKey`'s `''` entry for both).

**Onboarding** is first-run: pointing the app at a server and signing in, before any of the five
primary destinations exist to navigate to. The two platforms solve **different problems** here —
web is served same-origin from the BFF and has no server-discovery step at all; Android is a
separate origin and must first be told which BFF to talk to. §2.4 and §6.7 are explicit about
which parts of the two flows correspond and which do not.

Both screens sit outside the docked shell's primary chrome (`16d`'s scroll fix and `16e-foryou`'s
rename do not touch either), so nothing here depends on shell-level nav-rail/bottom-bar rendering
except §6.1's one addition to `AuralisShell`.

---

## 2. Content inventory — what each platform ships today

**Recon.** Every claim below cites the file and line it came from, and the command that would
re-derive any count.

### 2.1 Web Settings — `apps/web/src/features/settings/SettingsPage.tsx` (158 lines,

`wc -l apps/web/src/features/settings/SettingsPage.tsx`)

Six `<h2>` sections, verified with `grep -n '<h2>' apps/web/src/features/settings/SettingsPage.tsx`
plus the three imported section components' own headings:

1. **Appearance** (`:54`) — the 3-way theme-mode row (`MODES: ThemeMode[] = ['system', 'light',
'dark']`, `:27`) rendered as `packages/ui`'s `Button` (`variant={mode === candidate ? 'filled'
: 'outlined'}`, `:57-111`), then the 17-swatch accent picker (`ACCENT_PRESETS.map`, `:116-127`,
   plain `<button className="auralis-color-swatch">`, not a shared component).
2. **Connected services** (`:132`) — Audiobookshelf-only status chip, `Chip variant="assist"`.
3. **Music (Jellyfin)** — `JellyfinConnectSection.tsx` (168 lines), `<h2>Music (Jellyfin)</h2>`.
4. **Indexers and download clients** — `ProviderSettingsSection.tsx` (243 lines),
   `<h2>Indexers and download clients</h2>`.
5. **Book requests** — `RequestSettingsSection.tsx` (155 lines), `<h2>Book requests</h2>`.
6. **Music requests** — `MusicRequestSettingsSection.tsx` (122 lines), `<h2>Music requests</h2>`.
7. Sign out button (`:152-154`).

**Every one of these six sections' own page-level CSS is still on `--m3-*`, unmigrated by any
16c wave.** `grep -n "m3-" apps/web/src/styles/app.css` between the `.auralis-onboarding` block
(`:515`) and the `.auralis-service-row` block (`:646`) — `.auralis-onboarding*`, `.auralis-field*`,
`.auralis-field-error`, `.auralis-services-list`, `.auralis-service-fieldset`,
`.auralis-settings-row`, `.auralis-color-swatch`, `.auralis-service-row` all read `--m3-space-*`,
`--m3-type-*`, `--m3-on-surface-variant`, `--m3-outline*`, `--m3-shape-*`, `--m3-primary`,
`--m3-error`/`--m3-error-container`/`--m3-on-error-container`. **This is a class of `--m3-*`
consumer `docs/HANDOVER.md`'s "remaining `--m3-*` consumers" list never named** — that list
(`Fab, ListItem, Marquee, NavigationBar, SearchField, Snackbar, TopAppBar`) only tracks
`packages/ui` primitive-level usage, not `apps/web`'s own page-level `app.css` rules. §6.5 makes
this the contract.

**The accent swatch's own selection ring is the same bug `16f-A-2` already fixed on Android, and
web still has it.** `.auralis-color-swatch[aria-pressed='true'] { outline: 3px solid
var(--m3-primary); ... }` (`app.css:635-638`) — `--m3-primary` is Sonora's _fixed_ chroma role
(`16c-2-W-1`), not the picker's own `--accent`/`--accent-ink`. `e2e/app/settings-a11y.spec.ts:144-158`
already pins this as the _documented current state_ ("Scope discipline: `--m3-primary` is still
Sonora's fixed chroma role and must NOT respond to the accent picker — only `--accent` does, until
a later wave migrates more components onto it"). That later wave is this one; §6.4 is the fix.

### 2.2 Web Onboarding — `apps/web/src/features/onboarding/` (four files: `OnboardingCard.tsx` 32

lines, `SetupPage.tsx` 86 lines, `LoginPage.tsx` 105 lines, `ServicesPage.tsx` 73 lines —
`wc -l apps/web/src/features/onboarding/*.tsx`)

Three steps, each wrapped in the shared `OnboardingCard` (`Card variant="elevated"`, a
`"Step {n} of {totalSteps}"` label, title, optional subtitle):

1. **Setup** (`step=1`) — `"Connect to Audiobookshelf"`. Probes `POST /api/v1/setup` with the
   Audiobookshelf base URL before persisting it; a failed probe renders `describeSetupError`'s
   diagnosis rather than a generic failure.
2. **Login** (`step=2`) — `"Sign in"`. Username/password → `POST /api/v1/auth/login`. Submit is
   `disabled={mutation.isPending || !username || !password}` (`:89`).
3. **Services** (`step=3`) — `"Optional services"`. Two `ComingSoonService` fieldsets, both
   `disabled`, both captioned **"Support ships in a later phase"** (`:53`, `:58`). **This is
   stale and wrong**: Jellyfin has had its own connect flow since phase 8/9
   (`JellyfinConnectSection.tsx`, §2.1 item 3) and the download client/indexer config has existed
   since phase 6 (`ProviderSettingsSection.tsx`). Both fields the fieldsets pretend don't exist
   yet are real, configurable, working sections of the very Settings page one skip away. §6.9 is
   the fix.

`e2e/app/onboarding.spec.ts` (108 lines) is its **own Playwright project everything else in
`e2e/app` `dependencies` on** (`playwright.config.ts`) — it drives the full setup→login→services
flow and writes the `storageState` every other `app` spec starts signed in from. It asserts on
`onboarding-card`, `onboarding-step` (exact text `'Step 1 of 3'`/`'Step 2 of 3'`/`'Step 3 of 3'`),
`setup-base-url-input`, `setup-submit`, `setup-error`, `login-username-input`,
`login-password-input`, `login-submit`, `services-skip`, `login-form`
(`grep -n "getByTestId" e2e/app/onboarding.spec.ts`). **Any restyle must preserve every one of
these testids and the exact step-count strings** — this file's unusual blast radius means a break
here fails the entire `app` project, not just this spec.

### 2.3 Android Settings — `apps/android/app/src/main/java/net/develivarr/auralis/features/settings/`

(`SettingsScreen.kt` 204 lines, `ThemeViewModel.kt`, `AccentPreset.kt` 31 lines)

Two sections only, per `16f-A-1`'s own doc comment (`SettingsScreen.kt:47-49`: "Deliberately two
controls only... Server config, account/login, downloads and playback settings are not here"):

1. **Theme** — `FilterChip` per mode, `ThemeModeOptions` order **`Light, Dark, System`**
   (`:157-162`), selected chip reads `AuralisAppTokens.current.accent`/`.accentContrast`.
2. **Accent** — `sonoraAccentPresetOptions.chunked(6)` in a plain `Row`/`Column` grid (no
   `LazyVerticalGrid`), 40dp circular swatches, selection ring reads
   `AuralisAppTokens.current.accentInk` (`16f-A-2`, `:173-179` doc comment — this is the fix web
   still owes, §2.1/§6.4).

**Reachable only from the For You (Browse) screen's own `TopAppBar`**, alongside `Downloads` and
`Requests` — a plain `TextButton` (`ForYouScreen.kt:122-126`). `AuralisShell.kt`'s own doc comment
(`:64-66`) states the architecture reason: **the shell owns only the bottom chrome (nav bar/rail +
mini player); every screen owns its own `TopAppBar`.** `grep -rn "Routes.SETTINGS" apps/android/app/src/main`
finds exactly one navigation call site, confirming Settings is reachable from nowhere except
Browse. §6.1 is the fix.

**The 17-preset accent list matches web's byte for byte — confirmed, not assumed.** Same 17 hue
names in the same order (`SonoraAccentPresetLabels`, `AccentPreset.kt:20-23`, cross-checked
against `packages/ui/src/tokens/color.ts:105-123`'s `ACCENT_PRESETS`), same 17 hex values in the
same order (`ui/theme/Color.kt:45-61`'s `SonoraPalette.Accent*` literals vs. `color.ts`'s literals
— both read directly, e.g. `AccentViolet = Color(0xFF8B5CF6)` against `{ name: 'violet', hex:
'#8b5cf6' }`). Nothing to fix here; §6.3 is a pin, not a correction.

### 2.4 Android Onboarding + Login — `apps/android/app/src/main/java/net/develivarr/auralis/features/onboarding/OnboardingScreen.kt`

(80 lines) and `features/login/LoginScreen.kt` (91 lines)

**These two screens solve a different problem from web's `SetupPage`, and conflating them would
be a real spec error — read `OnboardingViewModel.kt`'s and `ServerConfigRepository.kt`'s own doc
comments before assuming otherwise.** Android's `OnboardingScreen` collects the **Auralis BFF's
own address** (`serverConfigRepository.setBaseUrl`, stored under `bff_base_url`) — it never calls
`POST /api/v1/setup` and never touches Audiobookshelf at all. `ServerConfigRepository.kt:6-9`:
"Unlike the web app, which is served same-origin from the BFF, Android is a separate origin and
needs its own first-run 'point the app at your server' setting — distinct from the Audiobookshelf
URL that the server's own `/api/v1/setup` endpoint configures." **Web has no equivalent step
because it needs none** (same-origin). Do not treat this as a parity gap; §6.7 makes it explicit.

`AppStartViewModel.kt` (52 lines) is the router: no stored BFF URL → `Routes.ONBOARDING`; a URL
but `apiClient.me()` throws → `Routes.LOGIN`; otherwise → `Routes.HOME`. **It never checks whether
Audiobookshelf itself is configured on that BFF** — if `OnboardingScreen`'s address points at a BFF
that never ran `/api/v1/setup`, `LoginScreen`'s login call fails and surfaces as a generic
`LoginUiState.Error`, with no path back to a setup step. Named in §7 as a real, narrow gap, not
fixed here (it needs Android's own `/api/v1/setup` flow, which is new feature work, not a restyle).

**Neither screen has any Sonora treatment at all** — bare `Scaffold`/`TopAppBar`/`OutlinedTextField`/
`Button`, default Material3 colours (`MaterialTheme.colorScheme.error` for the error line, no
custom typography, no card, no branding, no step indicator). Confirmed by reading both files in
full; neither imports anything from `ui.theme` beyond the ambient `MaterialTheme`.

**`LoginScreen`'s submit button has no empty-field guard** — `enabled = uiState !is
LoginUiState.LoggingIn` (`:84`) only, unlike web's `disabled={... || !username || !password}`. A
real, small functional gap; §6.8 is the fix.

**Android has no equivalent of web's step-3 `ServicesPage`.** `OnboardingScreen` → `LoginScreen` →
`Routes.HOME` directly (`AuralisNavHost.kt:284-285`). Android's Jellyfin connection is not
onboarding-adjacent at all — `grep -rln "Jellyfin" apps/android/app/src/main/java/.../features/`
finds it consumed directly by the music screens, with **no connect/configure screen anywhere in
the tree** (unlike web's dedicated `JellyfinConnectSection`). §7 rules this out of scope.

### 2.5 What Sonora's own mock shows for these two screens

`docs/design/sonora/Auralis-Redesign.dc.html`'s `screens.settings`/`screens.onboarding` arrays
(`:745-770`) are recon only — they are the mock's illustrative content, not a literal target;
several of the fields they show don't exist as real features on either platform (see below).

**Settings mock, four sections:** "Servers" (Audiobookshelf/Jellyfin connection status rows plus
a **"Prowlarr indexers" row** — this one _does_ correspond to a real feature, `ProviderSettingsSection`,
§2.1 item 4); "Playback" (`SettingRow`/`Switch` toggles — "Auto-download new episodes", "Sync
progress to server", "Offline mode" — **none of these three exist as real settings on either
platform today**, `grep -rn "autoDownload\|syncProgress\|offlineMode" apps/web apps/android`
returns nothing outside this mock file); "Accent Colour"; "Library" (a static item/scan-time note,
no real equivalent). §7 rules the three Playback toggles out of scope.

**Onboarding mock**: a single combined screen (server URL + username + password fields, then
"Connect"/"Skip for now" actions, then an optional Jellyfin URL field below) — **not web's
3-step wizard**. The mock is illustrative, not literally buildable: it shows a server URL and
password field on the same screen with no probe-before-login sequencing, which doesn't match
either platform's real API flow (`POST /api/v1/setup` must succeed before `POST /api/v1/auth/login`
is meaningful). §6.7 does not require rebuilding onboarding to match this mock's single-screen
shape; it requires giving Android's _existing_ two real steps the Sonora _treatment_ (card,
type scale, tokens) web's three steps already mostly have.

**The persistent Settings nav entry is a rail-footer/sidebar-footer item in the mock, not a
per-screen top-bar action** — `:79-91`: a `SidebarItem`/`RailItem` with `icon="settings"`,
`margin-top:auto` (pushed to the bottom of the rail, below the four primary destinations), present
on **every** screen because it's shell-level chrome, not per-screen. Mobile gets a header
`IconButton` instead (`:264`, next to the screen title). **Web's `Shell.tsx` already builds
exactly this** — `nav-rail-settings` (`:358-363`, `marginTop: 'auto'`, doc comment citing this
exact reasoning) and `compact-settings-button` (`:256-263`, positioned top-right). Android has
neither; §6.1 is the fix.

---

## 3. The Sonora treatment

### 3.1 Geometry / type table — Appearance controls, both platforms

| Token                       | Web (today)                                                                                                | Web (target)                                                    | Android (today)                                                                                    | Android (target)                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Theme-mode control          | `packages/ui` `Button`, `variant` filled/outlined, hand-copied inline `style` (`SettingsPage.tsx:100-108`) | `packages/ui` `Chip`, `variant="filter"`, `selected` — see §6.6 | M3 `FilterChip`, `selectedContainerColor`/`selectedLabelColor` = `tokens.accent`/`.accentContrast` | unchanged — already correct                                 |
| Theme-mode order            | `system, light, dark`                                                                                      | unchanged                                                       | `Light, Dark, System`                                                                              | **`System, Light, Dark`** — see §6.2                        |
| Accent swatch size          | `40px` circle (`app.css:626-628`)                                                                          | unchanged                                                       | `40dp` circle (`SettingsScreen.kt:190`)                                                            | unchanged — already matches                                 |
| Accent swatch selected ring | `outline: 3px solid var(--accent)` (`app.css:644-647`) — **already fixed, see §6.4**                       | unchanged — landed as `4299bb9`                                 | `Modifier.border(3.dp, tokens.accentInk, CircleShape)`                                             | unchanged — already correct                                 |
| Accent grid layout          | flex row, `flex-wrap: wrap`, `gap: var(--m3-space-sm)`                                                     | flex row, wrap, `gap: var(--spacing-sm)` (8px, §1.9)            | `chunked(6)` rows                                                                                  | unchanged                                                   |
| Persistent nav entry        | rail-footer link (`nav-rail-settings`) + compact top-right icon button — **already Sonora-shaped**         | unchanged                                                       | none (per-screen `TextButton`, Browse only)                                                        | **rail-footer `RailItem`, `AuralisShell`-level** — see §6.1 |

**Both platforms get the same rows in this table — no row is platform-only.** Where a row's
"target" is "unchanged," that's because recon in §2 already established the platform satisfies it;
say so explicitly rather than omitting the row, per the correction `16e-foryou-P` made to the prior
spec in this series.

### 3.2 Geometry / type table — Onboarding card / field row, both platforms

Sonora's `FieldRow` (`SONORA.md` §3.3) is the reference component for a labelled text input —
label `var(--text-sm)` weight 700 muted, wrapping the `Input` primitive; mobile wraps it in a
`background: var(--m3-surface-container); border-radius: var(--radius-pill)` pill container
("chromeless by design", per the component's own comment), desktop applies no wrapper. Neither
platform's onboarding form uses a shared field component today (`packages/ui` has no `Input`/
`FieldRow` — confirmed by `ls packages/ui/src/components | grep -i input` returning nothing but
`SearchField`, itself still `--m3-*`, HANDOVER's own owed-vendoring list). **Building that shared
primitive is out of scope for this wave** — it's `packages/ui` component-library work, not a
screen restyle; see §7.

| Token              | Web (today)                                                                             | Web (target)                                                                                                                                                                     | Android (today)                                        | Android (target)                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Card wrapper       | `Card variant="elevated"`, `max-width: 480px`, `padding: var(--m3-space-xl)`            | same `Card`, tokens migrated — see §6.5                                                                                                                                          | none (bare `Scaffold`/`Column`)                        | **`Card variant="elevated"` equivalent** — see §6.7                                                                                         |
| Step label         | `"Step {n} of {totalSteps}"`, uppercase, `var(--m3-type-label-large-size)`, muted       | unchanged text, migrated tokens                                                                                                                                                  | none                                                   | **`"Step {n} of 2"`** — see §6.7 (Android has two real steps, not three; §2.4)                                                              |
| Title              | `var(--m3-type-headline-medium-size)`                                                   | Sonora `--h3-size`/`--h4-size` region (match `MediaHeader`'s already-established weight-900 display face, §1.8)                                                                  | `TopAppBar` title only, default M3 type                | own screen-body title, matching weight/face                                                                                                 |
| Field label        | `var(--m3-type-label-large-size)`, muted                                                | `--text-sm` weight 700, muted (`FieldRow` spec)                                                                                                                                  | `OutlinedTextField`'s own `label` slot, default M3     | unchanged — `OutlinedTextField`'s label is the Compose-idiomatic equivalent, not a defect                                                   |
| Field/input chrome | `border: 1px solid var(--m3-outline)`, `background: var(--m3-surface-container-lowest)` | `border: 1px solid var(--surface-border)`, `background: var(--surface-card)` (or the mobile pill treatment, at implementer's discretion — no existing e2e pins the exact radius) | M3 `OutlinedTextField` default                         | unchanged — already token-correct by construction (Material3 theme-driven)                                                                  |
| Error banner       | `border: 1px solid var(--m3-error)`, `background: var(--m3-error-container)`            | `border: 1px solid var(--state-error)`, background a `color-mix` tint of it (§1.4)                                                                                               | `MaterialTheme.colorScheme.error` text only, no banner | unchanged — Android's inline error `Text` is the existing idiom on this screen and every other Android form; do not add a banner here alone |

### 3.3 What `SONORA.md` doesn't cover — say so, don't invent

- **No component in `SONORA.md`'s §3/§4 corresponds to the `Chip`/`FilterChip` 3-way mode
  selector as a group** — `Chip` (§4) is documented as a single selectable item; there is no
  "segmented control" or "chip group" primitive named anywhere in the vendored material. Treat the
  3-way row as an app-level composition of individual `Chip`/`FilterChip` instances, which is
  exactly what both platforms already build.
- **`SettingRow`'s `Switch`-based shape (§3.9) matches no control either platform ships today.**
  Every real control here is either a multi-choice selector (theme mode) or a preset picker
  (accent) — neither is a boolean toggle. Do not build a `Switch`/`SettingRow` component for this
  wave; §7 names the three mock toggles it would serve as out of scope.
- **Nothing in `SONORA.md` states an order for the theme-mode options.** The design tool's own
  toolbar toggle (`Auralis-Redesign.dc.html:786-789`, `themeTabs`) is binary (Dark/Light only, for
  previewing the canvas) and is not the app's 3-way control — it settles nothing about order. §6.2
  is a spec-level ruling, not a citation.

---

## 4. What the BFF serves vs. what each client uses

**No BFF change is needed.** Checked, not assumed: `POST /api/v1/setup` and `POST /api/v1/auth/login`
already serve everything web's onboarding needs; Android's Settings screen persists purely
client-side (`KeyValueStore`/`DataStoreKeyValueStore`, `16f-A-1`); Android's onboarding persists
purely client-side too (`ServerConfigRepository`, its own `bff_base_url` key, unrelated to any BFF
route). The six web-only Settings sections (§2.1 items 3–6) already have working routes from
earlier phases; this wave restyles their container, not their data flow.

---

## 5. Fallback contract — what to omit or paint when a field is absent

- **Android's onboarding has no error-recovery path back to a setup step** (§2.4) — a login
  failure against a misconfigured BFF shows the existing generic `LoginUiState.Error` text.
  **Do not build a new fallback path for this in this wave** — it needs Android's own `/api/v1/setup`
  equivalent, which is new feature scope; §7 names it explicitly rather than silently dropping it.
- **A card/field-row treatment must degrade to the platform's default control if a token is
  undefined**, exactly as every prior `16e` spec required — Compose has no CSS-cascade fallback,
  so name the colour/shape source for every element you touch, not just the happy path. On
  Android's onboarding/login restyle (§6.7) this means: if `AuralisAppTokens.current` is
  unavailable at the point these screens compose (they render **above** `AuralisTheme`'s accent
  wiring today — verify this against the current `MainActivity.kt`/`AuralisTheme` call graph
  before assuming otherwise), fall back to `MaterialTheme.colorScheme` roles rather than crashing
  or rendering blank.

---

## 6. Behaviour contract — both platforms must satisfy this

### 6.1 Settings gains a persistent, shell-level entry point on Android

**Web already satisfies this — do not rebuild it.** `Shell.tsx`'s `nav-rail-settings` (rail-footer
link, `marginTop: 'auto'`, already `--accent-ink`/`--surface-card`-styled) and
`compact-settings-button` (top-right `IconButton`, positioned via `.auralis-shell__settings-button`)
together match Sonora's mock (§2.5) exactly: reachable from every screen, not competing with the
five primary destinations for a nav slot.

**Android does not satisfy this and must gain it, scoped narrowly.** Add one persistent Settings
entry to `AuralisShell`'s **`NavigationRail`** branch only (the wide-window case, `RAIL_BREAKPOINT`
and above) — a `RailItem`-equivalent pinned to the bottom of the rail below the five primary
destinations (`Modifier.weight(1f)` spacer above it, or the rail's own bottom-alignment
mechanism), navigating to `Routes.SETTINGS`. This is contained to `AuralisShell.kt` (and whichever
file holds `ShellNavigationRailItems`) and does not touch any screen's own `TopAppBar`.

**The bottom-`NavigationBar` (compact) case is explicitly NOT required to gain an equivalent in
this wave**, and this is a real, named, deliberate gap rather than idiom — see §7. `AuralisShell`
owns only the bottom chrome per screen's own top bar (§2.3); giving every compact-mode screen a
persistent Settings affordance would mean touching `BooksScreen`, `MusicLibraryScreen`,
`PodcastsScreen`, and `UnifiedSearchScreen`'s top bars in addition to `ForYouScreen`'s — a
cross-cutting change to five files this triple's actual deliverable (the Settings/Onboarding
screens themselves) does not require. Settings stays reachable from Browse's `TopAppBar` only, as
today, in compact mode.

### 6.2 Theme-mode order: align Android to web's `system, light, dark`

Neither `SONORA.md` nor the vendored mock rules on order (§3.3). Per this project's established
tie-break — the album triple's ruling that "the artist link is the first genuinely symmetric case...
any asymmetry there is drift, not idiom" — **match web when nothing else decides it.** Reorder
`ThemeModeOptions` in `SettingsScreen.kt` to `System, Light, Dark`. Low risk: `SettingsContentTest.kt`
queries by `testTag("theme-mode-${mode.name}")`, not position (`grep -n "onNodeWithTag"
apps/android/app/src/testDebug/.../SettingsContentTest.kt` — confirmed, no order assertion exists).

### 6.3 Accent presets: pin the byte-for-byte match, don't change it

§2.3 already establishes the 17 presets match in name, order and hex across both platforms. **No
code change is required here.** Add one assertion on each platform (a unit test is enough, no
Playwright/Robolectric geometry needed) that pins the full ordered hex list, so a future edit to
either `ACCENT_PRESETS` or `SonoraAccentPresets` that silently drifts the pair fails immediately
rather than being caught by eye. This is the byte-for-byte target for this screen, the same shape
as prior triples' composed-string targets — the difference is it's already satisfied and needs
pinning, not deriving.

### 6.4 Web: the accent swatch's selection ring — ALREADY LANDED, do not rebuild

**This section described work that has since shipped. It landed as `4299bb9` (2026-08-20), before
this triple was dispatched, and neither implementing wave should touch it.**

The spec originally called for `.auralis-color-swatch[aria-pressed='true']`'s outline to move from
`var(--m3-primary)` to `var(--accent-ink)`. It shipped as **`var(--accent)`**, and that is the
correct value rather than a deviation to be corrected back: the ring's job is to mark _which colour
you picked_, so it should paint the picked colour itself. `--accent-ink` is the derived
readable-text role — a different thing, and the one already recorded as failing WCAG AA on
`--surface-card` at the default accent (queue `abbaca2`, still with Sofia). Pointing a selection
indicator at a text role would have been a second, subtler version of the same disconnect the fix
existed to close.

The rule now reads `outline: 3px solid var(--accent)` at `app.css:644-647`.

**The distinction this section originally got wrong is worth keeping**, because it is what made the
fix safe. This spec's recon reported `settings-a11y.spec.ts` as pinning the old behaviour as
correct. It does not: that test asserts the `--m3-primary` **token** does not follow the picker,
which is deliberate, still true, and says nothing about what the ring should read. Checking that
distinction before editing is what kept the existing assertion passing. The assertion added by
`4299bb9` reads the ring's own resolved `outline-color` across two presets — reading `--accent` off
the root instead would pass with the ring still pointing at a fixed token, which is precisely the
hole that let the bug ship. It was confirmed to discriminate by restoring the old token and
watching it go red.

**For `16e-settings-W`:** nothing to do here, and the `4299bb9` assertion must keep passing through
§6.6's `Chip` migration. **For `16e-settings-P`:** this is not drift; verify by `git show 4299bb9`
rather than grading web against the superseded `--accent-ink` wording.

### 6.5 Web: migrate `.auralis-onboarding*`/`.auralis-field*`/`.auralis-settings-row`/

`.auralis-service-*` off `--m3-*`

Per §2.1/§2.2's citations, every rule in this family reads `--m3-space-*` → Sonora's `--spacing-*`
(§1.9, the "Layout" scale — matches the `flex`/`gap` usage these rules already have), `--m3-type-*`
→ the corresponding `--text-*`/`--h*-size` token (§1.8), `--m3-on-surface-variant` →
`--surface-fg-muted`, `--m3-outline`/`--m3-outline-variant` → `--surface-border`,
`--m3-surface-container-lowest` → `--surface-card`, `--m3-shape-sm`/`--m3-shape-md` →
`--radius-sm`/`--radius-md` (§1.10), `--m3-error`/`--m3-error-container`/`--m3-on-error-container`
→ `--state-error` plus a `color-mix` tint (§1.4, matching `ResultRow`'s established tint pattern,
§3.8). This is a value-level token substitution on existing rules, the same shape as `16c-2-W-1`'s
substrate fix — not a component rebuild, and it does not require building the `Input`/`FieldRow`
primitive named out of scope in §7.

### 6.6 Web: the theme-mode control becomes `Chip`, not a hand-styled `Button`

`SettingsPage.tsx:100-108`'s inline `style` block is explicitly a hand-copy of `Chip.tsx`'s own
unchecked-state values (the code comment says so: "the values below are copied from there rather
than invented"). Replace the `Button`-based row with `packages/ui`'s `Chip`, `variant="filter"`,
`selected={mode === candidate}`, `onSelectedChange={() => setMode(candidate)}` — the component
that already encodes the exact selected/unselected treatment this file currently duplicates by
hand, and the one Android already maps onto with `FilterChip`. **Preserve every existing
`data-testid` (`theme-mode-system`/`theme-mode-light`/`theme-mode-dark`) and the `aria-pressed`
semantics `settings-a11y.spec.ts` asserts on** (`Chip`'s `filter` variant reads `selected`, not
`aria-pressed`, directly — confirm which attribute actually lands in the DOM before assuming the
existing assertions need no change; if `Chip` emits `aria-selected` instead, the e2e spec's
assertions must be updated in the same commit, not left to silently stop testing anything).

### 6.7 Android: give onboarding and login the Sonora treatment, without inventing a third step

Wrap `OnboardingScreen`'s and `LoginScreen`'s content in a Sonora-styled card treatment analogous
to web's `OnboardingCard` — an elevated container, a step label, a title, an optional subtitle —
using **Android's own two real steps** (`"Step 1 of 2"` / `"Step 2 of 2"`), not web's three. Do
**not** build a services-equivalent third step; §2.4 already establishes Android's Jellyfin
connection has no onboarding-adjacent screen at all, and inventing one to hit "parity" with web's
step count would be building a feature this wave does not own. Title/copy stay Android's own
existing strings ("Connect to Auralis" / "Sign in") — these describe a genuinely different first
step than web's ("Connect to Audiobookshelf"), and rewriting Android's copy to match web's would
misdescribe what the screen actually does (§2.4).

Apply the shared type scale already established by `MediaHeader`/`16b-2-A` (weight-900 display
face for the title, muted tone for the step label and subtitle) rather than inventing new values.

### 6.8 Android: `LoginScreen`'s submit button gets an empty-field guard

`enabled = uiState !is LoginUiState.LoggingIn && username.isNotBlank() && password.isNotBlank()`
— matching web's `disabled={mutation.isPending || !username || !password}` behaviour contract.
This is a functional fix, not a visual one; it does not depend on §6.7's restyle and can land
independently within the same wave.

### 6.9 Web: `ServicesPage`'s copy stops claiming shipped features are unshipped

`ServicesPage.tsx:53`/`:58`'s "Support ships in a later phase" is false for both Jellyfin and the
download client (§2.2). Replace the two `ComingSoonService` fieldsets' framing — at minimum, stop
asserting a future tense that is no longer true. The simplest correct fix: change the copy to
point at Settings ("Connect Jellyfin and configure download clients any time from Settings, once
you're signed in") rather than presenting disabled fields captioned as not-yet-built. Keep the
step itself skippable exactly as today — this is a copy fix, not a flow change, and does not
require removing the step or wiring the fields to anything live.

---

## 7. Explicitly out of scope

- **Building a shared `Input`/`FieldRow` `packages/ui` primitive.** Named as owed in
  `docs/HANDOVER.md`'s vendoring list; it is component-library work, not this screen's restyle.
  §6.5 migrates existing rules' token values without introducing a new component.
- **The three mock-only Playback toggles** (auto-download, sync-progress interval, offline mode,
  §2.5) — no real backend or client feature exists for any of them on either platform. Building
  them is new feature scope well beyond a redesign wave.
- **A `SettingRow`/`Switch`-shaped component.** Nothing today needs it (§3.3); do not build it
  speculatively for the toggles above.
- **Android's own `/api/v1/setup`-equivalent flow** (§2.4/§5) — the fallback gap where a
  misconfigured BFF address dead-ends at a generic login error. Real, narrow, and new feature
  work, not a restyle.
- **A Jellyfin-connect screen for Android** (§2.4) — web's `JellyfinConnectSection` has no Android
  counterpart anywhere in the tree, onboarding-adjacent or not. Out of scope; ruled acceptable in
  §8.
- **Provider/indexer configuration on Android** (§2.1 items 3–6) — admin-scoped server credential
  configuration; ruled acceptable idiom in §8, not a gap this wave closes.
- **Compact-mode (bottom `NavigationBar`) Settings reachability on every Android screen** (§6.1) —
  named as a real, deliberate gap, not idiom, but out of scope for the reason §6.1 states: it
  would touch five screens' `TopAppBar`s, which is shell-navigation surgery, not this screen's
  content.
- **Restoring Android's removed pixel-comparison tests.** `16f-A-2` removed two `captureToImage()`
  tests because they could not be made to pass; every later wave that considered the same
  instrument since (`ShellNavigationItemsTest`, `PodcastDetailContentTest`,
  `AlbumDetailContentTest`, `MediaHeaderTest`, `BookDetailContentTest`, `SettingsContentTest` —
  `grep -rln captureToImage apps/android` finds all six, each a comment explaining why it wasn't
  used) confirms **there is still no working `captureToImage()` precedent in this repo, and no
  JDK on this machine to develop one against.** Do not re-attempt it here. Keep the existing
  semantic-value assertions (`FilterChipDefaults.filterChipColors(...)` inputs, tag-based
  selection state) as the coverage this wave relies on, same as every prior Android wave since.

---

## 8. Deliberately unequal

- **Onboarding step count.** Web: 3 (setup, login, optional services). Android: 2 (BFF address,
  login) — and Android's first step has no web equivalent at all (§2.4). This is forced idiom,
  driven by the same-origin-vs-separate-origin architecture difference the code's own comments
  state, not drift. Do not "fix" it to make the counts match.
- **Provider/indexer/request configuration sections** (§2.1 items 3–6) exist only on web. Ruled
  acceptable: this is server-scoped admin configuration (credentials, indexer URLs) for a
  single-household self-hosted app, reasonably desktop-first. Building five Compose screens' worth
  of provider config UI is a much larger feature than this restyle wave, and nothing in
  `docs/USER_DECISIONS.md` asks for it on mobile.
- **Compact-mode Settings reachability** (§6.1/§7) — web's compact mode has a persistent icon
  button on every screen; Android's compact mode has it on one screen only (Browse). Named
  explicitly as a real gap, not idiom, and explicitly deferred rather than silently accepted —
  the distinction §7's own item states.
- **The error-banner-vs-inline-text convention for form errors** (§3.2's last row) — web wraps
  errors in a bordered/tinted `<div role="alert">`; Android renders a plain coloured `Text`. This
  is Android's existing, consistent idiom across every form screen in the app (`LoginScreen`,
  `OnboardingScreen`, and others), not something this screen invents or should diverge from
  alone.

---

## 9. Web: what changes

- `SettingsPage.tsx`: theme-mode row moves from `Button` to `Chip` (`variant="filter"`) — §6.6.
  Preserve testids/behaviour; update `settings-a11y.spec.ts` in the same commit if the selected-
  state attribute Playwright asserts on changes.
- `app.css`: the accent swatch's selection ring — **already landed as `4299bb9`, nothing to do**; see
  the rewritten §6.4. Do not revert it to `--accent-ink`.
- `app.css`: the full `.auralis-onboarding*`/`.auralis-field*`/`.auralis-service-*`/
  `.auralis-settings-row` family moves off `--m3-*` onto Sonora tokens — §6.5. Run
  `pnpm vitest run apps/web` afterward (this repo has a unit test — `layoutOverflow.test.ts`'s
  sibling class of test — that parses CSS as text; confirm nothing similar targets these
  selectors before assuming a pure-CSS change is unit-test-invisible).
- `ServicesPage.tsx`: copy fix, §6.9. No new wiring.
- No route, no BFF client, no new shared component. `OnboardingCard.tsx` needs no change — it
  already wraps everything correctly; only the CSS it and its children reference moves tokens.

## 10. Android: what changes

- `SettingsScreen.kt`: reorder `ThemeModeOptions` to `System, Light, Dark` — §6.2.
- `AuralisShell.kt` (+ wherever `ShellNavigationRailItems`/equivalent lives): one new rail-footer
  Settings entry, rail-mode only — §6.1.
- `OnboardingScreen.kt`/`LoginScreen.kt`: Sonora card/type treatment, two real steps — §6.7.
- `LoginScreen.kt`: submit button empty-field guard — §6.8.
- New unit/Robolectric test pinning the accent-preset hex list — §6.3.
- No change to `Routes`, `AppStartViewModel`, `ServerConfigRepository`, or any ViewModel's network
  behaviour beyond §6.8's guard.

---

## 11. Accessibility requirements

- **Theme-mode selection state must be announced on both platforms**, not merely drawn — web's
  migration to `Chip` (§6.6) must preserve or improve on the existing `aria-pressed`-equivalent
  semantics `settings-a11y.spec.ts` already asserts; Android's `FilterChip`/`selectable` already
  exposes `Role.RadioButton`-style selection semantics (`AccentSwatch`'s own precedent,
  `SettingsScreen.kt:200`) and this wave's rail-mode Settings item must carry the same
  `contentDescription`/testTag discipline `ShellNavigationItemsTest`'s doc comment already
  documents (merged-content-description queries are unreliable in this Robolectric configuration —
  assert by tag, not by merged description, matching the existing `AccentSwatch` pattern).
- **The new rail-footer Settings entry on Android must be reachable by the same input modality as
  the four primary destinations** — keyboard/switch-access focus order should place it after them,
  not interleaved or before.
- **The accent-swatch selection ring fix (§6.4) is an accessibility fix, not only a cosmetic
  one** — before it, web's swatch selection state was conveyed only by `aria-pressed` (already
  correct) with a visually-inert ring; after it, sighted users relying on the ring to confirm
  which swatch is active get a signal that actually tracks the chosen colour.
- **`LoginScreen`'s new empty-field guard (§6.8) must not remove the existing inline error path** —
  a disabled button communicates "cannot submit yet" to a keyboard/switch user only if the button's
  `enabled` state itself is exposed via semantics (Compose's default `Button` does this; do not
  override it away).
- **Onboarding's step-count strings remain screen-reader-visible text, not merely visual** — on
  Android, this is new (§6.7 adds them); ensure the step label is a real `Text`, not baked into a
  decorative image or background.

---

## 12. Two constraints both implementing waves inherit

**Only one wave at a time may run Playwright here** — `playwright.config.ts` hardcodes the `app`
project's BFF on port 4310 with `reuseExistingServer: false`, so two agents running any Playwright
project contend for it; worst case, the second silently binds to the first's server and both runs
share one stateful single-tenant BFF. `16e-settings-W` cannot run Playwright concurrently with any
other in-flight web wave.

**This machine has 4 cores and `playwright.config.ts` sets `workers: '100%'`.** At that default,
content-visibility timeouts appear that move between runs and pass in isolation — not a defect in
this wave's code. Pass `--workers=2` when running the `app`/`ui-desktop`/`ui-mobile` projects
locally.

**`e2e/app/onboarding.spec.ts` is its own Playwright project everything else `dependencies` on**
(§2.2) — a break here is not scoped to this spec, it fails the entire `app` project's
`storageState` setup. Run it in isolation first (`pnpm exec playwright test --project=onboarding`
— confirm the actual project name in `playwright.config.ts` before running; do not guess) before
running the full suite, and re-run the full suite before calling the wave done.

**Nothing on this machine compiles Kotlin.** Budget two-to-three red Android CI rounds. Run the
two compiler-free pre-checks this project has established before dispatch reaches CI: matched
`/*`/`*/` counts across every changed `.kt` file (`grep -o '/\*' file | wc -l` vs.
`grep -o '\*/' file | wc -l` — Kotlin nests block comments, so an unequal count means an unclosed
comment swallowing the rest of the file), and no backtick test names containing a literal `.`
(compiles as Kotlin, fails as bytecode). Both are documented in `docs/HANDOVER.md`'s "Lessons that
must not be relearned" section — read it before writing any Kotlin test name.

**A `LazyColumn`/scrollable-content click that neither throws nor fires its callback is
off-viewport, not unwired** — this project's now-three-times-confirmed Compose test trap. If
`16e-settings-A`'s content ends up long enough to scroll (the accent grid plus theme row plus a
persistent-entry test could plausibly exceed a Robolectric viewport), scroll to a node before
clicking it, or use `performSemanticsAction(SemanticsActions.OnClick)`, which does not depend on
gesture dispatch or geometry at all. And if a test assertion targets a node inside a merged
semantics group (any row this wave gives grouped `contentDescription` to), use
`useUnmergedTree = true` — the third member of this project's Compose-test trap family, and the
tell is identical every time: a bare `AssertionError` pointing away from the actual cause.

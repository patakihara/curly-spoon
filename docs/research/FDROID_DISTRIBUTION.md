# F-Droid / Droid-ify distribution — investigation (phase 11)

Investigated 2026-08-06 against commit `950f3cb`. No implementation in this document; it is
the deliverable ROADMAP.md §11 asked for before anything gets built.

## 1. Recommendation

**Ship to IzzyOnDroid first; treat official F-Droid as a later, separate submission gated
on a reproducible-build pipeline and a signing decision the user has not made yet.** A
self-hosted repo is not worth building at all right now — it has all of IzzyOnDroid's
process cost (release-signed tagged GitHub releases, fastlane metadata) with none of its
reach, since Droid-ify does not enable a third-party repo by default the way it enables
IzzyOnDroid. IzzyOnDroid's bar — public FOSS source, a release-signed APK attached to a
tagged GitHub release, fastlane metadata — is close to what a disciplined release process
should look like anyway, and clearing it produces exactly the artifacts (tags, changelogs,
screenshots, a real keystore) that a later official-F-Droid submission needs. Official
F-Droid additionally wants reproducible builds and is far stricter about anything
resembling a Google dependency; Android Auto's current implementation clears that bar today
(§3), but reproducibility does not (§4), and the signing/package-name decision is
irreversible (§5) and is the one thing in this document that must go back to the user before
any of it is executed.

There is one finding serious enough to change this recommendation on its own: **IzzyOnDroid's
current inclusion policy explicitly excludes apps "fully or in part created by generative AI
tools"** (§2, §8). Most of Auralis's implementation code was written by Claude subagents under
this project's own delegation model. Whether that disqualifies submission is not something
this document can resolve — it is the first open question in §8, and it is checked before any
IzzyOnDroid submission work starts, not after.

## 2. The three routes compared

|                           | Own repo                                                                                | IzzyOnDroid                                                                        | Official F-Droid                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What we must produce      | `fdroidserver`-generated repo index + APKs, hosted somewhere with a stable URL/TLS cert | Release-signed APK attached to a tagged GitHub release, fastlane `metadata/en-US/` | Public FOSS source, all-FOSS dependency graph, a `metadata/<appId>.yml` build recipe accepted into `fdroiddata`, ideally reproducible                                   |
| Reach (Droid-ify default) | Not enabled by default — user must add our repo URL manually                            | Enabled by default in most Droid-ify installs                                      | Enabled by default everywhere F-Droid clients ship                                                                                                                      |
| Effort to first release   | Stand up + maintain repo infra (`fdroidserver update`, TLS, hosting), ongoing           | Tag a release, attach a signed APK, write fastlane metadata, file one GitHub issue | All of IzzyOnDroid's asks, plus a reproducible-build recipe merged upstream and reviewed by F-Droid maintainers (weeks to months of review, historically)               |
| How updates reach a user  | We push a new repo index on every release; user's client polls our URL                  | IzzyOnDroid's bot polls tagged GitHub releases; picks up new tags automatically    | F-Droid's own build server rebuilds from source on every tagged commit per the merged recipe; independent of our CI artifact entirely                                   |
| Cost to back out          | Ours to delete; no external dependency                                                  | File an issue asking removal; otherwise inert if we stop tagging releases          | Once merged, `fdroiddata` history is public and the app id is registered; removal is an explicit request but the historical record (and any existing installs) persists |

Sources: [F-Droid Inclusion Policy](https://f-droid.org/en/docs/Inclusion_Policy/) (fetched
2026-08-06), [F-Droid Inclusion How-To](https://f-droid.org/docs/Inclusion_How-To/) (fetched
2026-08-06), [IzzyOnDroid App Inclusion Policy](https://izzyondroid.org/docs/general/AppInclusionPolicy/)
(fetched 2026-08-06).

These are explicitly not exclusive — ROADMAP.md §11 says so and the primary sources agree
nothing about being on IzzyOnDroid blocks a later official submission. The ordering
recommended in §1 is "IzzyOnDroid now, official later," not "IzzyOnDroid instead of
official."

## 3. The FOSS audit

Read directly from this checkout: `apps/android/gradle/libs.versions.toml`,
`apps/android/app/build.gradle.kts`, `apps/android/build.gradle.kts`,
`apps/android/app/src/main/AndroidManifest.xml`, `apps/android/app/src/main/res/xml/automotive_app_desc.xml`.

### Dependency-by-dependency

| Dependency                                                                                                                         | Group                    | FOSS-acceptable to official F-Droid? | Evidence                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AndroidX core-ktx, lifecycle-runtime-ktx, activity-compose, lifecycle-viewmodel-compose, datastore-preferences, navigation-compose | `androidx.*`             | Yes                                  | AndroidX is Apache-2.0, published from AOSP source on `maven.google.com`; it is the standard dependency set for essentially every F-Droid-listed Compose app. No F-Droid documentation lists AndroidX itself as an anti-feature.             |
| Jetpack Compose (`androidx.compose.*`, `compose-bom`, material3, ui-tooling)                                                       | `androidx.compose.*`     | Yes                                  | Same basis as above — Apache-2.0, AOSP source, the BOM only pins versions and ships no code of its own.                                                                                                                                      |
| Kotlin stdlib / AGP / Kotlin Compose & Serialization Gradle plugins                                                                | `org.jetbrains.kotlin.*` | Yes                                  | Kotlin is Apache-2.0, JetBrains open-source; F-Droid's own build toolchain compiles Kotlin routinely (`fdroidserver`'s `gradlew-fdroid` wrapper exists specifically to standardize Kotlin/AGP builds).                                       |
| `kotlinx-serialization-json`, `kotlinx-coroutines-android`, `kotlinx-coroutines-guava`, `kotlinx-coroutines-test`                  | `org.jetbrains.kotlinx`  | Yes                                  | Apache-2.0, JetBrains, no network/telemetry code.                                                                                                                                                                                            |
| OkHttp, OkHttp MockWebServer                                                                                                       | `com.squareup.okhttp3`   | Yes                                  | Apache-2.0, Square. Used directly as the HTTP client, not a Google-services shim.                                                                                                                                                            |
| Media3 (`media3-exoplayer`, `media3-session`, `media3-datasource-okhttp`)                                                          | `androidx.media3`        | Yes                                  | Apache-2.0, AndroidX/AOSP. ExoPlayer is the de facto standard playback stack in F-Droid-listed media apps (e.g. NewPipe, AntennaPod both ship it). No proprietary codec plugins are declared here — only the OkHttp-backed HTTP data source. |
| Coil (`coil-compose`)                                                                                                              | `io.coil-kt`             | Yes                                  | Apache-2.0, Instacart-authored image loader with no telemetry, no Google Play Services dependency (unlike Glide's optional GMS integration modules, which are not used here).                                                                |
| JUnit                                                                                                                              | `junit`                  | Yes                                  | EPL-1.0, standard test dependency, not shipped in the release APK.                                                                                                                                                                           |

No Firebase, no Crashlytics, no Google Play Services artifact (`com.google.android.gms:*`),
no Google Analytics, no ad SDK, no Room, no Hilt/Koin, no Retrofit, no Glide appears anywhere
in `libs.versions.toml` or either `build.gradle.kts`. `grep -rn "gms\|play-services\|com.google.android.play\|firebase" apps/android/ --include="*.kts" --include="*.toml" --include="*.xml"`
returns exactly one hit, and it is the manifest meta-data string addressed below — there is
no other Google-branded dependency in the tree.

### Android Auto — confirmed, not hypothesized

ROADMAP.md §11 hypothesized the Android Auto plumbing is only a meta-data string and an XML
descriptor, not a real Play Services dependency. **Confirmed against the actual files:**

`AndroidManifest.xml`:

```xml
<meta-data
    android:name="com.google.android.gms.car.application"
    android:resource="@xml/automotive_app_desc" />
```

`res/xml/automotive_app_desc.xml`:

```xml
<automotiveApp>
    <uses name="media" />
</automotiveApp>
```

That is the entirety of the Android Auto surface. There is no `com.google.android.gms:*`
artifact in either Gradle file, no `google()`-resolved GMS coordinate anywhere, and no
generated `google_play_services_version` resource. The string `com.google.android.gms.car.application`
is a manifest _key name_ Android's package manager reads to discover automotive apps — it
does not pull in or require the Play Services runtime library at all
([Android Auto developer docs](https://developer.android.com/training/cars/platforms/android-auto),
general reference, fetched 2026-08-06). The `androidx.media3.session.MediaLibraryService`
intent-filter is what Android Auto actually binds to at runtime, and that's plain AndroidX.

Whether F-Droid's scanner flags this anyway: `fdroidserver`'s `scanner.py` detects non-free
code by decompiling the built APK's DEX files and matching compiled Java class references
(`scan_binary()`, matching against signatures like the literal bytecode string
`com/google/android/gms`) — [`fdroidserver/scanner.py`](https://github.com/f-droid/fdroidserver/blob/master/fdroidserver/scanner.py)
(fetched 2026-08-06). A manifest meta-data _value_ is packaged into the APK's binary XML,
not compiled into a DEX class, so it is not the kind of artifact this scanner's class-name
signatures match against. This project found no F-Droid documentation or fdroiddata history
of a real app being rejected for carrying only the automotive meta-data string with no
backing dependency — **unverified beyond this reasoning**; the only way to fully confirm is
to run `fdroid scanner` against a built release APK, which needs the Android SDK/Gradle this
machine doesn't have (see the gap below).

### Verdict

**Auralis clears the FOSS bar as it stands.** Nothing in the dependency graph visible from
`libs.versions.toml`/`build.gradle.kts` is proprietary, and the one string that looks
Google-branded (the Android Auto meta-data key) is confirmed to carry no dependency. No
named changes are required and no build flavour is needed on current evidence.

**The one real gap**: this is a _first-order_ audit — every declared dependency, read from
the Gradle files. It is not a _transitive_ audit. AndroidX/Media3/Coil/OkHttp are well-known
enough that a hidden proprietary transitive pull-in is unlikely, but "unlikely" is not
"checked." The exact command to close this gap, once a JDK/Android SDK is available:

```
./gradlew :app:dependencies --configuration releaseRuntimeClasspath
```

Run that and grep the output for `com.google.android.gms`, `com.google.firebase`, or any
other unexpected group before treating the FOSS verdict as final for an official submission.
This machine has no JDK/Android SDK (per `CLAUDE.md`), so this command has not been run; CI
(`.github/workflows/android.yml`) could run it as a one-off diagnostic step without changing
the pipeline permanently.

## 4. Reproducible builds

Official F-Droid's build server compiles every app **from source, on F-Droid's own
infrastructure**, independent of anything our CI produces
([Inclusion Policy](https://f-droid.org/en/docs/Inclusion_Policy/), fetched 2026-08-06).
"Reproducible" in F-Droid's sense means: the APK F-Droid's build server produces from the
`metadata/<appId>.yml` recipe is byte-identical (after signature-stripping) to the APK we
built and signed ourselves, so a user can independently verify F-Droid didn't tamper with
the binary between our source and their phone
([Reproducible Builds](https://f-droid.org/docs/Reproducible_Builds/), fetched 2026-08-06).
It is explicitly **not a hard requirement for inclusion** — best practice, not a gate — but
it's the mechanism that lets F-Droid publish the _developer's own signature_ rather than
re-signing with F-Droid's key, which is the difference that actually matters for update
continuity if we ever also distribute through IzzyOnDroid or GitHub releases with the same
signature.

What our pipeline does today (`.github/workflows/android.yml`): `./gradlew test assembleDebug`
— an unsigned **debug** build, uploaded as a CI artifact. No release build type is even
defined in `apps/android/app/build.gradle.kts` (only `debug {}` is configured under
`buildTypes`). Nothing in the Gradle config addresses reproducibility.

Concrete changes reproducibility would need, ranked by disruption (low → high):

1. **Add a `release` build type with explicit determinism flags** — `isMinifyEnabled`
   decided explicitly either way (currently unset for release, since only `debug` is
   configured), `crunchPngs false`, `vcsInfo.include false`, no baked-in build timestamps.
   Touches only `apps/android/app/build.gradle.kts`.
2. **Pin toolchain versions exactly** — already true here (AGP `8.7.3`, Kotlin `2.0.21`,
   Gradle `8.11.1` via the committed wrapper, all pinned with no `+`/ranges per the existing
   comment in `libs.versions.toml`). This is the one reproducibility precondition already
   satisfied.
3. **Deterministic signing** — `apksigner` behavior and JDK version affect zip/signing
   determinism; needs the same JDK major version (17, already pinned in CI) used consistently
   between our release build and F-Droid's rebuild.
4. **A `metadata/<appId>.yml` recipe accepted into `fdroiddata`**, naming our exact commit,
   Gradle invocation and (once we have one) release flavour — this is F-Droid-maintainer-side
   work triggered by a submission, not something we produce unilaterally.
5. **Verify the actual rebuild matches** — only checkable once F-Droid's build server runs
   it, i.e. only discoverable after submitting; nothing to pre-verify locally beyond following
   the checklist above.

None of this needs a build flavour or new dependency — it's Gradle config plus process
discipline, most of it front-loaded into step 1.

## 5. Signing and identity — the irreversible decisions

F-Droid (and IzzyOnDroid, and Android's own package manager) identify one app as the
_continuation_ of a previous install by two things together: the `applicationId`
(`net.auralis.app`) and the certificate that signs the APK. Android refuses to install an
update whose signature doesn't match the one already on the device — that's not an F-Droid
policy, it's how `PackageManager` works. Change either the id or the key and every existing
user's client sees it as a _different app_: no update path, forced uninstall, and every piece
of on-device state Auralis owns (DataStore preferences, offline downloads) is lost, since
Android scopes app-private storage to `applicationId` and wipes it on uninstall. This is why
ROADMAP.md §11 calls it a one-way door, and why this document stops short of picking one
for the user.

**Options for the signing key:**

- **Reproducible-build signing** (F-Droid publishes our own signature, via the
  `AllowedAPKSigningKeys` + `Binaries` mechanism described in §4) — the outcome we want for
  official F-Droid regardless of which of the below we pick, since it's what lets a user
  update seamlessly between IzzyOnDroid, GitHub releases and official F-Droid without
  reinstalling.
- **A key we generate and control**, kept as a CI secret (GitHub Actions
  `secrets.ANDROID_KEYSTORE_BASE64` + `secrets.ANDROID_KEYSTORE_PASSWORD`, decoded to a file
  in a release job step, never committed — `.gitignore` already excludes `*.keystore`). This
  is the only real option: F-Droid does not hold a key on our behalf for anything except the
  case where they _also_ sign an F-Droid-key build for update continuity across install
  sources, which is an additional, opt-in signature, not a replacement for having our own.
- **If the key is lost**: there is no recovery. A new key means a new "app" as far as every
  installed client is concerned — the only mitigation is to keep the keystore backed up
  redundantly (a password manager or an offline copy) outside of CI secret storage, which is
  the only copy by design once it's uploaded there.

**Recommendation** (flagged, not decided): generate a dedicated release keystore now, store
it as a GitHub Actions secret, and pursue reproducible-build signing with F-Droid once
official submission starts — this gets us update continuity across all three routes without
requiring F-Droid to hold a key we don't also possess. **This is the user's decision to make,
not this document's** — it has not been taken, and nothing should generate a keystore until
it is.

**Package name**: `net.auralis.app` reads as reverse-DNS on the domain `auralis.net`.
Whether this project or the user controls `auralis.net` is not established anywhere in this
repo or its docs — `docs/setup/` and `CLAUDE.md` never mention domain ownership, and this
investigation did not check WHOIS (out of scope for a code-audit agent, and irrelevant to
buy-vs-not-buy without a user decision anyway). F-Droid does **not** verify domain ownership
for application ids
([Inclusion Policy](https://f-droid.org/en/docs/Inclusion_Policy/), fetched 2026-08-06). Its
two relevant sentences, quoted separately because they sit in different sections: "All
applications must have their own distinct Android 'Application ID'", and "It is advised to
use an Application ID that stems from a domain name owned by the developer." Advised, not
verified. The real risk isn't rejection, it's collision:
if `auralis.net` is owned by an unrelated third party, or is later registered by someone
else who ships an Android app under the same reverse-DNS convention, there is no technical
conflict (application ids only need to be unique within one distribution channel, and
official F-Droid rejects only _exact_ id collisions with an existing listing) but it is a
naming collision an outside reader could reasonably read as impersonation. Confirming
`auralis.net` ownership (or picking an id independent of any real-world domain, e.g.
`net.patakihara.auralis` matching the GitHub org `patakihara`) is a five-minute check with
consequences that last as long as the app does — worth resolving before the key is cut,
since it's cut once.

## 6. `versionCode` discipline and release automation

Current state: `versionCode = 1`, `versionName = "0.1.0"`, hardcoded in
`apps/android/app/build.gradle.kts`; no git tags exist in this repo yet (`git tag` returns
nothing).

**Proposed scheme**: monotonic `versionCode` derived from a counter, not from the semver
tag directly — semver can't monotonically order pre-1.0 versions the way F-Droid needs, and
a scheme that's simple to reason about beats one that's clever. Concretely: `versionCode`
= number of release tags pushed so far (i.e. increments by exactly 1 per release, computed
in CI as `git tag --list 'v*' | wc -l` at tag time, or a checked-in counter file if
tag-counting proves fragile across rebases). `versionName` stays the human-readable semver
tag (`v0.2.0` → `"0.2.0"`), read from the tag rather than hand-edited in Gradle, to remove
the chance of the two drifting.

**What a release run must produce**, each a candidate CI job step once a keystore secret
exists:

1. A signed release APK (`./gradlew assembleRelease`, once the `release` build type from §4
   exists), built from the exact tagged commit.
2. The APK attached to a GitHub Release for that tag (IzzyOnDroid polls this directly).
3. A changelog file at `metadata/en-US/changelogs/<versionCode>.txt`, written per-release
   (max 500 characters per IzzyOnDroid's fastlane convention, [Inclusion How-To](https://f-droid.org/docs/Inclusion_How-To/), fetched 2026-08-06).

**Metadata layout F-Droid/IzzyOnDroid expect** (fastlane convention, either
`fastlane/metadata/android/en-US/` or `metadata/en-US/` depending on tooling):

```
metadata/en-US/
  short_description.txt      # < 80 chars, no trailing period
  full_description.txt
  changelogs/
    <versionCode>.txt         # one per release, ≤ 500 chars
  images/
    icon.png
    phoneScreenshots/         # at least one; two or more is the convention
    featureGraphic.png        # optional but conventional
```

**What we don't have yet — a real blocker, not a formality**: this repo has **no launcher
icon at all**. `apps/android/app/src/main/res/` contains only `values/` and `xml/` — no
`mipmap-*` directories, no adaptive-icon XML. The app currently launches with Android's
default icon. This blocks both the Play-Store-style store listing icon _and_ the on-device
launcher icon, and is arguably higher priority than anything else in this document since it
affects every install, not just F-Droid ones. No phone screenshots and no feature graphic
exist either (nothing under any `res/` or `docs/` path matches `*screenshot*` or
`*graphic*`). All three are required by IzzyOnDroid's own policy (§2) before submission.

## 7. What to do first — an ordered, costed plan

Each step below is scoped to be one delegable wave. Steps marked **[BLOCKED — user decision]**
cannot start until §5's signing/package-name question is answered; everything else can
proceed in parallel with that question being open.

1. **Design and add a launcher icon** (adaptive icon XML + `mipmap-*` PNG exports, or a
   single vector via `res/drawable` + `AndroidManifest.xml`'s `android:icon`). Touches
   `apps/android/app/src/main/res/mipmap-*/`, `AndroidManifest.xml`. Not blocked — needed
   regardless of distribution route.
2. **Capture phone screenshots and write store-listing copy** (`short_description.txt`,
   `full_description.txt`) once the app has a real icon to screenshot. Touches
   `metadata/en-US/` (new directory) and nothing under `apps/android/**`. Not blocked.
3. **[BLOCKED — user decision]** Resolve `applicationId`/domain and generate the release
   keystore, store it as a GitHub Actions secret. Nothing downstream can be signed until this
   lands.
4. **Add a `release` build type with the determinism flags from §4**, and a release CI job
   gated on a git tag push, producing a signed APK attached to a GitHub Release. Touches
   `apps/android/app/build.gradle.kts` and `.github/workflows/android.yml`
   (check `docs/HANDOVER.md`'s "Claimed work" list before editing — it is where concurrent
   sessions record which files they hold, and it claimed `.github/workflows/ci.yml` on
   2026-08-06). Depends on step 3.
5. **Tag `v0.1.0` (or whatever the first release is called), verify the release job produces
   a working signed APK**, install it on a real device via `adb install` if a JDK/SDK becomes
   available, or ask the user to sideload-verify. Depends on step 4.
6. **File the IzzyOnDroid inclusion issue**, once §8's AI-authorship question is resolved and
   step 5's first signed release exists. This is the actual "we're listed" milestone.
7. **Only after IzzyOnDroid is live and stable**, prepare an official-F-Droid submission:
   write `metadata/<appId>.yml`, verify reproducibility locally against the release build
   (needs the `./gradlew :app:dependencies` transitive audit from §3 first), and open the
   `fdroiddata` merge request.

## 7b. The anti-AI policy question, settled (2026-08-15)

Re-verified against live sources rather than this document's earlier reading, because the user
asked directly whether publishing Auralis would violate anyone's policy and wanted an accurate
answer rather than a favourable one. Three routes, three different answers:

- **A self-hosted repo violates nothing, and this is confirmed rather than inferred.** F-Droid's
  own Inclusion Policy states that an app not meeting its criteria "can still make the app
  available to F-Droid users via a separate repository" — self-hosting is the sanctioned
  alternative, in as many words. IzzyOnDroid's policy is scoped entirely to its own catalogue
  and claims no reach beyond it. Nothing is submitted, reviewed or listed, so no inclusion
  policy is engaged at all. `fdroidserver` is AGPL/GPL, which governs redistributing modified
  copies of the tool, not the apps it packages.
- **A GitHub Releases tab is outside both policies** for the same reason, more obviously.
- **IzzyOnDroid would be a real violation if submitted** — the policy is current and explicit,
  and Auralis falls squarely inside it. Re-fetched 2026-08-15, wording unchanged from §1's
  record. The decision not to submit stands.
- **Official F-Droid has no documented AI-authorship policy** — its Inclusion Policy does not
  mention AI-generated or AI-assisted code at all, and the question is an open, unresolved
  community thread with no maintainer position. That is "no rule today", **not** "definitely
  fine": the topic is under active discussion and a policy could be adopted before or during
  any review. Moot while official F-Droid is out of scope, but this is the honest
  characterisation if it is ever revisited.

The practical consequence: the route already chosen is structurally outside the reach of any
inclusion policy, so nothing about the current plan needs changing on policy grounds.

## 8. Open questions for the user

- **Does IzzyOnDroid's stated opposition to apps "fully or in part created by generative AI
  tools" ([source](https://izzyondroid.org/docs/general/AppInclusionPolicy/), fetched
  2026-08-06) block submitting Auralis at all?** Most of this codebase was written by Claude
  subagents under this project's delegation model (`CLAUDE.md`, "Delegation" section). This
  investigation cannot judge how IzzyOnDroid's maintainers would apply that policy to a
  project like this one — it can only surface that the policy exists and quote it exactly.
  Worth asking IzzyOnDroid directly (their inclusion issue process) before investing in steps
  1–5 above if this is a hard blocker, since it would change the recommended route in §1.
- **Do we control `auralis.net`?** Determines whether `net.auralis.app` is a safe
  `applicationId` to commit to permanently, or whether a different id
  (e.g. `net.patakihara.auralis`) should be chosen instead, per §5.
- **Own key vs. F-Droid reproducible-build signing vs. both?** §5 recommends generating our
  own key regardless and pursuing reproducible signing later, but the decision — and the act
  of generating and storing the keystore — is the user's to make and execute, not this
  investigation's.
- **Is the user comfortable with the changelog/description/screenshot process (§6) as an
  ongoing per-release obligation**, or does the effort of maintaining fastlane metadata on
  every release change the cost-benefit of pursuing F-Droid distribution at all against just
  continuing to sideload the CI debug APK?

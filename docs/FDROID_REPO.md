# Self-hosted F-Droid repository — operator's guide

This is how to get Auralis into Droid-ify **without** IzzyOnDroid and **without** official
F-Droid. `docs/HANDOVER.md`'s phase 11 entry has why: IzzyOnDroid's inclusion policy opposes
apps "fully or in part created by generative AI tools," and Auralis was written almost
entirely by Claude subagents, so that route is closed by their own stated policy. Official
F-Droid needs a reproducible from-source build recipe this project has not pursued. A
self-hosted repository needs neither — Droid-ify (and the F-Droid app itself) can add any
URL as a repository, as long as that URL serves a properly signed F-Droid repository index.
That's what `.github/workflows/fdroid-repo.yml` builds and publishes to GitHub Pages on
every release tag.

This doc is written for the repo owner running the release, not for a contributor reading
the source.

## What a repository URL actually needs to be (and why "just a GitHub Releases page" is not enough)

The starting assumption going into this was "we need a GitHub releases page." That's true
for the plain sideloaded-APK route (`release.yml` already does this — every tag gets a
GitHub Release with the APK attached), but it is **not** what makes a URL addable as an
F-Droid/Droid-ify _repository_. A repository is a different, stricter thing:

- A client adding a repository URL fetches a **signed index** from it — `index-v2.json`
  plus a signed `entry.jar`/`entry.json` pair in the current format (`index-v1.jar`/
  `index-v1.json` in the older one), not a directory listing and not a GitHub Releases
  page. `fdroid update` (part of `fdroidserver`) is what generates these files from a
  directory of APKs. A plain folder of `.apk` files with no index will not be recognized
  as a repository at all — that last sentence is an inference, not a quotation: the cited
  page says "Running `fdroid update` ... creates the repository index files" and does not
  separately spell out what happens without them.
  ([Setup an F-Droid App Repo](https://f-droid.org/en/docs/Setup_an_F-Droid_App_Repo/),
  fetched 2026-08-07.)
- **The repository signing key is a separate key from any APK signing key.** `fdroid init`
  generates (or `keytool -genkey` manually creates) a keystore used only to sign the repo's
  index — it has nothing to do with the key(s), if any, used to sign the APKs the repo
  serves. F-Droid's own documentation states this directly: there are "two kinds of signing
  involved in running a repository: the signing of the repo index itself" and "the standard
  Android APK signing process".
  ([Signing Process](https://f-droid.org/docs/Signing_Process/), fetched 2026-08-07. The
  `Release_Channels_and_Signing_Keys` page shows a repo fingerprint and an APK fingerprint
  side by side but never says in words that they are different keys — cite `Signing_Process`
  for this, not that page.) Auralis's APK release-signing key is a separate by-hand step
  below ("What you have to do by hand", step 1) from the repo signing key this section is
  about — the two must never be conflated, and generating one does not require the other to
  exist first.
- **The `?fingerprint=` parameter in a repo URL is the SHA-256 fingerprint of the
  _repository_ signing certificate** — not of any APK's certificate. It lets a client
  verify, out of band, that the index it downloaded over plain HTTPS was actually signed by
  the key its owner intended, the same role a TLS certificate pin plays. It is **not** a
  stored config field — `fdroidserver` computes it at index-build time: `index.py` calls
  `extract_pubkey()`, keeps the result in a local `repo_pubkey_fingerprint`, and formats the
  link as `'{link}?fingerprint={fingerprint}'`. (`config.yml`'s optional key is
  `repo_pubkey`, the full public key; there is no `repo_key_sha256` field anywhere in the
  project. Read directly from
  [fdroidserver on GitHub](https://github.com/f-droid/fdroidserver) — `fdroidserver/index.py`,
  `fdroidserver/init.py`, `examples/config.yml` — 2026-08-07.)
- **Plain static hosting is sufficient.** An F-Droid repository is nothing but static files
  — `index-v2.json`, `entry.jar`, an `icons/` directory, and the APKs themselves — served
  over HTTPS. No server-side logic, no database, no special MIME types. GitHub Pages (or
  any static host) works. This is corroborated by observing real self-hosted repos already
  running this way in the wild (e.g. [FUTO's F-Droid repo](https://app.futo.org/fdroid/repo/), a
  plain static path) rather than by an explicit "GitHub Pages is supported" statement in
  F-Droid's own docs, which don't name any particular host.

So the user's instinct was half right: a GitHub Releases page is necessary for
`release.yml`'s existing sideload flow (and stays exactly as it is — nothing here replaces
it), but it is not what Droid-ify needs for a _repository_ URL. That needs a signed index,
which needs a repository signing key the user has to generate once, by hand, and never
commit to the repo.

## What you have to do by hand (once)

`.github/workflows/fdroid-repo.yml` will not run past its `check-secrets` job — it fails
loudly and does nothing else — until all four secrets below exist. Nothing here can be
automated further without generating a key on your behalf, which this implementation
deliberately does not do (see `docs/research/FDROID_DISTRIBUTION.md` §5 on why a lost or
CI-generated-and-forgotten key is unrecoverable).

1. **Generate the app signing key**, in an empty directory outside this git repo (never
   commit it — same rule as step 3 below):

   ```
   keytool -genkey -v -keystore release.keystore -alias auralis \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

   `keytool` prompts for a keystore password, a key password, and a distinguished name (the
   name fields don't matter — Droid-ify never shows them). Use two different, strong,
   randomly generated passwords, same as the repo key below.

   **This key cannot be skipped, deferred, or regenerated later without cost.** Android
   ties app identity to `applicationId` + signing certificate together — every release built
   with this key installs as an update over the last one, and a release built with a
   _different_ key does not. The moment a second, different key ever signs a published
   `net.develivarr.auralis` release, every existing install fails `INSTALL_FAILED_UPDATE_INCOMPATIBLE`
   on the next update, and the only fix is uninstalling first, which deletes the app's local
   data. Generate it once, back it up (same durability as step 3 below — a password manager
   attachment or an encrypted offline copy, never only on one machine), and reuse it for
   every release from here on.

   Add four repository secrets at
   `github.com/patakihara/curly-spoon/settings/secrets/actions`:

   | Secret name                 | Value                                                      |
   | --------------------------- | ---------------------------------------------------------- |
   | `ANDROID_KEYSTORE_BASE64`   | `base64 -w0 release.keystore` (the whole output, one line) |
   | `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose above                      |
   | `ANDROID_KEY_ALIAS`         | `auralis` (or whatever `-alias` you used above)            |
   | `ANDROID_KEY_PASSWORD`      | the key password you chose above                           |

   Until these four exist, `.github/workflows/release.yml`'s `check-secrets` job fails
   loudly and builds nothing — it does not fall back to publishing a debug-signed APK.
   `apps/android/app/build.gradle.kts`'s own fallback (debug signing, with a build-time
   warning) exists only for local developer builds and `android.yml`'s branch/PR runs, which
   carry no secrets and were never meant to produce a distributable artifact.

2. **Install `fdroidserver` locally** (not on this machine — see `CLAUDE.md`'s environment
   notes; do this on any machine with Python): `pip install fdroidserver`.
3. **Generate the repo signing key**, in an empty directory outside this git repo (it must
   never be committed — `.gitignore` already excludes `*.keystore`, but this key is a
   `.p12` file, so double-check before adding anything to git):
   ```
   mkdir auralis-fdroid-keys && cd auralis-fdroid-keys
   fdroid init
   ```
   `fdroid init` prompts for a keystore password and a key password (use two different,
   strong, randomly generated values — a password manager's generator is fine) and writes
   `keystore.p12` plus a `config.yml` in that directory. It also prints the **repo
   fingerprint** — the SHA-256 value from the section above. **Write that fingerprint down
   somewhere durable** (a password manager note); you'll need it for step 5.
4. **Back up `keystore.p12` redundantly, outside of GitHub.** A password manager's file
   attachment or an encrypted offline copy. If this file is lost, there is no recovery path
   — a new key means Droid-ify (and anyone else) sees the repo's future publishes as an
   entirely different, untrusted repository. This is the repo-index key's own version of the
   same one-way-door reasoning step 1 above applies to the (separate) app signing key.
5. **Add four repository secrets** at
   `github.com/patakihara/curly-spoon/settings/secrets/actions`:

   | Secret name                     | Value                                                                                    |
   | ------------------------------- | ---------------------------------------------------------------------------------------- |
   | `FDROID_REPO_KEYSTORE_BASE64`   | `base64 -w0 keystore.p12` (the whole output, one line)                                   |
   | `FDROID_REPO_KEYSTORE_PASSWORD` | the keystore password you chose in step 3                                                |
   | `FDROID_REPO_KEY_ALIAS`         | the key alias `fdroid init` used — check `config.yml`'s `repo_keyalias` (usually `repo`) |
   | `FDROID_REPO_KEY_PASSWORD`      | the key password you chose in step 3                                                     |

6. **Enable GitHub Pages via Actions**, once, at
   `github.com/patakihara/curly-spoon/settings/pages` → Build and deployment → Source →
   "GitHub Actions". (Not "Deploy from a branch" — the workflow uses
   `actions/deploy-pages`, which needs the Actions source mode.)
7. **Push a release tag** (`git tag v0.2.0 && git push origin v0.2.0`, or whatever the next
   version is). This is the same tag `release.yml` already reacts to for the Docker image
   and the GitHub Release — nothing new to remember there.
8. **Add the repo to Droid-ify**: Settings → Repositories → `+` → URL
   `https://patakihara.github.io/curly-spoon/repo`, fingerprint = the value `fdroid init`
   printed in step 3 (or re-derive it any time from the workflow's own log — see
   "How to verify it worked" below).

## What CI does automatically, on every `v*` tag push, once the above is done

1. Validates the tag shape (same regex `release.yml` uses) and refuses a fork.
2. Derives this release's `versionCode` from the full semver-sorted tag history
   (`scripts/fdroid-versioncode.mjs` — a plain incrementing count is not used because it
   isn't safe against a hotfix tag landing after a later release; see that file's header).
3. Builds the release-signed APK (`./gradlew assembleRelease`, keystore decoded from
   `ANDROID_KEYSTORE_BASE64`) stamped with that `versionCode` and the tag's `versionName` —
   the same app signing key and the same artifact `release.yml` attaches to the GitHub
   Release, so an install from this repo updates in place across both channels.
4. Writes this release's changelog entry to `metadata/en-US/changelogs/<versionCode>.txt`
   from the same `git log` diff `release.yml`'s changelog step already computes, truncated
   to the 500-character convention F-Droid/fastlane changelogs use.
5. Runs `fdroid update` to build a signed `index-v2.json`/`entry.jar` from the APK plus
   `metadata/net.develivarr.auralis.yml`, using the _repo_ keystore decoded from
   `FDROID_REPO_KEYSTORE_BASE64` — this signs the index, not the APK inside it; the APK
   keeps the app signing key from step 3.
6. Publishes the resulting `repo/` directory to GitHub Pages.

If any of the eight secrets (four `ANDROID_*` app-signing, four `FDROID_REPO_*` repo-index)
is missing, the workflow's `check-secrets` job fails immediately, before building anything,
and names exactly which secret is absent in the workflow log — it will not publish a
partial or broken repo.

## How to verify it worked

- Check the `F-Droid repo` workflow run in the Actions tab for the pushed tag — every job
  green means the repo published.
- The `Print the repo signing key fingerprint` step's log line is the fingerprint to
  double-check against what Droid-ify shows when you add the repo — they must match
  exactly, or Droid-ify is refusing to trust an index it can't verify (in which case:
  double check you copied the fingerprint `fdroid init` printed, not something else).
- Open `https://patakihara.github.io/curly-spoon/repo/index-v2.json` directly in a browser
  — a real repo returns JSON; a 404 means Pages isn't serving from the right path (check
  step 5's "Source" setting) or the workflow hasn't completed a run yet.
- In Droid-ify, after adding the repo, Auralis should appear in its app list with the
  version you just tagged.

## What this does **not** do

- **No release-signed APK.** Every APK this repo serves is the same debug-signed build CI
  always produces. This is orthogonal to the repo signing key covered above — see
  `docs/research/FDROID_DISTRIBUTION.md` §5 for that separate, still-open decision. Droid-ify
  does not care: it trusts the _repository_ index's signature, and installs whatever APK
  that index points to, debug-signed or not.
- **No IzzyOnDroid or official F-Droid submission.** Both remain closed per
  `docs/HANDOVER.md`'s phase 11 entry; nothing here changes that.
- **No launcher icon.** `docs/research/FDROID_DISTRIBUTION.md` §6 already flagged that
  Auralis has no app icon at all (default Android icon only) — that's a separate, still-open
  gap this workflow does not touch, and it will show up as a generic icon in Droid-ify's
  listing too.

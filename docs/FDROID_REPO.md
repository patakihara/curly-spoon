# Self-hosted F-Droid repository: operator's guide

Auralis installs through Droid-ify (or the F-Droid app) from its own repository, not from
IzzyOnDroid or official F-Droid. IzzyOnDroid's inclusion policy opposes apps "fully or in part
created by generative AI tools", and official F-Droid needs a reproducible from-source build
recipe this project does not keep. Droid-ify can add any URL as a repository, as long as that
URL serves a properly signed F-Droid repository index. `.github/workflows/fdroid-repo.yml`
builds one and publishes it to GitHub Pages on every release tag.

This guide is for the repo owner running a release, not for a contributor reading the source.

## What a repository needs

- **A signed index, not a folder of APKs or a Releases page.** A client adding a repository
  fetches `index-v2.json` and a signed `entry.jar`/`entry.json` pair from it. `fdroid update`
  (part of `fdroidserver`) generates these from a directory of APKs.
  ([Setup an F-Droid App Repo](https://f-droid.org/en/docs/Setup_an_F-Droid_App_Repo/).)
  `release.yml` still attaches the APK to a GitHub Release for sideloading; the repository is
  a second channel for the same APK.
- **Two different signing keys.** The repository signing key signs only the index. The app
  signing key signs the APK. F-Droid's docs name "two kinds of signing involved in running a
  repository: the signing of the repo index itself" and "the standard Android APK signing
  process" ([Signing Process](https://f-droid.org/docs/Signing_Process/)). Neither key needs
  the other to exist first, and they must never be confused.
- **The `?fingerprint=` in a repository URL is the SHA-256 of the repository signing
  certificate**, not of any APK's. It lets a client check, out of band, that the index was
  signed by the key its owner intended. `fdroidserver` computes it when it builds the index
  (`fdroidserver/index.py`); it is not a config field.
- **Plain static hosting.** The repository is only static files: `index-v2.json`,
  `entry.jar`, an `icons/` folder and the APKs, served over HTTPS. GitHub Pages works.

## What you do by hand, once

`fdroid-repo.yml` and `release.yml` each start with a `check-secrets` job that fails loudly,
naming what is missing, and builds nothing until their secrets exist. Nothing here generates a
key for you: a lost or CI-generated-and-forgotten key cannot be recovered.

1. **Generate the app signing key**, in an empty folder outside this git repo, and never
   commit it:

   ```
   keytool -genkey -v -keystore release.keystore -alias auralis \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

   Use two different, strong, random passwords for the keystore and the key. The name fields
   don't matter.

   **This key can't be replaced later without cost.** Android ties an app's identity to its
   `applicationId` and signing certificate together. A release signed with a different key
   fails to install over the last one (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`), and the only fix
   is uninstalling, which deletes the app's local data. Back it up outside GitHub: Actions
   secrets are write-only, so they are not a backup.

   Add these repository secrets at
   `github.com/patakihara/curly-spoon/settings/secrets/actions`:

   | Secret name                 | Value                                                      |
   | --------------------------- | ---------------------------------------------------------- |
   | `ANDROID_KEYSTORE_BASE64`   | `base64 -w0 release.keystore` (the whole output, one line) |
   | `ANDROID_KEYSTORE_PASSWORD` | the keystore password                                      |
   | `ANDROID_KEY_ALIAS`         | `auralis` (or whatever `-alias` you used)                  |
   | `ANDROID_KEY_PASSWORD`      | the key password                                           |
   | `AURALIS_SERVER`            | the Auralis server the app signs in to, as an HTTPS URL    |

   The server address is a secret because the repo is public and names no host; a release build
   without `-PauralisServer` fails. `android/app/build.gradle.kts` falls back to debug signing, with a build-time warning, only
   for local builds and `android.yml`'s branch runs, which never produce a distributable APK.

2. **Install `fdroidserver`** on any machine with Python: `pip install fdroidserver`.
3. **Generate the repository signing key**, in an empty folder outside this git repo. It is a
   `.p12` file, which `.gitignore` does not cover, so take care:
   ```
   mkdir auralis-fdroid-keys && cd auralis-fdroid-keys
   fdroid init
   ```
   `fdroid init` asks for a keystore password and a key password, writes `keystore.p12` and a
   `config.yml`, and prints the repository fingerprint. Keep the fingerprint for step 8.
4. **Back up `keystore.p12` outside GitHub.** A new repository key makes Droid-ify see every
   later publish as a different, untrusted repository.
5. **Add these repository secrets**:

   | Secret name                     | Value                                                       |
   | ------------------------------- | ----------------------------------------------------------- |
   | `FDROID_REPO_KEYSTORE_BASE64`   | `base64 -w0 keystore.p12` (the whole output, one line)      |
   | `FDROID_REPO_KEYSTORE_PASSWORD` | the keystore password from step 3                           |
   | `FDROID_REPO_KEY_ALIAS`         | `config.yml`'s `repo_keyalias` from step 3 (usually `repo`) |
   | `FDROID_REPO_KEY_PASSWORD`      | the key password from step 3                                |

6. **Enable GitHub Pages from Actions** at `github.com/patakihara/curly-spoon/settings/pages`:
   Build and deployment, Source, "GitHub Actions". The workflow uses `actions/deploy-pages`,
   which needs that mode, not "Deploy from a branch".
7. **Let tags deploy to Pages.** The `github-pages` environment allows only `main` by default,
   and a tag run then fails with "not allowed to deploy to github-pages due to environment
   protection rules". Nothing in the repo records this setting, so repeat it on a fresh repo:
   ```bash
   gh api repos/<owner>/<repo>/environments/github-pages/deployment-branch-policies \
     --method POST -f name='v*' -f type='tag'
   ```
8. **Push a release tag**, for example `git tag v0.3.0 && git push origin v0.3.0`. The same tag
   runs `release.yml` (image and GitHub Release) and `fdroid-repo.yml`.

## What CI does on every `v*` tag

1. Validates the tag shape (the same pattern `release.yml` uses) and refuses a fork.
2. Derives the release's `versionCode` from the full, semver-sorted tag history
   (`scripts/fdroid-versioncode.mjs`; its header says why a plain count is unsafe).
3. Builds the release-signed APK with that `versionCode` and the tag's `versionName`, signed
   with the app signing key, so an install from either channel updates the other in place.
4. Writes the release's changelog to `metadata/en-US/changelogs/<versionCode>.txt`, cut to the
   500-character limit F-Droid changelogs use.
5. Runs `fdroid update` to build the signed index from the APK and
   `metadata/net.develivarr.auralis.yml`, signing it with the repository key.
6. Publishes the `repo/` folder to GitHub Pages.

## Adding it to Droid-ify

Settings, Repositories, `+`:

- **URL:** `https://patakihara.github.io/curly-spoon/repo`
- **Fingerprint:** `0C:1F:6A:63:C0:F5:96:19:27:A0:CF:DF:4B:B0:16:60:72:67:D4:83:4B:54:10:3A:4B:BB:44:6F:43:BC:6C:41`

Droid-ify must show that same fingerprint. Every `F-Droid repo` run prints it again in its
`Print the repo signing key fingerprint` step.

## Checking a release

- Every job of the tag's `F-Droid repo` run is green.
- `https://patakihara.github.io/curly-spoon/repo/index-v2.json` returns JSON. A 404 means
  Pages is not serving from Actions (step 6) or no run has finished yet.
- **The index agrees with where it is served.** `index-v2.json`'s `repo.address` is the address
  the repository claims for itself, written by `fdroid update` from `config.yml`'s `repo_url`.
  It must equal the URL added to Droid-ify. If the upload path and the address disagree, a
  client can add the repository and list the app, then fail only at install. The workflow
  stages `site/repo/` so the served layout matches the address; change `repo_url` and the
  upload path together or not at all.
- Droid-ify lists Auralis at the version just tagged.

## What this does not do

- No IzzyOnDroid or official F-Droid submission.
- `release.yml` builds its APK without `-PauralisVersionCode`/`-PauralisVersionName`, so the
  APK on a GitHub Release reports `build.gradle.kts`'s default version in Android's app info.
  It is signed with the same key, so it still updates in place either way; the F-Droid
  repository's APK carries the tag's real version.
- No launcher icon: Auralis shows Android's default icon, in Droid-ify's listing too.

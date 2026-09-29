# Confirm the Android signing keys are backed up outside GitHub

kind: physical
default: releases carry on; the keys stay only in GitHub's secrets until you confirm a backup.

Option A: say "the keys are backed up" once `release.keystore` (the app key) and `keystore.p12`
(the F-Droid repository key) are in your password manager or another place outside GitHub.
Option B: say "I don't have them" and the session sets up a backup path with you.

Without the app key, the installed app can never update in place again: every phone would have to
uninstall and reinstall. GitHub stores the keys only as secrets, which cannot be read back out. A
search of the laptop's Linux side and of mediaserver found no copy of either key.

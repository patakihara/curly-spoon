# Release the first rebuild APK to your F-Droid repository

kind: published
default: hold. No release is tagged until you answer; everything else carries on.

Option A: say "release it" and the session tags `v0.3.0`. The release workflow then builds the
signed APK, attaches it to a GitHub Release and adds it to the F-Droid repository, so Droid-ify
offers it as an update over 0.2.0.
Option B: say "hold the release until It plays" and it waits for the first milestone that plays
your books on the phone.

What you would get today: the rebuild signs in with your household account and every screen is
there, with placeholder content. Only a test track plays. Installing it replaces the working 0.2.0
app on your phone, and the old app can't be restored without uninstalling.

This is the step the Foundations item "same repository" needs (a live check that the repository
serves a version above 0.2.0, then your sign-off that it installed as an update).

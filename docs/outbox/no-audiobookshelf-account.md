# Signing in without an Audiobookshelf account

kind: product call
default: they sign in and get music only; Auralis never creates accounts on the other servers.

Half the household has a Jellyfin account but no Audiobookshelf account. By default they sign in
to Auralis fine and get music from Jellyfin, with "No Audiobookshelf account yet" where books and
podcasts would be, until someone makes them an Audiobookshelf account.

The alternative: Auralis makes the Audiobookshelf account itself at their first sign-in, with
the admin key it already holds for minting keys. Say which you want.

If the household owner's Audiobookshelf account is root, it can't be linked this way, since an
admin key cannot mint a key for root; a non-root account for her fixes it.

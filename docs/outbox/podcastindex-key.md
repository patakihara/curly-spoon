# A PodcastIndex key for podcast search

kind: physical
default: podcast search uses Apple's podcast directory (iTunes) alone, which needs no key. PodcastIndex results join it once a key exists.

To add PodcastIndex: sign up for a free API key at https://api.podcastindex.org/signup with your
email, then say "PodcastIndex key is ready" and paste the key and secret where the session asks
(they go into Auralis's key file on mediaserver, never the repo). Apple's directory covers most
shows; PodcastIndex adds independent ones Apple lacks.

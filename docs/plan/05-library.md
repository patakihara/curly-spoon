---
id: library
nav: Library & accounts
part: The product
---
## Library and accounts

### Your library

- **Library pages stay pure.** Music, Books and Podcasts only ever show what's in your library plus your requests. External items appear only on Browse, in Search's requestable section, and on artist or author pages (on by default).
- **Artist and author pages** show the whole catalogue by default, unowned titles greyed out and requestable, with a setting to hide them.
- **Library:** a 3-across grid on phones, bigger on desktop, a grid/list toggle, and sort by title, artist or **Random** (tap again to reshuffle).
- **In-library marking:** not-playable items are greyed out. Streamable ones stay normal, with a subtle marker. Where the marker goes is still open.
- **Artist pages:** what Spotify does, plus a bit more. Not limited to your library, with an "In your library" carousel.

### Accounts, and one listening session per device

- **Users**: each household member has their own account, taste profile, queues, lists, digests and recommendations. Everyone signs in through the household's single sign-on (Authelia over LLDAP, used by ABS and Shelfarr; Jellyfin checks the same directory through its LDAP plugin), with Auralis as one more OpenID Connect client. At first sign-in Auralis finds each person's ABS and Jellyfin user by login name, ignoring case and accents, and pins those upstream ids; a household member with no ABS account gets a listen-only one created by Auralis, while Jellyfin accounts are never created. Unlike the old code, identity never rests on Audiobookshelf alone. Members of the `lldap_admin` group are Auralis admins, and the admin role owns providers, paths and approvals.
- **Sessions are per device, and by default they don't mix**: the phone's queue and the laptop's queue are separate. Each device resumes its own session where it left off, even after a restart, because sessions are stored on the server per (user, device).
- **What is shared across a user's devices** is the library state, not the session. Your position in a book or episode is the same everywhere (it lives in Audiobookshelf), as are favourites, lists and history. So opening the book on the laptop resumes from where the phone left it, without the laptop taking over the phone's queue.
- **Mixing is explicit**: "Continue here" moves another device's session to this one, and "Play on…" sends this one elsewhere, like Spotify Connect but opt-in. Both are later additions; the default stays separate.
- **Recommendations are per user.** A household member's listening never leaks into someone else's Browse.

### Your YouTube account

**Watched state and position for your YouTube channels** sync with your YouTube account, opt-in per person and off until you connect it. It covers only the channels you've added; the rest of your YouTube history is never read into Auralis. Google's official API no longer exposes watch history, so this uses your own sign-in cookies, exported from your browser and stored encrypted on the server under your user only. Google doesn't support this, so it can break when YouTube changes, like the extractor.

- **From YouTube:** an hourly job checks your watch history for videos from your channels. A finished video marks the episode played; a half-watched one sets your position in it. YouTube only exposes that position as a percentage of the length, so Auralis resumes a few seconds before it (1% of an hour is 36&nbsp;s). Anything else in the history is skipped, not stored.
- **To YouTube:** on pause and on stop, Auralis sends YouTube your position, using the same "watched up to here" report YouTube's own player sends; finishing an episode marks the video watched. Whichever side played most recently wins.
- **Accounts never mix.** Each person connects their own YouTube account, and their cookies are only ever used for their own sync, writing to their own Audiobookshelf progress. The show feeds themselves are fetched without any account, so they're identical for everyone and carry nothing personal. A person who hasn't connected YouTube just has no sync.
- **When it breaks:** the cookies expire every so often. When they stop working, sync pauses and Settings shows a clear "YouTube sign-in expired" warning with how to re-export them. Nothing else is affected: YouTube channels keep updating and playing, since they don't need your account.
- **Cut episodes, full videos.** Auralis keeps each episode's cut list, so position sync converts between the cut episode and the full YouTube video: 10 minutes into the episode becomes the matching point in the video, and back.

### Shared files, personal view

- **Files are stored once, for the whole household**, as today: one Music, one Books and one Podcasts library in Jellyfin and Audiobookshelf.
- **Auralis shows each person their own library**: what they added, requested, subscribed to, or have played. Auralis records who added what; things already on the server count as yours once you've played them.
- **Everyone else's things stay findable.** Search covers the whole household library, and those results play straight away instead of offering a request.
- **"Show everyone's library" is a setting**, off by default and only in Settings, not a toggle in the library screens.
- The Audiobookshelf and Jellyfin apps are unchanged and still show everything.

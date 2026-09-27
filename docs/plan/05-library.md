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

- **Users**: each household member has their own account, taste profile, queues, lists, digests and recommendations. Everyone signs in through the household's single sign-on (Delivarr, at `auth.delivarr.net`, already live for Audiobookshelf, Jellyfin and Shelfarr), with Auralis as one more OpenID Connect client. The same username is their Audiobookshelf and Jellyfin account, so Auralis maps each person to their own upstream users. That fixes the old code, where identity depended on Audiobookshelf alone. Members of the `lldap_admin` group are Auralis admins, and the admin role owns providers, paths and approvals.
- **Sessions are per device, and by default they don't mix**: the phone's queue and the laptop's queue are separate. Each device resumes its own session where it left off, even after a restart, because sessions are stored on the server per (user, device).
- **What is shared across a user's devices** is the library state, not the session. Your position in a book or episode is the same everywhere (it lives in Audiobookshelf), as are favourites, lists and history. So opening the book on the laptop resumes from where the phone left it, without the laptop taking over the phone's queue.
- **Mixing is explicit**: "Continue here" moves another device's session to this one, and "Play on…" sends this one elsewhere, like Spotify Connect but opt-in. Both are later additions; the default stays separate.
- **Recommendations are per user.** A household member's listening never leaks into someone else's Browse.

### Shared files, personal view

- **Files are stored once, for the whole household**, as today: one Music, one Books and one Podcasts library in Jellyfin and Audiobookshelf.
- **Auralis shows each person their own library**: what they added, requested, subscribed to, or have played. Auralis records who added what; things already on the server count as yours once you've played them.
- **Everyone else's things stay findable.** Search covers the whole household library, and those results play straight away instead of offering a request.
- **"Show everyone's library" is a setting**, off by default and only in Settings, not a toggle in the library screens.
- The Audiobookshelf and Jellyfin apps are unchanged and still show everything.

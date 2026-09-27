# Jellyfin API key for Auralis

kind: physical
default: Audiobookshelf recordings go ahead; Jellyfin's wait, and M0.record stays open.

Auralis needs its own Jellyfin key to record Jellyfin's answers. Creating one needs an admin
login, and a session can't use yours. In Jellyfin: Dashboard → API Keys → + → name it
`Auralis`, then copy the key. On mediaserver, run this and paste the key when it waits (it
isn't echoed):

    (umask 077; mkdir -p ~/.config/auralis; read -rs k && printf 'JELLYFIN_API_KEY=%s\n' "$k" >> ~/.config/auralis/upstream-keys.env)

Then say "done". Nothing else changes. If you'd rather have a session add the key to Jellyfin's
database under sudo, say so; that stops Jellyfin for about a minute.

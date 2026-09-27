# A sign-on account for Auralis's recordings

kind: physical
default: the sign-on code lands without its recordings; the sign-in recording test and M0.sso wait.

To record a real sign-in, Auralis needs its own account in the household sign-on, one that is
not a household member, so Jellyfin and the other apps never let it in. Creating it needs the
LLDAP admin login. In LLDAP: create a group `auralis_service`, then a user `auralis` in that
group only, with a long random password. On mediaserver, run this and paste the password when
it waits (it isn't echoed):

    (umask 077; mkdir -p ~/.config/auralis; read -rs p && printf 'OIDC_TEST_PASSWORD=%s\n' "$p" >> ~/.config/auralis/oidc.env)

Then say "done". Or say "a session may do it", and a session creates both with the LLDAP admin
credential file, without ever printing it.

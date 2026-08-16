repo: patakihara/curly-spoon
branch: main
path: apps/web

## Last sync

date: 2026-08-16T11:22:00Z

### Updated in this project

- Rebuilt the Auralis web UI in the Sonora design system (desktop + mobile frames, light/dark).
- Fixed audit defects: chrome (rail, mini player, bottom nav) is now docked; only content scrolls.
- Search is one relevance-ordered mixed list with per-item status labels instead of per-type groups.
- Adaptive shell rig at 1440 / 1280 / 1024 / 768 px: panel drops below 1240, rail collapses below 1024.
- Books now has a real library screen (the repo's nav pointed straight at a detail page); Podcasts rebuilt to match Music.
- Selected nav destinations use the Material Symbols FILL axis.

## Screen map

| Screen                            | Built from                                                                 |
| --------------------------------- | -------------------------------------------------------------------------- |
| Shell (rail, panel, player bar)   | apps/web/src/components/Shell.tsx, components/destinations.ts              |
| For you                           | apps/web/src/features/home/HomePage.tsx                                    |
| Music / Album                     | apps/web/src/features/music/MusicHomePage.tsx, MusicAlbumPage.tsx          |
| Book detail                       | apps/web/src/features/item/ItemPage.tsx                                    |
| Podcasts                          | apps/web/src/features/podcasts/PodcastDetailPage.tsx                       |
| Search                            | apps/web/src/features/search/SearchPage.tsx                                |
| Now Playing / Queue / Mini player | apps/web/src/features/player/NowPlaying.tsx, MiniPlayer.tsx, QueueView.tsx |
| Settings / Onboarding             | apps/web/src/features/settings/SettingsPage.tsx, features/onboarding/*     |
| Content fixtures                  | apps/server/src/testSupport/fakes/fakeJellyfin.ts                          |

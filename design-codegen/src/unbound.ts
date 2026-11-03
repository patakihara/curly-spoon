/**
 * Every action the apps leave unbound, and the plan item that binds it. A Sonora control with no
 * action draws disabled, so this is the list of what staging shows disabled, and why. A key is
 * `<page>/<Component>.<prop>` for a control a page of nav.json draws, or `shell/<Component>.<prop>`
 * for one the shell draws around a page; a line stands while either app leaves that action unbound
 * on some element of that page, at some layout. Binding an action deletes its line.
 */
export const UNBOUND: Readonly<Record<string, string>> = {
  // Playing: tracks and rows, a playlist, the queue and the desktop bar's volume.
  'album/ResultRow.onClick': 'M1.play',
  'artist/ResultRow.onClick': 'M1.play',
  'book/ResultRow.onClick': 'M1.play',
  'browse/ResultRow.onClick': 'M1.play',
  'favourites/ResultRow.onClick': 'M1.play',
  'playlist/MediaHeader.onPlay': 'M1.play',
  'playlist/ResultRow.onClick': 'M1.play',
  'queue/QueuePage.onPlay': 'M1.play',
  'shell/MiniPlayer.onVolume': 'M1.play',
  // The queue: play next or last, shuffle, repeat, switching, clearing and editing it.
  'album/MediaHeader.onPlayLast': 'M1.sessions',
  'book/MediaHeader.onPlayNext': 'M1.sessions',
  'nowPlaying/NowPlayingPage.onRepeat': 'M1.sessions',
  'nowPlaying/NowPlayingPage.onShuffle': 'M1.sessions',
  'playlist/MediaHeader.onPlayLast': 'M1.sessions',
  'queue/QueuePage.onClear': 'M1.sessions',
  'queue/QueuePage.onQueueChange': 'M1.sessions',
  'queue/QueuePage.onRemove': 'M1.sessions',
  'queue/QueuePage.onRemoveSelected': 'M1.sessions',
  'shell/MiniPlayer.onRepeat': 'M1.sessions',
  'shell/MiniPlayer.onShuffle': 'M1.sessions',
  // Android's transport: play and pause, previous and next, skip, seek, speed and sleep.
  'nowPlaying/NowPlayingPage.onNext': 'M5.player',
  'nowPlaying/NowPlayingPage.onPrev': 'M5.player',
  'nowPlaying/NowPlayingPage.onSeek': 'M5.player',
  'nowPlaying/NowPlayingPage.onSkipBack': 'M5.player',
  'nowPlaying/NowPlayingPage.onSkipForward': 'M5.player',
  'nowPlaying/NowPlayingPage.onSleep': 'M5.player',
  'nowPlaying/NowPlayingPage.onSpeed': 'M5.player',
  'nowPlaying/NowPlayingPage.onTogglePlay': 'M5.player',
  'shell/MiniPlayer.onNext': 'M5.player',
  'shell/MiniPlayer.onPrev': 'M5.player',
  'shell/MiniPlayer.onSeek': 'M5.player',
  'shell/MiniPlayer.onSkipBack': 'M5.player',
  'shell/MiniPlayer.onSkipForward': 'M5.player',
  'shell/MiniPlayer.onSleep': 'M5.player',
  'shell/MiniPlayer.onSpeed': 'M5.player',
  'shell/MiniPlayer.onTogglePlay': 'M5.player',
  // The lyrics sheet's own controls.
  'lyrics/LyricsPage.onSyncModeChange': 'M5.player',
  // Detail and home screens: tabs, editions, the episode sort.
  'album/ExpanderRow.onToggle': 'M5.screens',
  'books/TabBar.onChange': 'M5.screens',
  'music/TabBar.onChange': 'M5.screens',
  'show/SortFilterBar.onClick': 'M5.screens',
  // Search, and the context menus.
  'album/OverflowMenu.onSelect': 'M5.searchui',
  'artist/OverflowMenu.onSelect': 'M5.searchui',
  'book/OverflowMenu.onSelect': 'M5.searchui',
  'episode/OverflowMenu.onSelect': 'M5.searchui',
  'favourites/OverflowMenu.onSelect': 'M5.searchui',
  'list/OverflowMenu.onSelect': 'M5.searchui',
  'search/ButtonGroup.onChange': 'M5.searchui',
  'search/ResultRow.onClick': 'M5.searchui',
  'search/SearchField.onChange': 'M5.searchui',
  'search/SearchField.onSubmit': 'M5.searchui',
  'search/SortFilterBar.onClick': 'M5.searchui',
  'shell/NowPlaying.onMore': 'M5.searchui',
  'show/OverflowMenu.onSelect': 'M5.searchui',
  // Downloads.
  'book/MediaHeader.onDownload': 'M5.downloads',
  'downloads/IconButton.onClick': 'M5.downloads',
  'downloads/ResultRow.onClick': 'M5.downloads',
  'downloads/ValueRow.onClick': 'M5.downloads',
  'episode/MediaHeader.onDownload': 'M5.downloads',
  // Listening lists.
  'episode/MediaHeader.onAdd': 'M2.lists',
  'list/SortFilterBar.onClick': 'M2.lists',
  'playlist/IconButton.onClick': 'M2.lists',
  // The library grid: view and sort.
  'books/SortFilterBar.onSelect': 'M5.library',
  'books/ViewToggle.onChange': 'M5.library',
  'music/SortFilterBar.onSelect': 'M5.library',
  'music/ViewToggle.onChange': 'M5.library',
  'podcasts/SortFilterBar.onSelect': 'M5.library',
  'podcasts/ViewToggle.onChange': 'M5.library',
  'shelf/ViewToggle.onChange': 'M5.library',
  // Settings and first-run setup.
  'settings/FieldRow.onChange': 'M5.settings',
  'settings/SettingRow.onChange': 'M5.settings',
  'setup/FieldRow.onChange': 'M5.settings',
  'setup/SettingRow.onChange': 'M5.settings',
  // Requests.
  'author/MediaCard.onRequest': 'M3.requests',
  'book/MediaCard.onRequest': 'M3.requests',
  'books/MediaCard.onRequest': 'M3.requests',
  'requests/Button.onClick': 'M5.library',
  'requests/IconButton.onClick': 'M5.library',
  'requests/ResultRow.onClick': 'M5.library',
  'series/MediaCard.onRequest': 'M3.requests',
  'shelfReview/ResultRow.onClick': 'M3.requests',
  // Search's outside results.
  'search/Button.onClick': 'M5.searchui',
  'search/ExpanderRow.onToggle': 'M5.searchui',
  // Following podcasts.
  'show/FollowButton.onChange': 'M3.podcasts',
  // Saving a song.
  'nowPlaying/NowPlayingPage.onFavourite': 'M3.keep',
  // Browse's filter, feature cards and previews.
  'browse/ButtonGroup.onChange': 'M5.browseui',
  'browse/PreviewButton.onClick': 'M5.browseui',
};

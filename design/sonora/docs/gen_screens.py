#!/usr/bin/env python3
"""Generate docs/screens/S**.md — one per supplied Spotify screenshot.

The mapping below is the record of the affordance pass: for each screenshot, which
Sonora components were created, which were extended, and which already covered the
affordance and were used unchanged. Edit here, never the generated files.
"""
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screens")

# Shorthand for components that recur across almost every screen.
CHROME = [
    ("MiniPlayer", "Persistent now-playing surface docked above the tab bar."),
    ("BottomNav", "Home / Search / Your Library / Create destinations."),
]

SCREENS = [
{
 "id": "S01", "title": "Podcast show — episode list, scrolled",
 "source": "Show detail page, Episodes tab, scrolled past the header.",
 "observed": [
   "Each episode carries a two-line synopsis, not just a title — you choose an episode by reading it.",
   "A meta chain compresses four facts into one line: play count, publication date, duration, and a listened state.",
   "\"Finished\" is a distinct terminal state, marked with a filled check, separate from part-played progress.",
   "Per-episode verbs sit on the row itself — save, download, share, more — each showing its own state.",
   "The filter/sort state is *stated* above the list (\"All episodes • Newest\") and is itself the control that changes it.",
   "A floating pill offers escape from a list with no bottom.",
 ],
 "created": [
   ("EpisodeRow", "A row that can carry a synopsis, a multi-part meta chain and a finished state. `ResultRow` holds one meta line and one status pill; widening it would bend it out of shape for the track and request lists already using it."),
   ("DownloadButton", "Offline availability as idle → downloading → done, cancellable mid-flight."),
   ("SortFilterBar", "One control that both reports the active ordering and opens the picker. The label is data, not a name, which is why a plain button will not do."),
 ],
 "extended": [
   ("Badge", "`icon`, `plain`", "The \"Finished\" marker qualifies the episode rather than counting anything, so a filled counting pill reads wrongly for it."),
 ],
 "existing": [
   ("TabBar", "Episodes / About / More like this, with the underline indicator — already exactly this."),
   ("CoverArt", "Episode artwork with the gradient fallback."),
 ] + CHROME,
 "notbuilt": [],
},
{
 "id": "S02", "title": "Podcast show — header",
 "source": "Show detail page, top of scroll.",
 "observed": [
   "Search is scoped to this show — \"Find in this show\" — rather than global.",
   "A verification marker qualifies the publisher.",
   "An aggregate rating gives value and population together: 4,8 (17,7K).",
   "The subscribe control's label states the current state (\"Following\"), not the action, so pressing it stops.",
   "Notification and settings toggles sit beside the subscribe control, scoped to this show.",
   "An already-downloaded episode shows both its save and download controls filled and toned.",
 ],
 "created": [
   ("FollowButton", "A subscription toggle whose label is the state. That inverts a normal button and needs `aria-pressed`; it wraps the existing `Button` rather than reimplementing it."),
   ("Rating", "`MediaHeader` carries one freeform `meta` string, which cannot express the value / scale / population distinction. Audiobookshelf and Jellyfin both expose real ratings."),
   ("EpisodeRow", "See S01."),
   ("DownloadButton", "The `done` state."),
   ("SortFilterBar", "See S01."),
 ],
 "extended": [
   ("Badge", "`icon`, `plain`", "The verified marker is an attribute of the publisher, not a count."),
   ("Button", "`pressed`", "`FollowButton` wraps `Button`, and `Button` destructures its seven props and renders its own element — so an `aria-pressed` passed through was silently dropped and the toggle had no pressed semantics at all. Only the real element can carry it. Undefined emits no attribute, so every ordinary button is untouched."),
 ],
 "existing": [
   ("SearchField", "Scoped search needs no new component — this is `SearchField` with a scoped placeholder. Sofia ruled out new search inputs by name."),
   ("MediaHeader", "Large art, kind label, title, subtitle, meta."),
   ("TabBar", "Episodes / About / More like this."),
   ("IconButton", "The bell, gear and overflow controls."),
   ("CoverArt", "Show artwork."),
 ] + CHROME,
 "notbuilt": [
   "**`MediaHeader` needs an `actions` slot** to host Follow + bell + gear + overflow in place of its play/next/last cluster. Identified but deliberately deferred: `MediaHeader.jsx` was not in the mirrored working set for this wave, and extending a component without its source in hand is how additive changes stop being additive. Next wave.",
 ],
},
{
 "id": "S03", "title": "Search — browse hub",
 "source": "Search tab, top.",
 "observed": [
   "Below the search field the whole screen is category tiles — you enter a category whose contents you cannot yet name.",
   "Each tile is colour-coded and carries artwork tilted out of its corner, so it reads as a stack of content rather than a label.",
 ],
 "created": [
 ],
 "extended": [],
 "existing": [
   ("SearchField", "The query input. No new search component is needed."),
   ("LayoutGrid", "Reflows the tiles without breakpoints."),
 ] + CHROME,
 "notbuilt": [
   "**Camera / scan-to-search.** Spotify scans its own barcodes; meaningless against a private self-hosted library.",
 ],
},
{
 "id": "S04", "title": "Search — browse hub, scrolled",
 "source": "Search tab, scrolled.",
 "observed": [
   "The search field pins to the top while the categories scroll under it — search stays reachable at any depth.",
   "Category tiles continue in the same rhythm; hue is decorative, not semantic.",
 ],
 "created": [],
 "extended": [],
 "existing": [
   ("SearchField", "Pinned; a page's heading already holds its search."),
   ("LayoutGrid", "Same grid, continued."),
 ] + CHROME,
 "notbuilt": [],
},
{
 "id": "S05", "title": "Home — All filter",
 "source": "Home tab, \"All\" selected, top of scroll.",
 "observed": [
   "A filter row longer than the screen, scrolling horizontally, with the account avatar pinned outside the scroll.",
   "A dense two-column grid of resumable tiles: each shows how far in you are, and a subscribed one shows there is something new.",
   "A wide card argues for one episode at length — artwork, kind, title, blurb, and its own actions.",
   "A persistent bar states that the client is offline. It does not time out; it is a condition, not an event.",
 ],
 "created": [
   ("FeatureCard", "The most-repeated shape in the whole set. `MediaCard` is a square tile with two caption lines and `ResultRow` is a compact row; neither can carry a description, and the description is the point — this is a recommendation that has to persuade."),
   ("StatusBanner", "Sonora had no ambient status surface. This matters more for Auralis than for Spotify: a self-hosted library on a LAN goes unreachable routinely, and the user needs to know that is why the shelves are empty."),
 ],
 "extended": [
   ("QuickPick", "`progress`, `unplayed`", "A grid of tiles cannot be triaged at a glance without showing resume position and unplayed state."),
   ("ButtonGroup", "`scroll`, `leading`", "Sonora's group assumes every segment fits. Home, Library and Search all overflow, and all three pin an avatar before the first segment."),
   ("SectionHeader", "`eyebrow`, `image`", "Used here in its plain form; the contextual form arrives at S09."),
 ],
 "existing": [
   ("LayoutGrid", "The two-column tile grid."),
   ("Shelf", "The horizontal 'Your shows' carousel."),
   ("Section", "Feed rhythm between blocks."),
 ] + CHROME,
 "notbuilt": [],
},
{
 "id": "S06", "title": "Home — Your shows, Recents",
 "source": "Home tab, scrolled to the shelves.",
 "observed": [
   "A card's caption leads with the *kind* or genre, then the title in bold, then the author — type before name, because kind is what you scan for first.",
   "A section offers a text action, \"Show all\", rather than an icon.",
   "A saved item carries a bookmark tab on its artwork.",
   "Recents mixes finished, part-played and unstarted items in one shelf, each showing its own state.",
 ],
 "created": [],
 "extended": [
   ("MediaCard", "`eyebrow`, `savedBadge`", "Sonora's `sub` puts the type *after* the title. In a mixed shelf the kind is what you scan for first, so it belongs above. `savedBadge` carries saved state without spending a caption row."),
   ("SectionHeader", "`actionText`", "`action` is glyph-only; \"Show all\" is a text action."),
   ("Section", "forwards `actionText`", "Without the forward, the header extension is unreachable from the component feeds are actually built from."),
 ],
 "existing": [
   ("Shelf", "Horizontal carousel with platform-appropriate paging affordances."),
   ("MediaCard", "`progress` already draws the resume bar."),
   ("Badge", "The finished check."),
 ] + CHROME,
 "notbuilt": [],
},
{
 "id": "S07", "title": "Home — Recents into Audiobooks for you",
 "source": "Home tab, scrolled.",
 "observed": [
   "Shelves of different content types share one card shape, distinguished only by the eyebrow.",
   "A downloaded item marks itself in the caption line rather than on the artwork.",
 ],
 "created": [],
 "extended": [
   ("MediaCard", "`eyebrow`, `markers`", "`markers` lets the caption carry pinned/offline state without spending a row."),
   ("SectionHeader", "`actionText`", "\"Show all\"."),
 ],
 "existing": [("Shelf", "Carousel."), ("Section", "Feed rhythm.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S08", "title": "Home — Recommended Stations",
 "source": "Home tab, scrolled.",
 "observed": [
   "A generated mix names what seeded it — the caption is a list of artists, not a description.",
   "The card's artwork is a composite of the seed artists.",
 ],
 "created": [],
 "extended": [
   ("MediaCard", "`eyebrow`", "Carries the \"Station\" kind above the name."),
 ],
 "existing": [("Shelf", "Carousel."), ("CoverArt", "Composite artwork."), ("Section", "Feed rhythm.")] + CHROME,
 "notbuilt": [
   "**A station / radio card.** The \"RADIO\" plate and the wordmark are brand, not affordance. The affordance underneath — *a generated mix, and what seeded it* — is `MediaCard` with `eyebrow` plus the seed list in `sub`.",
 ],
},
{
 "id": "S09", "title": "Home — \"More like Alkaline Trio\"",
 "source": "Home tab, scrolled to a contextual shelf.",
 "observed": [
   "The shelf explains itself: an eyebrow naming the relationship, the subject in bold, and the subject's own artwork as a thumbnail.",
   "The thumbnail is circular for a person and square for a show or genre — shape encodes the subject's type.",
   "The header is pressable: it leads to the subject that produced the recommendation.",
 ],
 "created": [],
 "extended": [
   ("SectionHeader", "`eyebrow`, `image`, `round`, `onSubject`", "**The most valuable single change in this pass.** Spotify almost never shows a bare title. This converts an opaque recommendation into an explained one. Auralis already computes a `reason` string per recommendation shelf server-side with no UI able to carry it — this is that UI."),
   ("Section", "forwards the above", "So feeds can use it."),
   ("MediaCard", "`eyebrow`", "\"Artist\" / \"Playlist\" above the name."),
 ],
 "existing": [
   ("MediaCard", "`shape=\"round\"` — the circular person card, unchanged."),
   ("Shelf", "Carousel."),
 ] + CHROME,
 "notbuilt": [],
},
{
 "id": "S10", "title": "Home — \"More like\" an episode",
 "source": "Home tab, scrolled.",
 "observed": [
   "The same explained-shelf pattern, but seeded by an *episode* — so the thumbnail is square, not circular.",
   "Items with no artwork fall back to a generic placeholder rather than an empty box.",
 ],
 "created": [],
 "extended": [
   ("SectionHeader", "`eyebrow`, `image`", "Square thumbnail — `round` omitted, which is how the subject's type is expressed."),
   ("MediaCard", "`eyebrow`", "Kind above the title."),
 ],
 "existing": [("CoverArt", "Owns the artwork fallback already."), ("Shelf", "Carousel.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S11", "title": "Home — stacked \"More like\" shelves",
 "source": "Home tab, scrolled.",
 "observed": [
   "Several explained shelves stack in a row, each with a different subject — the eyebrow is what keeps them distinguishable.",
   "Episode cards carry a one-line description under the title, unlike album cards.",
 ],
 "created": [],
 "extended": [
   ("SectionHeader", "`eyebrow`, `image`", "Repeated use; consistency across stacked shelves is the point."),
   ("MediaCard", "`eyebrow`", "Kind line."),
 ],
 "existing": [("Shelf", "Carousel."), ("Section", "Feed rhythm.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S12", "title": "Home — Jump back in",
 "source": "Home tab, scrolled.",
 "observed": [
   "A resume shelf mixes playlists, albums and stations; the eyebrow is the only thing separating them.",
   "The title is bold, the artist muted below — three distinct caption lines.",
 ],
 "created": [],
 "extended": [("MediaCard", "`eyebrow`", "Three-line caption: kind above, title bold, artist muted below.")],
 "existing": [("Shelf", "Carousel."), ("Section", "Feed rhythm."), ("SectionHeader", "Plain title, no eyebrow — this shelf needs no explanation.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S13", "title": "Home — Made For <user>",
 "source": "Home tab, scrolled.",
 "observed": [
   "A personalised shelf addresses the user by name in its title.",
   "Each mix's caption is its seed list rather than a description.",
 ],
 "created": [],
 "extended": [("MediaCard", "`eyebrow`", "Kind above the mix name.")],
 "existing": [("SectionHeader", "Plain title carries the personalisation; no eyebrow needed."), ("Shelf", "Carousel.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S14", "title": "Home — placeholder artwork in a shelf",
 "source": "Home tab, scrolled.",
 "observed": [
   "Where artwork is missing the card shows a generic glyph on a flat surface, keeping the grid rhythm intact.",
   "A missing image never collapses the card or shifts its neighbours.",
 ],
 "created": [],
 "extended": [("MediaCard", "`eyebrow`", "Kind line.")],
 "existing": [("CoverArt", "Already owns the fallback, and already removes the gradient once a real image loads — the antialiasing detail its own doc comment explains."), ("Shelf", "Carousel.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S15", "title": "Home — episode feature card",
 "source": "Home tab, scrolled.",
 "observed": [
   "A wide card: artwork, title, show • age • duration, a two-line blurb, an overflow menu, and three actions.",
   "\"Preview episode\" auditions a sample *without* adding the item or displacing what is playing.",
   "The card is tinted, so a column of them reads as distinct recommendations rather than a list.",
 ],
 "created": [
   ("FeatureCard", "See S05. Shown here in its episode form."),
   ("PreviewButton", "Audition before committing. `Button` commits and `PlayActions` commits; Sonora had no control for sampling."),
 ],
 "extended": [("SectionHeader", "`eyebrow`, `image`, `round`", "The \"More like The Cardigans\" shelf beneath it.")],
 "existing": [("CoverArt", "Artwork."), ("IconButton", "The overflow control.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S16", "title": "Home — Shows that you might like",
 "source": "Home tab, scrolled.",
 "observed": [
   "Discovery cards for shows not in the library, captioned by genre rather than by progress.",
   "Publisher is a third caption line under the title.",
 ],
 "created": [],
 "extended": [("MediaCard", "`eyebrow`", "Genre above the title, publisher in `sub`.")],
 "existing": [
   ("MediaCard", "`absent` already expresses not-in-library, which is the state these are in."),
   ("Shelf", "Carousel."),
 ] + CHROME,
 "notbuilt": [],
},
{
 "id": "S17", "title": "Home — \"Popular with listeners of\" and a playlist feature card",
 "source": "Home tab, scrolled.",
 "observed": [
   "A third relationship phrasing — \"Popular with listeners of\" — proving the eyebrow must be free text, not an enum.",
   "The feature card also serves playlists: owner, track count and seed artists replace the blurb, and \"Preview playlist\" replaces \"Preview episode\".",
 ],
 "created": [
   ("FeatureCard", "The playlist form — same shape, different content."),
   ("PreviewButton", "`kind=\"playlist\"` selects the label."),
 ],
 "extended": [("SectionHeader", "`eyebrow`, `image`", "Free-text relationship, square subject thumbnail.")],
 "existing": [("CoverArt", "Placeholder artwork."), ("Shelf", "Carousel.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S18", "title": "Home — Made for you, More like an artist",
 "source": "Home tab, scrolled.",
 "observed": [
   "A subject with no artwork still gets a thumbnail slot, filled with a generic person glyph — the header shape never collapses.",
   "The feature card's tint is derived from its artwork, not from the content type.",
 ],
 "created": [("FeatureCard", "Tinted playlist card."), ("PreviewButton", "Playlist preview.")],
 "extended": [("SectionHeader", "`eyebrow`, `image`, `round`", "Circular subject thumbnail with a glyph fallback.")],
 "existing": [("CoverArt", "Fallback."), ("MediaCard", "Shelf cards.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S19", "title": "Home — Music filter",
 "source": "Home tab, \"Music\" selected.",
 "observed": [
   "Selecting a filter changes the *set of filters offered* — \"Following\" appears that was not there under All.",
   "The whole feed recomposes; shelves are filtered, not merely reordered.",
 ],
 "created": [],
 "extended": [
   ("ButtonGroup", "`scroll`, `leading`", "The set is both overflowing and dynamic; the pinned avatar stays put while segments change."),
   ("SectionHeader", "`eyebrow`, `image`, `round`, `actionText`", "Explained shelves and \"Show all\" persist across filters."),
   ("MediaCard", "`eyebrow`, `markers`", "Captions unchanged by the filter."),
 ],
 "existing": [("Shelf", "Carousel."), ("Section", "Feed rhythm.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S20", "title": "Home — Podcasts filter",
 "source": "Home tab, \"Podcasts\" selected.",
 "observed": [
   "Subscribed shows appear as a dense artwork-only grid — no captions, because the artwork is the identifier.",
   "An unplayed show carries a small dot on its artwork; that dot is the entire unread model.",
   "A feature card recommends an episode under \"Similar to your interests\".",
 ],
 "created": [("FeatureCard", "Episode recommendation."), ("PreviewButton", "Sample control.")],
 "extended": [
   ("MediaCard", "`unplayed`", "The dot is the whole unread affordance and there was no way to express it."),
   ("ButtonGroup", "`scroll`, `leading`", "Filter row."),
   ("SectionHeader", "`eyebrow`", "\"Similar to your interests\"."),
 ],
 "existing": [("LayoutGrid", "The artwork-only grid."), ("CoverArt", "Artwork.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S21", "title": "Home — Podcasts, tinted feature cards",
 "source": "Home tab, Podcasts, scrolled.",
 "observed": [
   "Each feature card takes a different tint from its own artwork — two stacked cards stay visually separable.",
   "One card's preview control is dimmed: **no sample is available**. A fourth state, not a disabled button in the ordinary sense.",
 ],
 "created": [
   ("FeatureCard", "`tint` is what keeps stacked cards separable."),
   ("PreviewButton", "`disabled` — no sample available is a real state, distinct from idle, playing and muted."),
 ],
 "extended": [("SectionHeader", "`eyebrow`", "Relationship lines above both shelves.")],
 "existing": [("CoverArt", "Artwork."), ("IconButton", "Overflow.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S22", "title": "Home — Podcasts, Recents and Catch up",
 "source": "Home tab, Podcasts, scrolled.",
 "observed": [
   "Recents shows saved-episode tabs, finished checks and progress bars side by side in one shelf.",
   "\"Catch up on your shows\" is a feature card seeded by subscription rather than by similarity.",
 ],
 "created": [("FeatureCard", "Catch-up card."), ("PreviewButton", "Sample control.")],
 "extended": [
   ("MediaCard", "`savedBadge`, `eyebrow`", "Saved tab on artwork; kind above the title."),
   ("SectionHeader", "`actionText`", "\"Show all\"."),
 ],
 "existing": [("Badge", "Finished check."), ("MediaCard", "`progress` bar."), ("Shelf", "Carousel.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S23", "title": "Home — Podcasts, Episodes you might like",
 "source": "Home tab, Podcasts, scrolled.",
 "observed": [
   "Two stacked feature cards with strongly different tints and one dimmed preview.",
   "A card with placeholder artwork still takes a tint, so the layout never loses its rhythm.",
 ],
 "created": [
   ("FeatureCard", "`tint` holds even with placeholder artwork."),
   ("PreviewButton", "`disabled` again — confirming it is a recurring state, not an edge case."),
 ],
 "extended": [],
 "existing": [("CoverArt", "Placeholder."), ("Section", "Feed rhythm.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S24", "title": "Home — Podcasts, explicit marker",
 "source": "Home tab, Podcasts, scrolled.",
 "observed": [
   "An explicit-content marker sits inline before the title: a small square glyph, not a pill.",
   "\"New episode from <show>\" is a fourth relationship phrasing.",
 ],
 "created": [("FeatureCard", "`explicit` renders the marker before the title.")],
 "extended": [
   ("Badge", "`square`, `plain`", "The E marker is square, not a pill — a pill reads as a count. `square` is the whole reason this extension exists."),
   ("SectionHeader", "`eyebrow`, `image`", "Another relationship phrasing; free text confirmed necessary."),
 ],
 "existing": [("MediaCard", "Shelf cards."), ("Shelf", "Carousel.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S25", "title": "Home — Audiobooks filter",
 "source": "Home tab, \"Audiobooks\" selected.",
 "observed": [
   "**An audiobook feature card has no play control** — only preview and save. You sample or you acquire; you do not start a ten-hour book from a feed card.",
   "The offline banner persists across filters.",
 ],
 "created": [
   ("FeatureCard", "This screen is why `onPlay` is optional and the play control is omitted when it is absent, rather than disabled. A deliberate asymmetry, not an oversight."),
   ("PreviewButton", "`kind=\"audiobook\"`."),
   ("StatusBanner", "Offline condition."),
 ],
 "extended": [("ButtonGroup", "`scroll`, `leading`", "Filter row.")],
 "existing": [("CoverArt", "Artwork."), ("IconButton", "Overflow.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S26", "title": "Home — Audiobooks, Popular with listeners of",
 "source": "Home tab, Audiobooks, scrolled.",
 "observed": [
   "An audiobook shelf captions with author rather than genre.",
   "The explained-shelf pattern spans all three media types unchanged.",
 ],
 "created": [("FeatureCard", "Audiobook form.")],
 "extended": [("SectionHeader", "`eyebrow`, `image`", "Same component, third media type — evidence the abstraction is right.")],
 "existing": [("MediaCard", "Author in `sub`."), ("Shelf", "Carousel.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S27", "title": "Home — Audiobooks, stacked feature cards",
 "source": "Home tab, Audiobooks, scrolled.",
 "observed": [
   "Long blurbs are clamped to two lines; the clamp is what keeps a column of cards scannable.",
   "The dimmed preview recurs on audiobooks too.",
 ],
 "created": [
   ("FeatureCard", "Two-line description clamp."),
   ("PreviewButton", "`disabled`."),
 ],
 "extended": [],
 "existing": [("CoverArt", "Artwork."), ("Section", "Feed rhythm.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S28", "title": "Home — Audiobooks, \"Based on your interest in\"",
 "source": "Home tab, Audiobooks, scrolled.",
 "observed": [
   "A fifth relationship phrasing, seeded by a *genre* rather than by an item — the thumbnail is a generic glyph on a flat surface.",
   "The subject of an explained shelf need not be a library item at all.",
 ],
 "created": [("FeatureCard", "Audiobook card.")],
 "extended": [
   ("SectionHeader", "`eyebrow`, `image`", "A genre subject is why `image` is a plain string with a fallback rather than a required item reference."),
 ],
 "existing": [("MediaCard", "Author captions."), ("Shelf", "Carousel.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S29", "title": "Home — Audiobooks, cross-media recommendation",
 "source": "Home tab, Audiobooks, scrolled.",
 "observed": [
   "A *podcast* seeds an *audiobook* shelf — the relationship crosses media types.",
   "This is exactly the cross-media affinity Auralis already computes and has never surfaced.",
 ],
 "created": [("FeatureCard", "Audiobook card.")],
 "extended": [
   ("SectionHeader", "`eyebrow`, `image`", "The subject and the shelf contents are different media types; nothing in the component may assume they match."),
 ],
 "existing": [("MediaCard", "Author captions."), ("Shelf", "Carousel.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S30", "title": "Home — Audiobooks, placeholder feature cards",
 "source": "Home tab, Audiobooks, scrolled.",
 "observed": [
   "Feature cards with no artwork still tint, still clamp, still lay out identically.",
   "Save is offered without play, consistently across every audiobook card.",
 ],
 "created": [
   ("FeatureCard", "Confirms the no-play audiobook rule is systematic."),
   ("PreviewButton", "Idle and disabled side by side."),
 ],
 "extended": [],
 "existing": [("CoverArt", "Placeholder."), ("IconButton", "Overflow.")] + CHROME,
 "notbuilt": [],
},
{
 "id": "S31", "title": "Your Library",
 "source": "Your Library tab.",
 "observed": [
   "A filter row of content types, again overflowing.",
   "A sort control states the current ordering and opens the picker; the list/grid switch sits opposite it on the same row.",
   "Item captions carry pinned and downloaded markers as glyphs *inline with* the type and owner, not on a separate line.",
   "Artist entries use circular artwork; everything else is square.",
 ],
 "created": [
   ("SortFilterBar", "The library's \"Alphabetical\" row. Its `trailing` slot is what lets the existing `ViewToggle` sit opposite the sort label without a bespoke layout."),
 ],
 "extended": [
   ("ButtonGroup", "`scroll`, `leading`", "Third overflowing filter row in the set."),
   ("MediaCard", "`markers`", "Pinned and downloaded as inline caption glyphs — this screen is the reason `markers` is a list rather than two booleans."),
 ],
 "existing": [
   ("ViewToggle", "The list/grid switch already exists; it goes in `SortFilterBar`'s `trailing` slot."),
   ("MediaCard", "`shape=\"round\"` — circular artwork for people."),
   ("LayoutGrid", "The item grid."),
 ] + CHROME,
 "notbuilt": [],
},
{
 "id": "S32", "title": "Search results",
 "source": "Search tab, query entered.",
 "observed": [
   "Type-filter pills narrow the results, overflowing horizontally.",
   "Every result row offers an overflow menu and an add control — you act on a result without leaving the list.",
   "Seven versions of one song fold behind \"More releases · Show all\", so other result types stay reachable.",
 ],
 "created": [
   ("ExpanderRow", "Sonora's lists are flat; there was no way to say \"there are more of these, but not here\". Collapsing a homogeneous group is what keeps a heterogeneous result list usable."),
 ],
 "extended": [
   ("ResultRow", "`trailing`", "`ResultRow` offers exactly one action, on the artwork. Search needs an overflow menu and an add control at the row's trailing edge."),
   ("ButtonGroup", "`scroll`", "The type-filter row."),
 ],
 "existing": [
   ("SearchField", "`onClose` already renders the clear control. No new search component — ruled out by name."),
   ("ResultRow", "Art, title, type • artist meta."),
   ("MiniPlayer", "Persistent."),
   ("BottomNav", "Destinations."),
 ],
 "notbuilt": [],
},
{
 "id": "S33", "title": "Now Playing — podcast",
 "source": "Player, expanded, spoken-word content.",
 "observed": [
   "**The transport is not a music transport.** Speed, skip back 15s, play, skip forward 15s, sleep timer — no shuffle, no repeat, no previous track.",
   "Skip-by-interval is the control you actually use across a two-hour episode; \"previous track\" is close to useless there.",
   "Playback rate is displayed as its current value and coloured when it is not 1×.",
   "Output routing sits on its own row beneath the transport, apart from playback itself.",
   "A collapse chevron returns the player to the bar it grew out of; the context line names both the kind and the source.",
 ],
 "created": [
   ("SpeedControl", "Rate has to be visible and one tap away while playing, and must show its current value. `ValueRow` is a filled settings row on a settings page; this is the inline form that lives in a transport row."),
 ],
 "extended": [
   ("TransportBar", "`variant`, `onSkipBack`, `onSkipForward`, `skipSeconds`, `leading`, `trailing`", "Spoken-word transport is a different verb set, not a relabelled one. Wrapping it in the music cluster would be wrong, and Auralis serves both media from one player."),
 ],
 "existing": [
   ("NowPlayingPage", "Cover, title, artist, context line, seek and the readouts — and it already declares `speed`, `sleep`, `onSpeed`, `onSleep`."),
   ("SeekBar", "Elapsed / total readouts either side of the scrubber."),
   ("PlayerSheet", "Grows out of the mini player's own rect, which is exactly this collapse gesture in reverse."),
 ],
 "notbuilt": [],
},
{
 "id": "S34", "title": "Now Playing — scrolled to About and Comments",
 "source": "Player, scrolled below the transport.",
 "observed": [
   "The player page scrolls, and beneath the transport sits the item's own description.",
   "Long prose truncates with an inline \"see more\" rather than opening a separate screen.",
   "A played check marks the episode finished from inside the card.",
   "Below that, a comment thread with reactions and replies.",
 ],
 "created": [
   ("AboutCard", "Sonora's player scrolls to lyrics and queue previews and nothing else, so an item's own description had nowhere to live."),
   ("ExpandableText", "Distinct from wave 1's `ExpanderRow`, which folds a homogeneous list group. This folds a paragraph, with the control at the end of the truncated text rather than on its own row."),
 ],
 "extended": [],
 "existing": [
   ("Badge", "The played check, using wave 1's `icon` + `plain` form."),
   ("NowPlayingPage", "`scroll` already lets the page own its scrolling."),
 ],
 "notbuilt": [
   "**Comments, replies and reactions** — commenter identity, threading, emoji reactions and a compose field. This is the largest single thing in the screenshots and the clearest omission: Auralis is a self-hosted library with one user, so there is nobody to comment to.",
 ],
},
{
 "id": "S35", "title": "Episode detail page",
 "source": "Episode page reached from the show, mini player docked.",
 "observed": [
   "The meta chain ends with a resume figure and an inline progress bar on the same line — \"1h 21m left • Finished ✓\" and the bar that says so.",
   "The action row is saved / downloaded / share / overflow beside a play button. It is not a queue cluster.",
   "The description carries inline links and its own \"see more\".",
 ],
 "created": [("ExpandableText", "The description's truncation.")],
 "extended": [
   ("MediaHeader", "`actions`, `progress`", "**Owed from S02 and deferred there**, because `MediaHeader.jsx` was not mirrored at the time; it is now. `MediaHeader`'s verbs are Play / Next / Last, and neither a show header nor an episode header wants a queue cluster. `progress` puts the resume figure and its bar on one line."),
 ],
 "existing": [
   ("DownloadButton", "The `done` state (wave 1)."),
   ("MiniPlayer", "Docked while the page is open."),
 ],
 "notbuilt": ["Comments — see S34."],
},
{
 "id": "S36", "title": "Queue — sheet over the player",
 "source": "Queue opened from the player.",
 "observed": [
   "The queue arrives as a sheet over the player rather than as a separate destination, so the artwork stays visible behind it.",
   "The playing row is accent-coloured and offers play; every other row offers a drag handle.",
   "The sheet's footer carries the sleep timer and the speed control — the two settings you change mid-listen.",
 ],
 "created": [("SpeedControl", "Shown here in the queue sheet's footer, which is the second place the same control appears.")],
 "extended": [],
 "existing": [
   ("QueuePage", "`heading`, `context`, `editing`/`onEditingChange` and a `footer` slot — the footer is exactly where the timer and speed row belongs."),
   ("QueueRow", "`current` highlights the playing row; `handle` shows the drag affordance."),
   ("PlayerSheet", "The sheet surface over the player."),
 ],
 "notbuilt": [],
},
{
 "id": "S37", "title": "Queue — sheet at full height",
 "source": "Queue sheet expanded.",
 "observed": [
   "\"Edit\" turns the list into a selection and reorder mode.",
   "The footer controls persist across the mode change.",
 ],
 "created": [],
 "extended": [],
 "existing": [
   ("QueuePage", "`editing`, `onEditingChange`, `onReorder`, `onRemoveSelected` — the whole edit mode already exists."),
   ("QueueRow", "`editing`, `selected`, `onSelectToggle`, `draggable` and the drag handlers."),
 ],
 "notbuilt": [],
},
{
 "id": "S38", "title": "Now Playing — About the podcast",
 "source": "Player, scrolled past the comments.",
 "observed": [
   "The show's own card sits at the bottom of the player and carries a subscribe control inside it.",
   "So the card is not purely informational — it is a place to act on the thing you are hearing.",
 ],
 "created": [("AboutCard", "Its `action` slot is what makes the card actionable rather than merely descriptive.")],
 "extended": [],
 "existing": [("FollowButton", "The subscribe toggle, built in wave 1 for S02.")],
 "notbuilt": ["Comments — see S34."],
},
{
 "id": "S39", "title": "Now Playing — music",
 "source": "Player, expanded, a track.",
 "observed": [
   "Music transport is the familiar five-control cluster — the same page, a different verb set from S33.",
   "A single current lyric line surfaces above the title, before any lyric sheet is opened.",
   "Audio quality is stated beside the output route: \"Lossless\".",
   "A lyrics card sits directly below the transport, tinted from the artwork.",
 ],
 "created": [],
 "extended": [],
 "existing": [
   ("TransportBar", "Shuffle / previous / play / next / repeat — unchanged, and the reason `variant` defaults to `'music'`."),
   ("Lyrics", "The card variant, with its three sync modes."),
   ("NowPlayingPage", "`lyrics`, `lyricsActiveIndex` and `onOpenLyrics` already carry the preview and its expansion; `background` already takes an artwork-derived tint."),
   ("SeekBar", "Scrubber and readouts."),
 ],
 "notbuilt": [],
},
{
 "id": "S40", "title": "Now Playing — lyrics card into About the artist",
 "source": "Player, scrolled.",
 "observed": [
   "The lyrics card offers share and expand-to-full-page without leaving the player.",
   "Beneath it, the artist's own card continues the same stack.",
 ],
 "created": [("AboutCard", "The artist card, `round`.")],
 "extended": [],
 "existing": [
   ("Lyrics", "The card surface."),
   ("LyricsPage", "The full page the expand control opens."),
   ("NowPlayingPage", "`onOpenLyrics` receives the preview's rect so the page can grow out of it."),
 ],
 "notbuilt": [],
},
{
 "id": "S41", "title": "Now Playing — About the artist and credits",
 "source": "Player, scrolled.",
 "observed": [
   "The artist card carries image, a verified mark, a follow control and a truncated bio.",
   "Below it, contributors appear as circular cards labelled by role — \"Main Artist\", \"Composer +1 more\".",
   "Service-scale metrics sit alongside: world ranking and monthly listeners.",
 ],
 "created": [("AboutCard", "Image, badge, action and an expandable bio in one card.")],
 "extended": [],
 "existing": [
   ("MediaCard", "`shape=\"round\"` — the circular person card; the role goes in `sub`, which is what a credits shelf needs."),
   ("Section", "Titles the credits block and carries the feed rhythm."),
   ("Badge", "The verified mark (wave 1's `icon` + `plain`)."),
   ("FollowButton", "The follow control."),
 ],
 "notbuilt": [
   "**World ranking and monthly-listener counts.** Service-scale popularity is meaningless for a private library. `Rating` already covers the ratings a real Audiobookshelf or Jellyfin item carries.",
   "**A dedicated credits card.** The affordance — who made this, in what role — is already served by a round `MediaCard` (`sub` = role) laid out by `Shelf` under a `Section`. Worth building only if a role-grouped layout is wanted.",
 ],
},
{
 "id": "S42", "title": "Now Playing — credits and live events",
 "source": "Player, scrolled to the bottom.",
 "observed": [
   "The credits block ends with a count and an \"Explore\" action rather than listing everyone.",
   "Below it, an events block with a date range and a ticketing link.",
 ],
 "created": [],
 "extended": [],
 "existing": [
   ("MediaCard", "`shape=\"round\"` — contributor cards."),
   ("Section", "`actionText` (wave 1) carries the \"Explore\" affordance already."),
 ],
 "notbuilt": [
   "**Live events and ticketing.** External commerce against a catalogue Auralis does not have.",
 ],
},
{
 "id": "S43", "title": "Lyrics — full page",
 "source": "Lyrics expanded from the player.",
 "observed": [
   "Lyrics take the whole surface, tinted from the artwork, with the transport docked below them.",
   "The page is dismissed by the surface that opened it, not by a back affordance of its own.",
 ],
 "created": [],
 "extended": [],
 "existing": [
   ("LyricsPage", "`heading`, `title`, `artist`, `lines`, `syncMode`, `footer` and `onClose` — this page already exists in full, and its doc comment already states that it carries no back affordance of its own."),
   ("Lyrics", "The sheet, with the sync mode that scrolls to follow the song."),
   ("LyricsSyncButton", "Cycles sync → dot → off."),
   ("SeekBar", "The docked scrubber."),
 ],
 "notbuilt": [],
},
]


def table(rows, headers):
    out = ["| " + " | ".join(headers) + " |",
           "| " + " | ".join("---" for _ in headers) + " |"]
    out += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(out)


def render(s):
    img = "../../assets/reference/spotify/%s.jpg" % s["id"]
    L = ["# %s — %s" % (s["id"], s["title"]), "", "*%s*" % s["source"], "",
         "<img src=\"%s\" alt=\"%s\" width=\"280\">" % (img, s["title"]), "",
         "## Affordances observed", ""]
    L += ["- %s" % o for o in s["observed"]]
    L += ["", "## Components", ""]

    L += ["### Created", ""]
    if s["created"]:
        L += [table([["`%s`" % c, w] for c, w in s["created"]],
                    ["Component", "Why nothing existing carried this"]), ""]
    else:
        L += ["None — this screen needed no new component.", ""]

    L += ["### Extended", ""]
    if s["extended"]:
        L += [table([["`%s`" % c, p, w] for c, p, w in s["extended"]],
                    ["Component", "Added", "Why the existing prop set fell short"]), ""]
    else:
        L += ["None.", ""]

    L += ["### Already existed — used unchanged", ""]
    L += [table([["`%s`" % c, w] for c, w in s["existing"]],
                ["Component", "Affordance it already carries"]), ""]

    if s["notbuilt"]:
        L += ["## Deliberately not built", ""] + ["- %s" % n for n in s["notbuilt"]] + [""]
    return "\n".join(L)


def main():
    os.makedirs(OUT, exist_ok=True)
    created, extended = {}, {}
    for s in SCREENS:
        with open(os.path.join(OUT, s["id"] + ".md"), "w") as fh:
            fh.write(render(s))
        for c, _ in s["created"]:
            created.setdefault(c, []).append(s["id"])
        for c, _, _ in s["extended"]:
            extended.setdefault(c, []).append(s["id"])

    idx = ["# Screens", "",
           "One document per supplied screenshot, recording which components that screen",
           "created, extended, or found already present. Generated by `docs/gen_screens.py` —",
           "edit the mapping there, never these files.", "",
           "The screenshots themselves are in `assets/reference/spotify/`, one per screen id,",
           "so the mapping from screenshot to component can be checked against its source",
           "rather than taken on trust.", "",
           "## Index", "",
           table([["[%s](%s.md)" % (s["id"], s["id"]), s["title"]] for s in SCREENS],
                 ["Screen", "What it shows"]), "",
           "## Components created, and the screens that motivated them", "",
           table([["`%s`" % c, str(len(v)), ", ".join(v)] for c, v in
                  sorted(created.items(), key=lambda kv: -len(kv[1]))],
                 ["Component", "Screens", "Seen in"]), "",
           "## Components extended, and the screens that motivated them", "",
           table([["`%s`" % c, str(len(v)), ", ".join(v)] for c, v in
                  sorted(extended.items(), key=lambda kv: -len(kv[1]))],
                 ["Component", "Screens", "Seen in"]), ""]
    with open(os.path.join(OUT, "README.md"), "w") as fh:
        fh.write("\n".join(idx))
    print("wrote %d screen docs + index" % len(SCREENS))


if __name__ == "__main__":
    main()

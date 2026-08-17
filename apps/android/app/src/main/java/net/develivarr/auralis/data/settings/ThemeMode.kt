package net.develivarr.auralis.data.settings

/**
 * Sonora's light/dark switch (wave 16f-A-1 — `docs/ROADMAP.md` §16), independent of the
 * *accent* the user also picks. [SYSTEM] is a real stored value rather than the mere absence of
 * one: [ThemePreferencesRepository.getMode] never has to distinguish "nothing was ever chosen"
 * from "the user explicitly chose to follow the system", and a caller reading the stored value
 * back (or a test asserting a round trip) sees exactly what was set.
 */
enum class ThemeMode(internal val storageKey: String) {
    LIGHT("light"),
    DARK("dark"),
    SYSTEM("system"),
    ;

    internal companion object {
        /** Unknown/corrupt/missing storage always falls back to [SYSTEM] — matching this
         * wave's default of following the OS switch until the user picks something else,
         * and total by construction rather than throwing on a value written by some future
         * app version this one doesn't know about. */
        fun fromStorageKeyOrDefault(key: String?): ThemeMode = entries.firstOrNull { it.storageKey == key } ?: SYSTEM
    }
}

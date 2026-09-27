package net.develivarr.auralis.api

import kotlinx.serialization.json.Json

/** How the app reads the server's JSON: a field added server-side must not break an older app. */
val ApiJson = Json { ignoreUnknownKeys = true }

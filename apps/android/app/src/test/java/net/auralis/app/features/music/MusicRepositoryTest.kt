package net.auralis.app.features.music

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.FakeKeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Exercises [MusicRepository] against a real [ApiClient] over [MockWebServer] — same pattern
 * `PodcastsViewModelTest` uses for its feature-level tests, rather than a hand-rolled fake
 * [ApiClient] (there is no `ApiClient` interface to fake against in this project; every test
 * that needs one goes through the real class and a real, local HTTP server).
 */
class MusicRepositoryTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var apiClient: ApiClient
    private lateinit var repository: MusicRepository

    @Before
    fun setUp() {
        mockWebServer = MockWebServer()
        mockWebServer.start()
        val cookieJar = SessionCookieJar(FakeKeyValueStore(), TestScope())
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        apiClient = ApiClient(httpClient, cookieJar) { mockWebServer.url("/").toString() }
        repository = MusicRepository(apiClient)
    }

    @After
    fun tearDown() {
        mockWebServer.shutdown()
    }

    // -----------------------------------------------------------------------------
    // availability()
    // -----------------------------------------------------------------------------

    @Test
    fun `availability reports Available with hasCredentials when Jellyfin is configured and signed in`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"configured":true,"baseUrl":"https://jellyfin.example.com","hasCredentials":true}""",
                ),
            )

            val result = repository.availability()

            val available = result as? MusicAvailability.Available
            assertEquals("https://jellyfin.example.com", available?.baseUrl)
            assertTrue(available?.hasCredentials ?: false)
        }

    /** The BFF answers `GET /jellyfin/config` successfully even when nothing is configured
     * (`{"configured":false,...}`, a 200) — this must surface as [MusicAvailability.Unconfigured],
     * not [MusicAvailability.Failed]; nothing went wrong, there is just nothing set up yet. */
    @Test
    fun `availability reports Unconfigured rather than Failed when no Jellyfin server is set up`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody("""{"configured":false,"baseUrl":null,"hasCredentials":false}"""),
            )

            val result = repository.availability()

            assertEquals(MusicAvailability.Unconfigured, result)
        }

    @Test
    fun `availability reports Failed with the upstream error code when the config call itself fails`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )

            val result = repository.availability()

            assertEquals(MusicAvailability.Failed("upstream_auth_expired"), result)
        }

    // -----------------------------------------------------------------------------
    // login()
    // -----------------------------------------------------------------------------

    @Test
    fun `login reports LoggedIn with the signed-in user's name on success`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"configured":true,"baseUrl":"https://jellyfin.example.com","user":{"id":"u1","name":"alice"}}""",
                ),
            )

            val result = repository.login("alice", "hunter2", baseUrl = "https://jellyfin.example.com")

            assertEquals(MusicLoginResult.LoggedIn("alice"), result)
        }

    @Test
    fun `login reports Failed with the upstream error code on invalid credentials rather than throwing`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"invalid_credentials","message":"Bad credentials"}}"""),
            )

            val result = repository.login("alice", "wrong")

            assertEquals(MusicLoginResult.Failed("invalid_credentials"), result)
        }

    // -----------------------------------------------------------------------------
    // artists() / albums() / tracks() — one representative pass-through test each; the exact
    // query-parameter wiring is ApiClientTest's job, this class only needs to prove the
    // Loaded/Failed mapping and that `total` survives the trip.
    // -----------------------------------------------------------------------------

    @Test
    fun `artists reports Loaded with items, total and startIndex on success`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"items":[{"id":"art1","name":"Radiohead","overview":null,"imageTag":null,"albumCount":9}],
                     "total":42,"startIndex":10}
                    """.trimIndent(),
                ),
            )

            val result = repository.artists(startIndex = 10)

            val loaded = result as? ArtistsPageResult.Loaded
            assertEquals(1, loaded?.items?.size)
            assertEquals("Radiohead", loaded?.items?.get(0)?.name)
            assertEquals(42, loaded?.total)
            assertEquals(10, loaded?.startIndex)
        }

    @Test
    fun `artists reports Failed with the upstream error code rather than throwing`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"upstream_error","message":"Jellyfin returned an error"}}"""),
            )

            val result = repository.artists()

            assertEquals(ArtistsPageResult.Failed("upstream_error"), result)
        }

    @Test
    fun `albums reports Loaded on success`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"items":[{"id":"alb1","name":"OK Computer","sortName":null,"artistId":"art1",
                     "artistName":"Radiohead","productionYear":1997,"overview":null,"genres":[],
                     "imageTag":null,"trackCount":12}],
                     "total":9,"startIndex":0}
                    """.trimIndent(),
                ),
            )

            val result = repository.albums(artistId = "art1")

            val loaded = result as? AlbumsPageResult.Loaded
            assertEquals("OK Computer", loaded?.items?.get(0)?.name)
            assertEquals(9, loaded?.total)
        }

    @Test
    fun `tracks reports Loaded on success`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"items":[{"id":"trk1","name":"Paranoid Android","albumId":"alb1","albumName":"OK Computer",
                     "artistNames":["Radiohead"],"trackNumber":2,"discNumber":1,"durationSeconds":383.5,
                     "imageTag":null,"genres":[]}],
                     "total":12,"startIndex":0}
                    """.trimIndent(),
                ),
            )

            val result = repository.tracks(albumId = "alb1")

            val loaded = result as? TracksPageResult.Loaded
            assertEquals("Paranoid Android", loaded?.items?.get(0)?.name)
            assertEquals(12, loaded?.total)
        }

    // -----------------------------------------------------------------------------
    // search()
    // -----------------------------------------------------------------------------

    @Test
    fun `search reports Loaded with artists, albums and tracks on success`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"artists":[{"id":"art1","name":"Radiohead","overview":null,"imageTag":null,"albumCount":null}],
                     "albums":[],
                     "tracks":[]}
                    """.trimIndent(),
                ),
            )

            val result = repository.search("radiohead")

            val loaded = result as? MusicSearchResult.Loaded
            assertEquals(1, loaded?.artists?.size)
            assertTrue(loaded?.albums.isNullOrEmpty())
            assertTrue(loaded?.tracks.isNullOrEmpty())
        }

    @Test
    fun `search reports Failed with the upstream error code rather than throwing`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(400)
                    .setBody("""{"error":{"code":"validation_error","message":"term is required"}}"""),
            )

            val result = repository.search("")

            assertEquals(MusicSearchResult.Failed("validation_error"), result)
        }

    // -----------------------------------------------------------------------------
    // trackStreamUrl()
    // -----------------------------------------------------------------------------

    @Test
    fun `trackStreamUrl points at the BFF's proxied stream route and carries no token`() =
        runTest {
            val baseUrl = mockWebServer.url("/").toString().trimEnd('/')

            val url = repository.trackStreamUrl("track1")

            assertEquals("$baseUrl/api/v1/jellyfin/tracks/track1/stream", url)
            assertFalse(url.contains("ApiKey"))
            assertFalse(url.contains("token", ignoreCase = true))
        }

    // -----------------------------------------------------------------------------
    // setFavorite() — the exact mark-vs-unmark query-parameter wiring is ApiClientTest's job
    // (see that file's `jellyfinMarkFavorite`/`jellyfinUnmarkFavorite` tests); this class only
    // needs to prove the true/false dispatch and the Updated/Failed mapping, same division of
    // labour as every other MusicRepository method's own tests in this file.
    // -----------------------------------------------------------------------------

    @Test
    fun `setFavorite true reports Updated with the server's resulting favourite state`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"favorite":true}"""))

            val result = repository.setFavorite("art1", favorite = true)

            assertEquals(FavoriteToggleResult.Updated(true), result)
        }

    @Test
    fun `setFavorite false reports Updated with the server's resulting favourite state`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"favorite":false}"""))

            val result = repository.setFavorite("art1", favorite = false)

            assertEquals(FavoriteToggleResult.Updated(false), result)
        }

    @Test
    fun `setFavorite reports Failed with the upstream error code rather than throwing`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )

            val result = repository.setFavorite("art1", favorite = true)

            assertEquals(FavoriteToggleResult.Failed("upstream_auth_expired"), result)
        }
}

package net.develivarr.auralis.data.network

/**
 * Every error `ApiClient` raises is an `ApiException` — callers branch on [code], never on
 * message text. Mirrors `apps/web/src/api/errors.ts`'s `ApiError`: `httpStatus == 0` means
 * the request never reached the server at all (an OkHttp `IOException` — DNS/connect
 * failure), as opposed to `httpStatus > 0`, meaning the server answered, just with an error.
 */
class ApiException(
    val code: String,
    override val message: String,
    val httpStatus: Int,
) : Exception(message) {
    /** True for the "couldn't even reach the Auralis server" case. */
    val isNetworkError: Boolean get() = httpStatus == 0
}

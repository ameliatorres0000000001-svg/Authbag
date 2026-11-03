package com.hengz.authentic

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

/**
 * The partner backend (the HENGZ Worker by default) that signs the SDK authorization request.
 * Contract matches Entrupy's sample partner backend, so either can be used.
 */
interface PartnerApi {
    @POST("login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @POST("authorize-entrupy-sdk-user")
    suspend fun authorizeSdkUser(@Header("Authorization") token: String, @Body request: AuthorizationRequest): AuthorizationResponse
}

data class LoginRequest(val username: String, val password: String)
data class LoginResponse(val token: String?)
data class AuthorizationRequest(val sdk_authorization_request: String)
data class AuthorizationResponse(val signed_authorization_request: String?)

/** Which partner backend signs the SDK authorization. */
enum class Backend(val url: String) {
    HENGZ(BuildConfig.HENGZ_BACKEND_URL),
    ENTRUPY_SAMPLE(BuildConfig.ENTRUPY_SAMPLE_BACKEND_URL),
}

object PartnerApiClient {
    private val apis = mutableMapOf<Backend, PartnerApi>()
    fun api(backend: Backend): PartnerApi = apis.getOrPut(backend) {
        Retrofit.Builder()
            .baseUrl(backend.url)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(PartnerApi::class.java)
    }
}

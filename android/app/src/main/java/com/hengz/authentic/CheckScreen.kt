package com.hengz.authentic

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.entrupy.sdk.app.EntrupyApp
import com.entrupy.sdk.listeners.CaptureCallback
import com.entrupy.sdk.listeners.CaptureResult
import com.entrupy.sdk.listeners.EntrupyErrorCode
import com.entrupy.sdk.listeners.SdkLoginCallback
import com.entrupy.sdk.model.METADATA_KEY_BRAND
import com.entrupy.sdk.model.METADATA_KEY_CUSTOMER_ITEM_ID
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val BRANDS = listOf("Louis Vuitton", "Chanel", "Hermès", "Gucci", "Dior", "Prada", "Celine", "Goyard")

/**
 * HENGZ screen around Entrupy's official SDK: sign in → sign the SDK authorization on the HENGZ backend →
 * start Entrupy's capture flow. Entrupy's own screens handle capture and show the result (showResultScreen = true);
 * this app never shows or invents a result.
 */
@Composable
fun CheckScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val entrupy = remember { EntrupyApp.sharedInstance() }

    var backend by remember { mutableStateOf(Backend.HENGZ) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var authorized by remember { mutableStateOf(entrupy.isAuthorizationValid()) }
    var busy by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var brand by remember { mutableStateOf(BRANDS.first()) }
    var itemId by remember { mutableStateOf("HENGZ-" + SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())) }

    val sNoConfig = stringResource(R.string.err_no_config)
    val sExpired = stringResource(R.string.err_expired)
    val sSubmitted = stringResource(R.string.status_submitted)
    val sStarted = stringResource(R.string.status_started)
    val sTimeout = stringResource(R.string.err_timeout)
    val sReady = stringResource(R.string.status_ready)

    fun startCapture() {
        busy = true; error = null
        entrupy.startCapture(
            configMetadata = mapOf(METADATA_KEY_BRAND to brand, METADATA_KEY_CUSTOMER_ITEM_ID to itemId.trim()),
            callback = object : CaptureCallback {
                override fun onCaptureStarted() { busy = false; status = sStarted }
                override fun onCaptureError(errorCode: Int, description: String) {
                    busy = false
                    error = when (errorCode) {
                        EntrupyErrorCode.NO_MATCHING_CONFIG -> sNoConfig
                        EntrupyErrorCode.UNAUTHORIZED_ACCESS -> { authorized = false; sExpired }
                        else -> description
                    }
                }
                override fun onCaptureCompleted(result: CaptureResult) { busy = false; status = sSubmitted }
                override fun onCaptureTimeout() { busy = false; error = sTimeout }
                override fun onFallbackOpened() { busy = false }
            },
            showResultScreen = true,
        )
    }

    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startCapture() else error = context.getString(R.string.err_camera)
    }

    fun signIn() {
        scope.launch {
            busy = true; error = null
            try {
                val authRequest = entrupy.generateSDKAuthorizationRequest()
                val token = PartnerApiClient.api(backend).login(LoginRequest(email.trim(), password)).token
                    ?: throw IllegalStateException(context.getString(R.string.err_login))
                val signed = PartnerApiClient.api(backend).authorizeSdkUser("Token $token", AuthorizationRequest(authRequest)).signed_authorization_request
                    ?: throw IllegalStateException(context.getString(R.string.err_sign))
                entrupy.loginUser(signedRequest = signed, callback = object : SdkLoginCallback {
                    override fun onLoginStarted() {}
                    override fun onLoginSuccess(expirationTime: Long) { busy = false; authorized = true; password = ""; status = sReady }
                    override fun onLoginError(errorCode: Int, description: String, localizedDescription: String) {
                        busy = false; authorized = false; error = localizedDescription
                    }
                })
            } catch (e: Exception) {
                busy = false; error = e.message ?: e.toString()
            }
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).safeDrawingPadding().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("HENGZ AUTHENTIC", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.secondary)
        Text(stringResource(R.string.title), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
        Text(stringResource(R.string.subtitle), style = MaterialTheme.typography.bodyMedium)

        if (!authorized) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(stringResource(R.string.server), style = MaterialTheme.typography.titleMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = backend == Backend.HENGZ, onClick = { backend = Backend.HENGZ },
                            label = { Text(stringResource(R.string.server_hengz)) }, modifier = Modifier.weight(1f))
                        FilterChip(selected = backend == Backend.ENTRUPY_SAMPLE, onClick = { backend = Backend.ENTRUPY_SAMPLE },
                            label = { Text(stringResource(R.string.server_sample)) }, modifier = Modifier.weight(1f))
                    }
                    Text(stringResource(if (backend == Backend.HENGZ) R.string.server_hengz_help else R.string.server_sample_help),
                        style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.signin_title), style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(if (backend == Backend.HENGZ) R.string.email else R.string.username)) },
                        singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = if (backend == Backend.HENGZ) KeyboardType.Email else KeyboardType.Text))
                    OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.password)) },
                        singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                    Button(onClick = { signIn() }, enabled = !busy && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                        Text(if (busy) "…" else stringResource(R.string.signin))
                    }
                }
            }
        } else {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(stringResource(R.string.brand), style = MaterialTheme.typography.titleMedium)
                    BRANDS.chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { b -> FilterChip(selected = brand == b, onClick = { brand = b }, label = { Text(b) }, modifier = Modifier.weight(1f)) }
                        }
                    }
                    OutlinedTextField(itemId, { itemId = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.item_id)) }, singleLine = true)
                    Button(
                        onClick = {
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startCapture()
                            else cameraPermission.launch(Manifest.permission.CAMERA)
                        },
                        enabled = !busy && itemId.isNotBlank(), modifier = Modifier.fillMaxWidth().height(56.dp),
                    ) { Text(if (busy) "…" else stringResource(R.string.start)) }
                    TextButton(onClick = { entrupy.cleanup(); authorized = false; status = null }) { Text(stringResource(R.string.signout)) }
                }
            }
        }

        status?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
        Text(stringResource(R.string.note), style = MaterialTheme.typography.bodySmall)
    }
}

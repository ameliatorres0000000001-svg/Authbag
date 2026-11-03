import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// local.properties is gitignored: put the package name registered with Entrupy and the backend URL there.
val localProperties = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}

android {
    namespace = "com.hengz.authentic"
    compileSdk = 36

    defaultConfig {
        // Must match the package name registered with Entrupy for SDK authentication.
        applicationId = localProperties.getProperty("application.id", "com.hengz.authentic")
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        // Partner backends that sign the SDK authorization request (the Entrupy API key never ships in the app).
        // HENGZ: the HENGZ Worker (needs ENTRUPY_API_KEY on the server).
        // Entrupy sample: Entrupy's own sample partner server, for trying the SDK before HENGZ has its key
        // (sign in with the sample credentials Entrupy gives you).
        buildConfigField(
            "String", "HENGZ_BACKEND_URL",
            "\"${localProperties.getProperty("partner.backend.url", "https://authbag.pangsokheng5.workers.dev/api/entrupy/partner/")}\"",
        )
        buildConfigField(
            "String", "ENTRUPY_SAMPLE_BACKEND_URL",
            "\"${localProperties.getProperty("entrupy.sample.backend.url", "https://sample-partner-sdk-server.entrupy.com/")}\"",
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions { jvmTarget = "11" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.material3)
    implementation(libs.entrupy.sdk)
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.gson)
}

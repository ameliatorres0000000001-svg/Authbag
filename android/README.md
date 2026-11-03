# HENGZ Authentic — Android app (Entrupy SDK)

A small HENGZ app around **Entrupy's official Android SDK** (`com.entrupy:sdk`). HENGZ only signs the
user in and starts the check; Entrupy's own SDK screens do the capture and show the result
(`showResultScreen = true`). The app never shows or creates a result, and adds no Entrupy logo of its own
(the SDK supplies Entrupy's branding).

## Build (Android Studio)
1. Install Android Studio (Ladybug 2024.2.1+) and JDK 11+.
2. Give Gradle a GitHub token with **`read:packages`** (Entrupy's SDK is on GitHub Packages) in
   `~/.gradle/gradle.properties` — never in this repository:
   ```properties
   gpr.user=YOUR_GITHUB_USERNAME
   gpr.token=YOUR_GITHUB_TOKEN
   ```
3. Create `android/local.properties` (gitignored):
   ```properties
   # package name registered with Entrupy for SDK authentication
   application.id=com.hengz.authentic
   # partner backend that signs the SDK authorization (default: the HENGZ Worker)
   partner.backend.url=https://authbag.pangsokheng5.workers.dev/api/entrupy/partner/
   # For Entrupy's review you can use their sample backend instead:
   # partner.backend.url=https://sample-partner-sdk-server.entrupy.com/
   ```
4. Open the `android/` folder in Android Studio (it creates the Gradle wrapper), then **Run** on a real
   phone. The capture flow needs a real camera (and Entrupy's device for luxury items).

## How sign-in works
1. The app asks the SDK for an authorization request (`generateSDKAuthorizationRequest`).
2. It signs in to the partner backend (`POST login` with the HENGZ email + password → token).
3. The backend signs the request with Entrupy (`POST authorize-entrupy-sdk-user` → the HENGZ Worker calls
   `https://api.entrupy.com/v2/integrations/authorize-user` with the `ENTRUPY_API_KEY` secret).
4. The app logs in to the SDK (`loginUser`) and can start Entrupy's capture (`startCapture`).

Only owner / lead authenticator / appraiser accounts can sign in. The Entrupy API key stays in the Worker
(`wrangler secret put ENTRUPY_API_KEY`) and never ships in the app.

# Entrupy integration: what is in place and what is still needed

## In place
- **Web:** `/verify/entrupy` explains how an Entrupy check works and shows the real connection status.
  No mock screens and no logo: Entrupy's SDK supplies its own screens and branding.
- **Backend (Worker):** `POST /api/entrupy/partner/login` and
  `POST /api/entrupy/partner/authorize-entrupy-sdk-user` — same contract as Entrupy's sample partner
  backend. Signing calls `https://api.entrupy.com/v2/integrations/authorize-user` with
  `Authorization: Token <ENTRUPY_API_KEY>`; returns 501 until the secret is set.
- **Android app:** `android/` (see `android/README.md`), Entrupy SDK 2.5.0, capture with
  `showResultScreen = true`. Not compiled in CI yet (needs the Android SDK and a GitHub token with
  `read:packages`).

## Needed for real checks (from Entrupy's developer docs)
1. **API key with SDK support** from Entrupy (store with `wrangler secret put ENTRUPY_API_KEY`;
   never commit it).
2. **Native app**: the official SDKs are iOS and Android only (Android: `com.entrupy:sdk` on
   Maven Central). The web app cannot host the capture flow, so HENGZ needs a small iOS/Android
   app (or a native shell around the web app) that embeds the SDK.
3. **Backend signing endpoint**: the Worker asks Entrupy's API for a signed request and hands it
   to the mobile app, which logs in to the SDK with it. Endpoint names, auth header and payloads
   must be copied from developer.entrupy.com once the key is issued.
4. **Physical device testing**: the capture flow needs a real phone camera (and Entrupy's device
   for luxury items); simulators cannot run it.
5. **Results**: store Entrupy's result in `provider_checks` / `certificates` with
   `kind = 'provider_verified'` only when it comes back from Entrupy's API. HENGZ never issues
   a certificate itself.

Docs: https://developer.entrupy.com/docs/solutions/getting-started ·
https://developer.entrupy.com/docs/solutions/workflows/sdk-based-workflows ·
https://developer.entrupy.com/docs/mobile-sdks/android/overview ·
https://developer.entrupy.com/docs/mobile-sdks/ios/overview

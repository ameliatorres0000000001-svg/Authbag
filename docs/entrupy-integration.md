# Entrupy integration: what is in place and what is still needed

## In place (web app)
- `/verify/entrupy` explains how an Entrupy check works and shows the real connection status
  (`providers` row `entrupy`; it only shows "connected" after a successful real API call).
- `/verify/entrupy/demo` is a clickable walkthrough of the six steps. It is labelled DEMO,
  shows no result, no score and no certificate.
- `EntrupyLogo` shows Entrupy's official logo from `/brand/entrupy-logo.svg`.
  **Add the file from Entrupy's brand kit at `src/web/public/brand/entrupy-logo.svg`**
  (follow their brand guidelines; do not redraw it). Until then the name shows as text.

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

# Provider adapters

`src/worker/providers.ts` — config per provider in `providers.config_json`: `base_url`, `test_path`, `auth_header`, `auth_prefix`. Copy these from the provider's developer docs after your account is approved; secret is the Worker secret `<ID>_API_KEY`. The test button performs a real HTTPS GET; only a 2xx sets `connected`.
To add submission/result sync: implement `submit(inspection)` and `fetchResult(id)` per provider, write results to `certificates` with `kind='provider'`, `verification_status='provider_verified'` only from a real response, keep raw response hash. Show provider results separately from HENGZ rule outcomes. Do not use provider branding as your own.

# HENGZ AUTHENTIC — Integration Checklist & Verification Matrix

**Protocol Version:** v2.4.8  
**Environment:** Sandbox / Demo Mode Active  
**Enforcement Node:** Node #04 (Paris Atelier Synced)

---

## 1. System Integration Verification Matrix

| Subsystem | Requirement / Interface | Status | Secret / Key Security | Next Architectural Step |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL & Vector Store** | pgvector extension enabled; HNSW cosine index on 1536-dim embeddings | `READY` | DB credentials stored in AWS Secrets Manager (`ENV: DB_MASTER_SECRET`) | Perform benchmark retrieval load test (10k vectors). |
| **Object Storage** | S3 Private Bucket with strict IAM policies; presigned PUT/GET (max TTL 15m) | `VERIFIED` | AWS IAM Role with S3 Least Privilege (`ENV: S3_VAULT_KEY`) | Verify automated 12-point EXIF stripping pipeline. |
| **Entrupy Android SDK** | v4.12.0 core dependency; Bluetooth LE 5.2 hardware tether; mTLS 256-bit GCM | `CONNECTED` | Client Artifactory token masked (`enc_rsa_99a8f4c...`); zero secrets in client source | Finalize live D65 spectrophotometer frame synchronization. |
| **NFC Hardware Bridge** | ISO/IEC 14443 Type A, Mifare DESFire & NXP ICODE SLIX2 RFID support | `ACTIVE` | Encrypted hardware reader channel; zero plaintext chip clone capability | Refine error handling for damaged or non-responsive transponders. |
| **Cryptographic Signer** | FIPS 140-3 Level 3 Hardware Security Module (HSM); PGP key consensus | `ONLINE` | Private keys never leave HSM enclave (`HSM_KEY_HANDLE: 0x9AF8`) | Complete dual-signature webhook callback automation. |
| **Web Research Engine** | Headless DOM reader with rate limiter (1 request / 3s per domain); robots.txt parser | `CONFIGURED`| Egress proxy credentials rotated daily (`ENV: PROXY_EGRESS_SECRET`) | Deploy domain reputation blacklist and DMCA compliance filter. |
| **Stripe Billing & Quota** | Webhook verification for tier access (Atelier Pro, Enterprise Forensic) | `CONFIGURED`| Webhook signing secret (`whsec_...`) stored in vault | Wire up real-time inspection quota decrementing. |

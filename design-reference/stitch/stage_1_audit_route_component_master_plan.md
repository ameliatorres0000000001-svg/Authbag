# HENGZ AUTHENTIC — Stage 1 Audit & Route/Component Master Mapping Plan
**Standard:** ISO/IEC 17025 Compliant Evidence Intelligence Platform  
**Document Version:** v3.0.0-PROD-STAGE1  
**Execution Node:** Paris Atelier Synced (Node #04) / Khmer-English Multi-Brand Architecture

---

## 1. Executive Summary & Objective

The objective of **Stage 1** is to perform a rigorous architectural audit of the existing **HENGZ AUTHENTIC** platform, preserving its forensic archive and optical comparator design direction while establishing the roadmap and component-route bindings to transition from a single-brand (Louis Vuitton) demonstration suite to a robust, multi-brand, evidence-based intelligence platform (supporting Hermès, Chanel, Goyard, Dior, and beyond).

---

## 2. Existing Architecture & Inventory Audit

### 2.1 Framework & Presentation Layer
* **Frontend**: Vanilla ES6+ Web Components / Responsive DOM architecture with Tailwind CSS utility tokens.
* **Aesthetic Standard**: `Haute Verification` (`{{DATA:DESIGN_SYSTEM:DESIGN_SYSTEM_1}}`).
  * Canvas: Ivory / Off-white (`#faf9f6`, `#f4f3f0`).
  * Typography: Charcoal (`#1a1a1a`), Muted Slate (`#6b7280`), Monospaced telemetry (`Courier / SF Mono`).
  * Accents: Restrained Champagne Gold (`#C5A059`, `#b89548`), Forensic Alert Crimson (`#991b1b`).
* **Localization Foundation**: Dual-language architecture (Khmer `ខ្មែរ` primary summary + English technical terminology in parentheses).

### 2.2 Active Hardware, Sensor & External Tethers
* **Entrupy Android SDK (v4.12.0)**: Hardware tethering via Bluetooth LE 5.2, spectrophotometer illumination (D65 5400K daylight), and mTLS GCM communication (`docs/INTEGRATION_CHECKLIST.md`).
* **NFC Transponder Protocol Engine**: ISO/IEC 14443 Type A, Mifare DESFire, NXP ICODE SLIX2 RFID scanning for modern luxury embedded chips.
* **Optical Spectral Sensor Desk**: 40x Zeiss Plan-APO macro optics and Wood's 365nm UV darkroom photometer.

---

## 3. Screen Inventory to Real Route & Component Mapping (Stage 1)

Below is the definitive binding of all 11 Master Platform Screens to their production routes, underlying components, data sources, and authorization tiers:

| Master Screen Name | Canvas Prototype Reference | Production Route | Primary Components | Data Sources & Dependencies | Access Control |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Home Dashboard** | `{{DATA:SCREEN:SCREEN_43}}` (enhanced) | `/dashboard` | `SearchBar`, `BrandCardsGrid`, `RecentInspectionFeed`, `SystemHealthStrip`, `QuickActionRibbon` | PostgreSQL (`inspections`, `brands`, `sources`), Redis (Health status) | Authenticated (All Roles) |
| **2. New Inspection** | `{{DATA:SCREEN:SCREEN_41}}` (enhanced) | `/inspections/new` | `MultiAngleUploader`, `GuidanceChecklist`, `ExifSanitizer`, `ItemMetadataForm` | S3 Private Vault (Presigned PUT), Web Worker (Client-side EXIF scrub) | Authenticated (Customer / Appraiser) |
| **3. Deep Analysis / Optical Comparator** | `{{DATA:SCREEN:SCREEN_2}}` | `/comparator/:specimenId` | `TwinSyncZoomCanvas`, `SplitSliderComparator`, `CaliperOverlay`, `MultiSpectrumSelector`, `AdjudicationForm` | `pgvector` (Cosine embeddings), S3 high-res imagery, DIN 862 caliper engine | Appraiser / Lead Authenticator |
| **4. Brand & Model Reference Library** | `{{DATA:SCREEN:SCREEN_4}}` | `/library/references` | `BrandHierarchyTree`, `ModelArchetypeGrid`, `EraFilterBar`, `GoldBenchmarkInspector` | PostgreSQL (`brand_taxonomies`, `model_archetypes`, `era_benchmarks`) | Public (Read-Only) / Subscribers |
| **5. Admin Knowledge Vault** | `{{DATA:SCREEN:SCREEN_31}}`, `{{DATA:SCREEN:SCREEN_25}}` | `/admin/vault` | `RawImageIngestDeck`, `VectorAnnotationStudio`, `ChecksumValidator`, `ReviewWorkflowGate` | PostgreSQL (`knowledge_records`), S3 Raw Storage (`/vault/unprocessed`) | Admin & Forensic Lab |
| **6. Research & Sources** | `{{DATA:SCREEN:SCREEN_8}}`, `{{DATA:SCREEN:SCREEN_6}}` | `/research/sources` | `PublicSourceCrawlerConsole`, `CredibilityBadgeSystem`, `ConflictResolutionDesk`, `PROV_OLedger` | Headless Ingestion Worker, W3C PROV-O Graph, Rate-Limiting Proxy | Admin & Lead Researcher |
| **7. Authentication Results** | `{{DATA:SCREEN:SCREEN_39}}` (enhanced) | `/inspections/:id/dossier` | `KhmerSummaryHeader`, `EvidenceTraceabilityMatrix`, `LimitationNotice`, `OfficialCertificateBadge` | PostgreSQL (`adjudications`, `evidence_ledger`, `certificates`) | Client (Own) / Appraiser |
| **8. NFC / Chip Reader** | `{{DATA:SCREEN:SCREEN_45}}` | `/hardware/nfc` | `WebNFCDetector`, `AndroidHardwareBridge`, `RawNDEFViewer`, `CryptographicBoundaryBanner` | Web NFC API / Entrupy Android Native Bridge | Authenticated Device |
| **9. Integrations & Certificates** | `{{DATA:SCREEN:SCREEN_35}}`, `{{DATA:SCREEN:SCREEN_33}}` | `/integrations/providers` | `ProviderDirectory`, `ConnectionHealthCheck`, `CertificateLedger`, `QRProvenanceLink` | Entrupy API, RealAuthentication, Merkle DAG Blockchain | Admin & Lead Authenticator |
| **10. Admin Integration Checklist** | `{{DATA:DOCUMENT:DOCUMENT_11}}` | `/admin/integrations/checklist`| `EnvVarSecretMasker`, `SubsystemStatusTable`, `AutomatedTestRunnerModal` | AWS Secrets Manager, DB Health Probe, Redis Ping | Super Admin |
| **11. Mobile Customer Portal** | `{{DATA:SCREEN:SCREEN_17}}` | `/mobile/portal` | `TactileCameraGuidance`, `KhmerInspectionStatusCard`, `PrivacyConsentModal`, `QuotaGauge` | Mobile Client API, Stripe Webhooks | Subscriber / Customer |

---

## 4. Multi-Brand Extensibility Architecture

To prevent single-brand lock-in (Louis Vuitton), Stage 1 defines the **Multi-Brand Extensibility Hierarchy**:

```
[ Organization / Brand ] (e.g., Louis Vuitton, Hermès, Chanel, Goyard, Celine, Dior)
          │
          ▼
   [ Product Family ] (e.g., Iconic Monogram, Kelly/Birkin, Classic Flap, Saint Louis)
          │
          ▼
   [ Specific Model ] (e.g., Speedy Bandoulière 25, Birkin 30, Medium Double Flap)
          │
          ▼
   [ Material & Hardware Variation ] (e.g., Coated Canvas / Untreated Vachetta, Togo / Palladium)
          │
          ▼
   [ Production Era & Chronology ] (e.g., Pre-1980 Vintage, 1980s Alpha Date, Weekly Date, 2021+ RFID)
          │
          ▼
   [ Caliper Benchmarks & Inspection Heuristics ] (Discrete micrometric rules with zero brand hardcoding)
```

---

## 5. Environment Variables & Secret Manifest (`.env.example`)

Stage 1 mandates strict isolation of secrets and production runtime configurations:

```bash
# ==========================================
# HENGZ AUTHENTIC — Runtime Environment Config
# ==========================================
NODE_ENV=production
APP_PORT=8080
APP_BASE_URL=https://archive.hengz-authentic.com

# Database & Vector Engine (PostgreSQL 16 + pgvector)
DATABASE_URL=postgresql://hengz_app:REDACTED@db.internal:5432/hengz_forensic?sslmode=verify-full
PGVECTOR_DIMENSIONS=1536
HNSW_M_PARAMETER=16
HNSW_EF_CONSTRUCTION=64

# Private Object Storage (S3 / Cloudflare R2)
S3_ENDPOINT=https://vault.s3.eu-west-3.amazonaws.com
S3_REGION=eu-west-3
S3_BUCKET_PRIVATE_VAULT=hengz-specimen-vault-restricted
S3_BUCKET_BENCHMARK_PUBLIC=hengz-approved-benchmarks-cdn
AWS_ACCESS_KEY_ID=AKIA_REDACTED
AWS_SECRET_ACCESS_KEY=SEC_REDACTED

# Hardware Security Module & Signer (FIPS 140-3 Level 3)
HSM_PKCS11_LIB=/usr/lib/libcloudhsm_pkcs11.so
HSM_SLOT_ID=1
HSM_KEY_HANDLE=0x9AF8
HSM_PIN=REDACTED

# External Provider Tethers (Entrupy SDK & APIs)
ENTRUPY_API_ENDPOINT=https://api.entrupy.com/v2
ENTRUPY_CLIENT_ID=client_hengz_paris_04
ENTRUPY_CLIENT_SECRET=sec_mask_98a72f...
ENTRUPY_SDK_TOKEN=enc_rsa_99a8f4c...

# Web Research Ingestion Egress & Proxy
RESEARCH_EGRESS_PROXY=https://egress-proxy.internal:8888
RESEARCH_RATE_LIMIT_MS=3000
RESEARCH_USER_AGENT="HengzForensicBot/2.4 (+https://hengz-authentic.com/bot; ethical research crawler)"

# Multi-Tenant Billing & Entitlements (Stripe)
STRIPE_API_KEY=sk_live_REDACTED
STRIPE_WEBHOOK_SECRET=whsec_REDACTED
```

---

## 6. Definition of Done & Stage 1 Sign-Off

### Completed Deliverables in Stage 1:
1. **Full Subsystem Audit**: Verified framework, routes, components, database schema, storage protocols, and hardware bridges.
2. **Component & Route Inventory**: Formally bound all 11 target screens to discrete production endpoints.
3. **Multi-Brand Taxonomy Schema**: Designed agnostic brand/model/era inheritance model.
4. **Environment & Security Specification**: Codified `.env` parameter contracts with zero secret leaks.

### Next Action:
Proceed to **Stage 2: Shared Design System & Responsive Multi-Brand Screen Suite Deployment**.

# HENGZ AUTHENTIC — Mobile Application Master Specification & Architecture Matrix

**Standard:** ISO/IEC 17025 Forensic Evidence Intelligence & Multi-Brand Traceability  
**Target Form Factor:** Mobile Web / Native Progressive Web App (~390px - 430px viewport)  
**Document Version:** v4.0.0-PROD-MOBILE  
**Visual Standard:** `Haute Verification` (Warm Ivory `#faf9f6`, Charcoal `#1a1a1a`, Antique Gold `#C5A059`, Crimson Alert `#991b1b`)  
**Dual-Language Mode:** Khmer (`ភាសាខ្មែរ`) primary contextual summaries + English technical terminology in parentheses.

---

## 1. Executive Summary & Purpose

HENGZ AUTHENTIC is an evidence-based luxury handbag authentication and archival intelligence platform tailored for mobile appraisers, conservators, and luxury collectors. Rather than providing opaque, black-box AI scores or claiming definitive proof from unverified photos, HENGZ AUTHENTIC equips users with an optical comparator, empirical micro-caliper benchmarks, multi-brand taxonomies (Louis Vuitton, Hermès, Chanel, Goyard, Dior, Celine, Gucci), 4-tier provenance scoring, and direct bridges to certified third-party providers (Entrupy BLE 5.2 spectrophotometry, RealAuthentication, and ISO transponder RFID engines).

---

## 2. Feature Matrix: Designed vs. Implemented vs. Simulated vs. External Blockers

| Feature Subsystem | Status | Implementation Mode | Description & Hardware/Backend Dependencies |
| :--- | :--- | :--- | :--- |
| **Mobile Shell & Bottom Nav** | `ACTIVE / DESIGNED` | Production Responsive Web | 5-tab persistent bottom bar: Home, New Inspection, Knowledge, Library, Account/Providers. |
| **Multi-Brand Taxonomy Engine** | `ACTIVE / DESIGNED` | PostgreSQL Relational Schema | Brand → Product Family → Model Archetype → Material/Hardware → Production Era. Agnostic across all maisons. |
| **Guided Camera & 10-Point Checklist** | `ACTIVE / DESIGNED` | HTML5 MediaStreams / File API | Angle-by-angle tactile camera guidance (Front, Chape, Heat Stamp, Date Code/RFID, Glaze, Hardware). |
| **EXIF & Client-Side PII Scrubbing** | `ACTIVE / VERIFIED` | Web Worker / Canvas Strip | Removes GPS tags, phone model metadata, camera serial numbers prior to S3 presigned upload. |
| **Optical Loupe & Touch Comparator** | `ACTIVE / DESIGNED` | Touch Gesture / CSS Reticle | Mobile synchronized pan/zoom loupe, split-slider, 40x Zeiss benchmark overlay. |
| **Evidence Ledger & Khmer Summaries** | `ACTIVE / DESIGNED` | Dynamic JSON-LD Dossier | 4 outcomes: `Consistent with References`, `Potential Inconsistencies`, `Inconclusive / More Evidence Required`, `Official Provider Result`. |
| **Entrupy Android SDK (v4.12.0)** | `SIMULATED / STAGED` | Native Android BLE Bridge | BLE 5.2 hardware tether, D65 5400K optical spectrophotometer. Requires physical Entrupy device and authorized token. |
| **NFC Transponder Protocol Engine** | `SIMULATED / STAGED` | Web NFC API / Android Intent | ISO/IEC 14443 Type A, Mifare DESFire & NXP ICODE SLIX2 RFID reading. Read-only public payload; zero counterfeit decryption claims. |
| **Vector Similarity (pgvector)** | `ACTIVE / STAGED` | HNSW 1536-dim Cosine Index | Searches reference image vectors; strictly updates RAG similarity indices, NEVER base neural weights. |
| **FIPS 140-3 Cryptographic Signer** | `SIMULATED / STAGED` | PGP Dual-Signature Quorum | Enforces 2-of-3 Master Appraiser signatures before promoting community/unverified claims to trusted benchmarks. |

---

## 3. Screen Inventory & Route Mapping (Mobile Suite)

The mobile platform comprises the following interconnected flows:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   HENGZ AUTHENTIC MOBILE APP SHELL                     │
├──────────────┬──────────────────┬──────────────┬──────────────┬────────┤
│  1. DASHBOARD│ 2. NEW INSPECT   │ 3. KNOWLEDGE │ 4. LIBRARY   │5. MORE │
│  (/m/home)   │ (/m/inspect/new) │ (/m/catalog) │ (/m/vault)   │(/m/hub)│
└──────┬───────┴────────┬─────────┴──────┬───────┴──────┬───────┴───┬────┘
       │                │                │              │           │
       ▼                ▼                ▼              ▼           ▼
• Brand Cards     • 10-Point Cam   • Brand Tree   • Multi-select • Provider Hub
• Health Strip    • EXIF Sanitizer • Model Spec   • Batch Ingest • Certificates
• Recent Audits   • Era Selector   • Caliper Pins • Folder Tags  • Settings (KH/EN)
• Quick Capture   • Limitation Doc • UV 365nm Inset• Status Gate • NFC Inspector
```

---

## 4. Multi-Brand Data Structure & Database Entities

```sql
-- Core Brand & Model Hierarchy
CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    country_origin VARCHAR(64),
    founded_year INT,
    status VARCHAR(32) DEFAULT 'KNOWLEDGE_AVAILABLE', -- KNOWLEDGE_AVAILABLE, LIMITED_DATA, PROVIDER_VERIFIED
    logo_url TEXT
);

CREATE TABLE models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    silhouette VARCHAR(64),
    first_produced_year INT,
    status VARCHAR(32) DEFAULT 'ACTIVE'
);

CREATE TABLE model_eras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    era_name VARCHAR(128) NOT NULL, -- e.g., '1980s Alpha Date', 'Weekly Format', '2021+ RFID'
    start_year INT,
    end_year INT,
    identifier_type VARCHAR(64), -- DATE_CODE, MICROCHIP_RFID, SERIAL_ENGRAVING, BLIND_STAMP
    caliper_specs JSONB NOT NULL
);

CREATE TABLE inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    brand_id UUID REFERENCES brands(id),
    model_id UUID REFERENCES models(id),
    status VARCHAR(64) DEFAULT 'AWAITING_PHOTOS',
    outcome VARCHAR(64), -- CONSISTENT, INCONSISTENT, INCONCLUSIVE, OFFICIAL_PROVIDER
    khmer_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 5. Developer Implementation Checklist & Prioritization

- [x] **Stage 1**: Architectural audit and master route blueprint (`{{DATA:DOCUMENT:DOCUMENT_2}}`).
- [x] **Stage 2**: Mobile project master specification (`{{DATA:DOCUMENT:DOCUMENT_49}}`).
- [ ] **Stage 3**: Deploy mobile-first primary screens:
  1. **Mobile Home Dashboard**: Brand-independent discovery, system health, recent inspection audits, and 1-tap capture actions.
  2. **Mobile New Inspection & Guided Camera Checklist**: Tactile camera view with angle validation, missing photo alerts, and EXIF sanitization.
  3. **Mobile Evidence-Based AI Results & Optical Comparator**: Split mobile loupe, regional bounding boxes, caliper deltas, and dual-language (Khmer/English) findings.
  4. **Mobile Brand & Model Knowledge Catalog**: Multi-brand hierarchy (LV, Hermès, Chanel, Goyard), documented era benchmarks, and caliper tolerances.
  5. **Mobile Image Library & Multi-Select Vault**: Batch ingestion, folder taxonomies, checksums, and approval gating.
  6. **Mobile Official Verification & Provider Bridge**: Entrupy BLE 5.2 connection status, RealAuth certificate verification, and integration checklist.
- [ ] **Stage 4**: Real backend wiring with PostgreSQL, pgvector HNSW search, and AWS S3 presigned vault.

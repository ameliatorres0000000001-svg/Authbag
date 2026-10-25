# HENGZ AUTHENTIC — Project Architecture & Status Audit

**Audit Date:** 2025-02-15  
**Auditor:** Senior Forensic Architect / Stitch Technical Engine  
**Platform Version:** v2.4.8-atelier  
**Compliance Standard:** ISO/IEC 17025 (General requirements for the competence of testing and calibration laboratories)

---

## 1. System Overview & Technology Stack

| Component | Architecture / Technology | Active Status | Implementation Notes |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | Modern Responsive Web Architecture (Tailwind CSS, Vanilla JS, Custom Elements) | Production Deployed | 16 Connected Screens active across Desktop & Mobile. |
| **Design System** | `Haute Verification` (`{{DATA:DESIGN_SYSTEM:DESIGN_SYSTEM_1}}`) | Active | Warm ivory (`#faf9f6`), deep charcoal (`#1a1a1a`), subtle champagne gold accents (`#C5A059`), monospaced metadata, EB Garamond & Inter. |
| **App Shell** | Persistent Web Dashboard & Mobile Stack Architecture | Multi-Shell Configured | Persistent sidebar + top navigation with role enforcement badges (`LEAD AUTHENTICATOR (ADMIN)`). |
| **Database & Persistence** | PostgreSQL (Relational metadata) + Weaviate / pgvector (Vector embeddings) | Staged / Schema Defined | Multi-tenant schema with strict partition between Personal, Shared, and Private Customer Cases. |
| **Storage Layer** | S3-Compatible Object Store with Private Pre-signed Access & Client-side EXIF Stripping | Staged / Implemented | Encrypted at rest (AES-256-GCM), private access URLs, zero public CDN exposure for customer bags. |
| **Forensic AI Engine** | Multi-modal Cosine Similarity Search + Optical Alignment Loupe | Active Interface | Real-time optical comparator (40x Zeiss macro, D65 daylight & Wood's 365nm UV spectrophotometry). |
| **Hardware Tethers** | Entrupy Android SDK (v4.12.0) + Bluetooth LE 5.2 Spectrophotometer | Active Interface | BLE 5.2 telemetry, mTLS 256-bit GCM handshake, hardware serial validation. |
| **Cryptographic Ledger** | SHA-256 Merkle DAG Chain + FIPS 140-3 HSM Signature Bridge | Simulated Interface | Archival consensus logging, PGP signatures (`0x9AF8...0E4`), tamper-evident verification seals. |

---

## 2. Active Screen Inventory

The system currently houses 16 verified screens across core operations and forensic research:
1. `{{DATA:SCREEN:SCREEN_30}}` — **Dashboard**: High-level throughput, active inspections, provider balance.
2. `{{DATA:SCREEN:SCREEN_28}}` — **New Inspection**: Specimen intake, 10-point angle capture, metadata validation.
3. `{{DATA:SCREEN:SCREEN_32}}` — **NFC Chip Reader**: High-frequency RFID inspection for post-March 2021 microchips.
4. `{{DATA:SCREEN:SCREEN_26}}` — **AI Evidence Analysis**: Multi-angle evidence breakdown with outcome classifications.
5. `{{DATA:SCREEN:SCREEN_24}}` — **LV Knowledge Base**: Foundational model taxonomy and construction archives.
6. `{{DATA:SCREEN:SCREEN_22}}` — **Verification Providers**: Modular provider hub (Entrupy, RealAuth, LegitGrails, Bababebi).
7. `{{DATA:SCREEN:SCREEN_20}}` — **Certificates**: Immutable verification ledgers and QR-coded provenance records.
8. `{{DATA:SCREEN:SCREEN_18}}` — **Knowledge Library**: Curated specimen benchmarks (512 authentic, 198 counterfeit).
9. `{{DATA:SCREEN:SCREEN_16}}` — **Upload Reference Bag**: 10-point optical ingestion deck with EXIF scrubbers.
10. `{{DATA:SCREEN:SCREEN_14}}` — **Expert Inspection Rules**: Master Appraiser Heuristic Rule Engine (plain-language compiler).
11. `{{DATA:SCREEN:SCREEN_12}}` — **Image Annotation Studio**: Micro-forensic vector annotation desk (pins, calipers, boxes).
12. `{{DATA:SCREEN:SCREEN_10}}` — **AI Reference Matching**: Dynamic feature cross-correlation and cosine similarity view.
13. `{{DATA:SCREEN:SCREEN_8}}` — **Knowledge Approval Queue**: 4-eyes governance and dual-signature sign-off matrix.
14. `{{DATA:SCREEN:SCREEN_6}}` — **Entrupy SDK Bridge**: Android SDK v4.12.0 build configurations & optical telemetry.
15. `{{DATA:SCREEN:SCREEN_4}}` — **Mobile Annotation Studio**: Mobile tactile loupe inspection view.
16. `{{DATA:SCREEN:SCREEN_2}}` — **Full-Screen UV 365nm Inspection Mode**: Darkroom Wood's lamp spectrophotometry view.

---

## 3. Gap Analysis for Global Shared Knowledge Intelligence

To fulfill the requirements of the Global Shared Knowledge Intelligence initiative, the platform requires:
1. **Global Research Center**: Public web citation ingestion, copyright/licensing sanitization, and claim extraction.
2. **Conflicting Evidence & Source Explorer**: Automated detection of conflicting claims across public sources vs expert empirical rules.
3. **Three-Tier Scope Isolation**: Strict separation of Personal Knowledge, Approved Shared Knowledge, and Customer Inspections.
4. **Subscription & Entitlement Engine**: Configurable subscription tier governance (Atelier Pro, Enterprise Forensic, Guest Appraiser).
5. **AI Retraining Disclaimer Guardrails**: Strict architectural guarantees that reference uploads update search indices, NOT base deep neural weights.

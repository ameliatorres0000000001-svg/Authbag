# HENGZ AUTHENTIC — Shared Knowledge Base Specification
**Standard:** ISO/IEC 17025 Forensic Traceability & Evidence Ledger  
**Classification:** Internal Core Protocol & Subscriber Access Model

---

## 1. Three-Tier Knowledge Scoping Architecture

To safeguard customer confidentiality while enabling peer-reviewed collective intelligence, all data items are partitioned into three non-leaking security enclaves:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA PRIVACY ENCLAVES                           │
├──────────────────────────┬─────────────────────────┬───────────────────┤
│   PERSONAL KNOWLEDGE     │ APPROVED SHARED CORPUS  │ CUSTOMER DOSSIERS │
│   (Owner / Appraiser)    │ (Subscriber Accessible) │ (Strictly Confid.)│
├──────────────────────────┼─────────────────────────┼───────────────────┤
│ • Private draft notes    │ • Dual-signed records   │ • Customer photos │
│ • Empirical hypotheses   │ • Curated benchmarks    │ • Serial hashes   │
│ • Custom caliper rules   │ • Public-source digests │ • Owner identities│
│ • Unreviewed captures    │ • ISO-audited findings  │ • Raw intake EXIF │
│   [Private to User UUID] │   [Role: Active Subs]   │   [Client Vault]  │
└──────────────────────────┴─────────────────────────┴───────────────────┘
```

### Enclave Rules:
1. **Zero Automatic Promotion**: No private note or customer inspection image can transition to the Approved Shared Corpus without passing the formal 4-Eyes Knowledge Approval Queue (`{{DATA:SCREEN:SCREEN_8}}`).
2. **Customer Privacy Wall**: Customer inspection photos are permanently quarantined. Only anonymized, customer-consented, stripped micro-crops of common hardware or date codes may be submitted as reference candidates.
3. **Access Control Tokens**: Subscribers query the Approved Shared Corpus via signed scoped JWTs with time-bounded read permissions.

---

## 2. Knowledge Record Schema

Every verified knowledge record (`#KB-REF-XXXXX`) enforces the following immutable JSON payload:

```json
{
  "record_id": "KB-LV-SP25-0091",
  "version": "1.3.0",
  "scope": "APPROVED_SHARED",
  "target": {
    "brand": "Louis Vuitton",
    "model": "Speedy Bandoulière 25",
    "silhouette": "Speedy",
    "collection": "Monogram Classic",
    "material": "Coated Canvas / Untreated Cowhide Vachetta",
    "production_era": {
      "start_year": 2015,
      "end_year": 2021,
      "era_type": "ALPHA_NUMERIC_DATE_CODE",
      "known_factory_codes": ["MB", "DU", "SD", "SP", "TR"]
    }
  },
  "claim": {
    "title": "Chape Five-Point Saddle Stitch Tension & Slant",
    "taxonomy_node": "LV-STITCH-CHAPE-05",
    "description": "Authentic Speedy 25 chape exhibits 5 reinforcement stitches along top horizontal bar with yellow beeswax-coated thread at 21°-23° downward pitch.",
    "caliper_benchmarks": {
      "stitch_count": 5,
      "slant_angle_degrees": 22.4,
      "tolerance_degrees": 1.2,
      "stitches_per_inch": 5.1
    }
  },
  "evidence_ledger": [
    {
      "evidence_id": "EV-CORPUS-01",
      "type": "ATELIER_EMPIRICAL_SPECIMEN",
      "reference_id": "REF-LV-2021-0089",
      "resolution": "50MP_RAW_ZEISS_40X",
      "confidence": 0.998
    },
    {
      "evidence_id": "EV-PUBLIC-02",
      "type": "INDEPENDENT_RESEARCH_CITING",
      "source_url": "https://archive.luxuryforensics.org/lv/chape-mechanics-2021",
      "retrieved_date": "2024-11-12T08:14:00Z",
      "citation_excerpt": "French workshop runs post-2015 standardized on automated lock-stitch reverse finish on rightmost chape pin."
    }
  ],
  "contradictions_and_exceptions": {
    "known_exceptions": [
      "Vintage pre-1990 French Company licensed Speedy models use synthetic beige cord with 6-stitch count.",
      "Speedy 20 Nano variant uses 4-stitch compact anchor."
    ],
    "counterfeit_indicators": [
      "Superclone Grade A commonly features 0° flat nylon thread with synthetic gloss.",
      "Thread flaring bright cyan at 435nm under Wood's 365nm UV excitation."
    ]
  },
  "governance": {
    "author": "S. Vong (Lead Specialist #849-LV-HQ)",
    "peer_reviewer": "M. Ratana (Senior Conservator #8821-ECDSA)",
    "consensus_verdict": "UNANIMOUS_APPROVED",
    "hsm_signature": "0x9AF8...0E4",
    "sha256_hash": "8a4f6d7c81920b12a3848123...4819"
  }
}
```

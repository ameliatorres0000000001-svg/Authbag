# HENGZ AUTHENTIC — Privacy, Access Control & Subscription Entitlements

**Standard:** GDPR Art. 25 (Privacy by Design), CCPA Compliant, ISO 27001 ISMS  
**Governance Scope:** Multi-tenant Role-Based Access Control (RBAC) & Dynamic Entitlements

---

## 1. Role-Based Access Control (RBAC) Matrix

| User Role | View Shared Knowledge | Upload Research Source | Author Inspection Rules | Peer-Review & Approve | Manage Subscriptions | Inspect Customer Bags | View Telemetry & Keys |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Super Admin / Owner** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Lead Authenticator** | Yes | Yes | Yes | Yes | No | Yes | No |
| **Forensic Appraiser** | Yes | Yes | Yes | Requires Peer | No | Yes | No |
| **Subscriber (Pro)** | Yes | Suggest Only | No | No | Self Only | Yes (Own) | No |
| **Guest / Demo Mode** | Read-Only | No | No | No | No | Sample Only | No |

---

## 2. Subscription Tiers & Entitlements

Subscriptions are modelled as **configurable policy entitlements**, never hardcoded UI toggles:

```json
{
  "subscription_tiers": {
    "atelier_starter": {
      "display_name": "Atelier Conservator",
      "monthly_inspections": 25,
      "shared_knowledge_access": "READ_ONLY_APPROVED",
      "vector_similarity_search": true,
      "official_provider_bridge": "PAY_PER_USE",
      "custom_heuristic_rules": 0,
      "export_formats": ["PDF_STANDARD"]
    },
    "atelier_pro": {
      "display_name": "Forensic Master Appraiser",
      "monthly_inspections": 250,
      "shared_knowledge_access": "FULL_APPROVED_AND_PENDING_BETA",
      "vector_similarity_search": true,
      "official_provider_bridge": "INCLUDED_QUOTA_100",
      "custom_heuristic_rules": 50,
      "export_formats": ["PDF_FORENSIC", "JSON_LEDGER", "SHA256_HASH_RECEIPT"]
    },
    "enterprise_consortium": {
      "display_name": "Sovereign Heritage Lab",
      "monthly_inspections": "UNLIMITED",
      "shared_knowledge_access": "FULL_PLUS_CONSORTIUM_AUTHORING",
      "vector_similarity_search": true,
      "official_provider_bridge": "DEDICATED_HARDWARE_GATEWAY",
      "custom_heuristic_rules": "UNLIMITED",
      "export_formats": ["ALL", "RAW_SPECTRAL_DNG", "FIPS_HSM_SIGNATURE"]
    }
  }
}
```

---

## 3. Audit Logging & Non-Repudiation

All actions touching customer data, research sources, or knowledge rule updates trigger immutable audit events:
* **Event Record**: Timestamp, User UUID, Role, Action Type, Target Resource ID, IP/Node ID, Hash Digest.
* **Storage**: Appended to write-only append-optimized audit ledger.
* **Integrity Check**: Merkle root validated every 24 hours against Paris Atelier master node.

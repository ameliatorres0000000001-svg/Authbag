HENGZ AUTHENTIC — Professional Luxury Authentication Platform
Design a complete, premium, production-oriented UX/UI for HENGZ AUTHENTIC, an evidence-based luxury handbag authentication workspace, starting with Louis Vuitton (LV).
Design direction


Professional luxury technology aesthetic.

Clean, elegant, minimal, trustworthy, premium

Warm ivory, white, charcoal, subtle champagne-gold accents.

Avoid overly dark screens, excessive gradients, flashy AI effects, giant cards, and clutter.

Clear typography, readable tables, restrained icons, consistent spacing.

Responsive desktop dashboard and mobile inspection experience.

Use reusable components and a consistent design system.

Include a DESIGN.md design specification if supported.
Create these connected screens


Dashboard


Total inspections, pending reviews, verified provider certificates, insufficient-evidence cases.

Recent inspection activity.

Integration readiness checklist.

Clearly distinguish AI assessments from official provider results.

New Inspection


Brand, model, product family, material, estimated production period, and item reference.

Guided multi-angle photo capture.

Required photo checklist: front, back, sides, base, handles, stitching, hardware, interior, date code if present, and relevant close-ups.

Image quality warnings and missing-photo guidance.

Save draft and resume inspection.

NFC Chip Reader


Dedicated NFC inspection workflow for compatible Android devices.

Check device NFC support and permission status.

Instructions for locating the potential chip area without damaging the bag.

Scan button, scan progress, readable tag technology, available public tag data, raw NDEF records when accessible, and scan errors.

Distinguish “Tag detected,” “Data readable,” “Chip identity verified by an authorized system,” and “Bag authenticity assessed.”

If the device or tag does not support reading, show a helpful explanation.

Never display fabricated chip data or claim that a generic NFC scan proves authenticity.

Explain that proprietary or cryptographically protected data may not be accessible to a standard NFC reader.

AI Evidence Analysis


Show observed details, supporting photos, reference comparisons, contradictory evidence, and missing evidence.

Provide evidence references and source links.

Use outcomes: insufficient_evidence, requires_expert_review, concerns_found, and consistent_with_references.

Never present an AI-only result as an official authentication certificate.

LV Knowledge Base


Search by model, collection, material, hardware, construction details, and production period.

Separate official documentation, authorized-provider guidance, and independent expert references.

Show source URL, date retrieved, confidence in the source, reviewer status, and version history.

Allow administrators to approve corrections and new evidence.

Official Verification Providers


Provider directory with Entrupy first and additional providers supported through a modular architecture.

Provider connection status: Not configured, Awaiting authorization, Connected, Test failed.

Show required credentials, documentation, account eligibility, supported brands, supported workflows, and next actions.

Never show a provider as connected until a real connection test succeeds.

Certificates


Certificate ID, provider, linked item, official result, issue date, verification status, and official certificate link.

Distinguish verified provider records from user-uploaded documents that have not been verified.

Never create fake certificates or provider branding.

Integration Center


A checklist for database, AI vision, image storage, NFC device support, official provider API/SDK, webhooks, authentication, and automated tests.

Each integration has status, missing requirements, environment variable names, last test result, and next action.

Never display secret values.

Inspection History and Reports


Searchable cases, filters, image evidence, reviewer decisions, certificate references, and audit history.

Settings and Audit Logs


Language: Khmer and English.

Roles: Admin, Authenticator, Reviewer, Read-only.

Secure integration settings and permission controls.
UX rules


Make every major screen part of a connected user journey.

Include loading, empty, error, permission-denied, unavailable-device, and insufficient-evidence states.

Use believable sample data only in clearly labelled demo mode.

Do not invent official LV systems, APIs, provider partnerships, or successful scans.

Make the interface suitable for eventual integration with real backend services.

Provide consistent component names, field names, button labels, and navigation.

Prioritize clarity, evidence traceability, and honest results over decorative visuals.
Deliver a coherent design system and all primary screens, not just a landing page.
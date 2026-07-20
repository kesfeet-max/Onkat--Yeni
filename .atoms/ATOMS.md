---
last_updated: 2026-06-20T10:48:00Z
---

# Project Context

## Project Overview
Onkati is a neighborhood loyalty/points system platform for Turkey. Customers earn points (up to 25%) at local merchants by scanning QR codes or entering store codes. Merchants manage their stores, generate QR codes, and track transactions. Admins oversee the entire system.

## Key Decisions
| Date | Decision | By | Rationale |
|------|----------|-----|-----------|
| 2026-06-20 | Use Supabase as backend | Alex | Original project uses Supabase for auth, database, and edge functions |
| 2026-06-20 | Keep Turkish language UI | Alex | Target market is Turkey |
| 2026-06-20 | Use qrcode library for QR generation | Alex | Lightweight client-side QR code generation |

## Constraints
- Color palette: Primary green (#1a5f4a), Secondary gold (#d4a017)
- Typography: Inter (body), Plus Jakarta Sans (headings)
- All UI text in Turkish
- Supabase backend with edge functions for auth and transactions
- GPS-based location verification for transaction security
- Points rate configurable per merchant (1-25%)
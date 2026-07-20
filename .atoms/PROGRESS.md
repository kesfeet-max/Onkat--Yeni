---
last_updated: 2026-06-22T10:00:00Z
---

# Requirements & Progress

## Requirements Overview
Comprehensive update of Onkati loyalty platform: bug fixes, dynamic pricing, anti-fraud rules, new panel features, admin updates, and security hardening.

## Task Breakdown
- [ ] Fix password reset white screen (route/token handling)
- [ ] Remove fixed 7% point calculation, implement dynamic rates
- [ ] Fix point spending to 1:1 ratio (1 point = 1 TL)
- [ ] Fix merchant panel summary values (dynamic calculation)
- [ ] Remove GPS/location verification from code
- [ ] Add separate Cash/Card point rates in merchant settings
- [ ] Add payment type selection during transaction approval
- [ ] Implement minimum 2 purchases rule before spending points
- [ ] Implement duplicate request prevention (15 min cooldown)
- [ ] Implement auto-suspend (3+ stores in 5 min = 24h lock)
- [ ] Add real-time point request flow with sound notification
- [ ] Add pending requests badge/balloon
- [ ] Add calendar view for merchant daily/monthly reports
- [ ] Add customer detail view and blacklist feature
- [ ] Add Stores tab with frequently visited stores for customer
- [ ] Update admin panel with full user/merchant lists and suspicious user logs
- [ ] Add security layer (right-click disable, DevTools block, user-select none)
- [ ] Add PWA manifest and "Add to Home Screen" button

## Progress Log
- 2026-06-22: Plan approved, starting comprehensive implementation
- 2026-07-11: Fixed CustomerPanel store code validation - now uses merchant-get edge function instead of direct table access (bypasses RLS issues)
- 2026-07-11: Fixed CustomerPanel request creation - now uses requests edge function with proper merchant_id/store_id support
- 2026-07-11: Fixed AdminPanel data fetching - now uses admin-data edge function for all CRUD operations (overview, customers, merchants, transactions, suspicious logs, toggle status, unsuspend, update merchant)
- 2026-07-11: Updated requests edge function to accept merchant_id directly and handle amount=0 for point request flow
- 2026-07-11: Build and lint pass successfully. Edge functions need redeployment via Supabase CLI or platform UI.
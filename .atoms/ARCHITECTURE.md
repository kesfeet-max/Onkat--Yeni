# Architecture Design

## System Overview
Onkati is a React SPA with Supabase backend. The frontend handles user interactions, QR code generation, and communicates with Supabase edge functions for business logic.

## Tech Stack
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS
- Backend: Supabase (Auth, PostgreSQL, Edge Functions)
- QR: qrcode library for client-side generation
- State: React Context for auth state

## Module Design
| Module | Responsibility | Key Files |
|--------|---------------|-----------|
| Auth | User authentication and session management | src/auth/AuthContext.tsx, src/lib/supabase.ts |
| Landing | Public-facing homepage and info | src/pages/Index.tsx |
| Customer | Customer dashboard, transactions, store code entry | src/pages/CustomerPanel.tsx |
| Merchant | Merchant dashboard, QR generation, transaction management | src/pages/MerchantPanel.tsx |
| Admin | System administration panel | src/pages/AdminPanel.tsx, src/pages/AdminLoginPage.tsx |
| Utils | Shared utilities (formatting, location, phone) | src/lib/onkati-utils.ts |

## Tech Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Routing | React Router v6 | Standard SPA routing |
| Auth | Supabase Auth | Integrated with database, supports phone/email |
| Styling | Tailwind CSS | Utility-first, fast development |
| QR | qrcode npm package | Lightweight, no external service needed |

## File Tree Plan
```
src/
├── auth/AuthContext.tsx
├── components/
│   ├── Layout.tsx
│   ├── Footer.tsx
│   └── RedirectHandler.tsx
├── lib/
│   ├── supabase.ts
│   └── onkati-utils.ts
├── pages/
│   ├── Index.tsx
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── ResetPasswordPage.tsx
│   ├── Dashboard.tsx
│   ├── CustomerPanel.tsx
│   ├── MerchantPanel.tsx
│   ├── AdminLoginPage.tsx
│   └── AdminPanel.tsx
├── types/index.ts
├── App.tsx
├── main.tsx
└── index.css
```

## Implementation Guide
1. AuthContext provides user session and profile data across the app
2. Dashboard component routes to CustomerPanel or MerchantPanel based on user role
3. Edge functions handle registration, transactions, and merchant lookups
4. Store codes rotate every 25 seconds for security
5. GPS location is captured during transactions for verification
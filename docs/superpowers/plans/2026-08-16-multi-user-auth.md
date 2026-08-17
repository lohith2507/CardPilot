# Multi-user auth Implementation Plan

> **For agentic workers:** Implement task-by-task. Auth is multi-user with admin-provisioned accounts and forced password change on first login.

**Goal:** Multiple users each with private wallets; Google + email/password; admins create accounts; first login forces password change.

**Architecture:** `users` table is the allowlist. Sessions carry `userId`. Wallet data scoped by `userId`. Proxy gates on `AUTH_SECRET` + valid session (no DB in proxy).

## Tasks

1. Schema + migration (`users`, `user_currency_valuations`, `user_cards.user_id`, drop global `user_cpp`)
2. `lib/password.ts`, session shape, login/change-password/admin APIs
3. Proxy + Google callback match provisioned users
4. Scope wallet/catalog/actions/APIs by `userId`
5. Login / change-password / admin Accounts UI
6. `npm run user:create` CLI
7. Update tests + env docs

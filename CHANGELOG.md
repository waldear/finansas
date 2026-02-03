# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-02-02

### Added
- **Next.js App Router**: Migrated from Vite to Next.js for better scalability and Serverless support.
- **Supabase SSR**: Implemented server-side and browser-side clients using `@supabase/ssr`.
- **Zod Validation**: Added schemas for Transactions, Debts, and Savings Goals.
- **React Query**: Configured TanStack Query for efficient data fetching and state management.
- **Strict RLS**: Hardened Supabase Row Level Security policies.
- **Serverless API**: Created initial REST endpoints for transactions, debts, and savings.
- **Modern Layout**: Implemented a responsive dashboard shell with a mobile-first approach.

### Changed
- **Folder Structure**: Reorganized the project to follow Next.js conventions (`src/app`, `src/components`, etc.).
- **Build System**: Updated `package.json` to use Next.js build scripts.

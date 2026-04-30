// ============================================================
// migrate_tenancy.js — DEPRECATED
// ============================================================
// This script was a one-time SQLite migration helper that replaced
// hardcoded 'comp_uabiotech' references with dynamic company lookups.
//
// With the MySQL migration, multi-tenancy is handled properly:
// - Active company is stored in localStorage (client) and cookie (server).
// - API routes read the company from the request, not from hardcoded values.
//
// This file is kept for reference only. DO NOT RUN IT.
// ============================================================
console.log('This script is DEPRECATED. See database/README.md for the new setup.');
process.exit(0);

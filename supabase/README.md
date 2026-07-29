# Supabase — DFP UAT Agent

This directory contains the local Supabase configuration, migrations, and seed data for the DFP UAT Agent project.

## Structure

```
supabase/
├── config.toml          # Supabase CLI configuration
├── migrations/          # Timestamped SQL migrations (NEVER edit existing)
│   └── 20260729000000_initial_uat_schema.sql
├── seed.sql             # Optional fictional seed data for local dev
└── README.md            # This file
```

## Quick Start

```bash
# Start local Supabase
supabase start

# Check status
supabase status

# Apply migrations
supabase migration up

# Load optional seed data
supabase db seed

# Generate TypeScript types
supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

## Migration Rules

- Migrations are timestamped and immutable — never edit an existing migration file.
- Create new timestamped migrations for schema changes.
- Do NOT run migrations automatically in production.
- Always back up the database before applying migrations in production.

## Buckets

After running migrations, create the required private storage buckets:

```bash
supabase storage bucket create uat-evidence --private
supabase storage bucket create uat-reports --private
supabase storage bucket create uat-traces --private
```

## RLS

All UAT tables have Row Level Security enabled. Staff users can:
- Read all UAT data
- Create and update records
- Delete records (admin only for critical tables)

Anonymous users have no access to any UAT table.
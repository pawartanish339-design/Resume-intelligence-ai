#!/usr/bin/env bash
#
# Local bootstrap for the Resume Compatibility & Job Match Engine.
#
#   ./setup.sh
#
# It installs dependencies, creates .env.local from the template when one does not
# exist yet, and prints the two steps that cannot be automated: running the SQL
# migration inside your Supabase project, and promoting the first administrator.
#
# The script is intentionally non-destructive: it never overwrites an existing
# .env.local and never touches the database.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }
fail() { printf '\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

bold "Resume Compatibility & Job Match Engine — local setup"

# ---- 1. Node version ---------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not installed. Install Node 18.18 or newer (20+ recommended) and re-run."
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"

if [ "$NODE_MAJOR" -lt 18 ] || { [ "$NODE_MAJOR" -eq 18 ] && [ "$NODE_MINOR" -lt 18 ]; }; then
  fail "Node $(node -v) is too old. This project needs Node >= 18.18.0."
fi
echo "  ✓ Node $(node -v)"

# ---- 2. Environment file -----------------------------------------------------
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "  ✓ Created .env.local from .env.example"
  warn "  → Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY."
else
  echo "  ✓ .env.local already exists (left untouched)"
fi

# ---- 3. Dependencies ---------------------------------------------------------
bold "Installing dependencies"
if [ -f package-lock.json ]; then
  npm ci --no-audit --fund=false
else
  npm install --no-audit --fund=false
fi
echo "  ✓ Dependencies installed"

# ---- 4. Remaining manual steps ----------------------------------------------
bold "Two manual steps remain"

cat <<'STEPS'

  1. Database: open your Supabase project → SQL Editor, paste the contents of
     supabase/migrations/0001_init.sql and run it. It creates the schema, enables
     Row Level Security everywhere, adds the private "resumes" storage bucket and
     the admin reporting views.

  2. Auth redirect: in Supabase → Authentication → URL Configuration add
     http://localhost:3000/api/auth/callback (and keep the Site URL as
     http://localhost:3000 for local work).

  Then start the app:

     npm run dev            # http://localhost:3000

  Optional, to see the admin console:

     npm run admin:promote -- you@example.com

STEPS

bold "Done. Happy analysing."

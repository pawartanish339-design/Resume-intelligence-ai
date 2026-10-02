/**
 * Promote (or demote) an account to administrator.
 *
 * Usage:
 *   npm run admin:promote -- someone@example.com
 *   npm run admin:promote -- someone@example.com --demote
 *
 * Why a script: `app_metadata.role` is only writable with the service-role key, which
 * is what makes `public.is_admin()` trustworthy inside the RLS policies. The very
 * first administrator cannot be created through the admin console (it requires an
 * admin), so this is the one bootstrap step that has to run outside the app.
 *
 * The script never prints secrets; it only reports the outcome for one email address.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { getServerEnv, isServerEnvComplete, EnvValidationError } from '../lib/env';
import { findUserByEmail, setUserRole } from '../lib/db/admin';

/**
 * Minimal .env loader.
 *
 * Next.js loads `.env.local` for the app, but a standalone `tsx` process does not,
 * and adding a dependency just for this would be disproportionate. Existing process
 * variables always win, so CI can inject the service-role key directly.
 */
function loadEnvFiles(rootDir: string): void {
  for (const filename of ['.env.local', '.env']) {
    const file = path.join(rootDir, filename);
    if (!existsSync(file)) continue;

    for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator <= 0) continue;

      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function usage(): never {
  console.error('Usage: npm run admin:promote -- <email> [--demote]');
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const demote = args.includes('--demote');
  const email = args.find((argument) => !argument.startsWith('--'));

  if (!email) usage();

  loadEnvFiles(process.cwd());

  if (!isServerEnvComplete()) {
    console.error(
      'Environment configuration is incomplete.\n' +
        'Copy .env.example to .env.local, fill in the Supabase URL/keys and the OpenAI key, then retry.',
    );
    process.exit(1);
  }

  // Touch the validated config once so a malformed value fails here, not mid-request.
  const env = getServerEnv();
  console.log(`Supabase project: ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).host}`);

  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`No account found for ${email}. Register the account first, then re-run this script.`);
    process.exit(1);
  }

  const role = demote ? 'user' : 'admin';
  const updated = await setUserRole(user.id, role);

  console.log(
    demote
      ? `Revoked administrator access for ${email}.`
      : `Granted administrator access to ${email}.`,
  );
  console.log(`  user id : ${user.id}`);
  console.log(`  role    : ${(updated.app_metadata as { role?: string }).role ?? role}`);
  console.log('Sign out and back in for the new role to appear in the session token.');
}

main().catch((error: unknown) => {
  if (error instanceof EnvValidationError) {
    console.error(error.message);
  } else {
    console.error('Failed to update the account role:', error instanceof Error ? error.message : error);
  }
  process.exit(1);
});

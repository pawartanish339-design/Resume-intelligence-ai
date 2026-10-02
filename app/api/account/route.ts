import { NextResponse } from 'next/server';

import { createRoute, parseJsonBody } from '@/lib/utils/route-helpers';
import { deleteAccountSchema } from '@/lib/utils/validation';
import { deleteAccount } from '@/lib/services/account';
import { conflict } from '@/lib/utils/errors';
import type { DeleteAccountResponse } from '@/types/api';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * DELETE /api/account
 *
 * Requires the account email plus the exact confirmation phrase (re-authentication
 * without asking for the password again). Admins are refused with 409 because their
 * audit rows are ON DELETE RESTRICT -- see the migration comment for the documented
 * anonymise/transfer procedure.
 */
export const DELETE = createRoute({ rateLimit: 'mutate' }, async ({ request, user }) => {
  const body = await parseJsonBody(request, deleteAccountSchema);

  if (!user.email || body.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    throw conflict(
      'Account email did not match the signed-in account',
      'The email you typed does not match this account. Deletion was refused for your safety.',
    );
  }

  const outcome = await deleteAccount(user);

  const response: DeleteAccountResponse = {
    success: true,
    deleted: {
      resumes: 0,
      analyses: 0,
      storage_objects: outcome.storage_objects_deleted,
    },
  };

  return NextResponse.json(response);
});

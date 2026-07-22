import { verifySessionToken } from './auth';

// Returns the decoded session payload ({ uid, email, role, company_id }) or null.
export async function getSession(request) {
  const token = request.cookies.get('auth_session')?.value;
  return await verifySessionToken(token);
}

export async function getSecureCompanyId(request) {
  const token = request.cookies.get('auth_session')?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    throw new Error('Unauthorized');
  }

  // Super admin can impersonate/view any tenant using the active_company cookie or query param
  if (session.role === 'super_admin') {
    const searchParams = new URL(request.url).searchParams;
    const requestedCompanyId = searchParams.get('company') || request.cookies.get('active_company')?.value || '';
    return requestedCompanyId;
  }

  // Regular users are strictly locked to their session's company_id
  if (!session.company_id) {
    throw new Error('No tenant associated with this account');
  }

  return session.company_id;
}

export function canAccessSession({ session, authUser, token, currentTime = Date.now() }) {
  if (!session || !authUser?.id) {
    return { allowed: false, reason: 'missing-session-or-user' };
  }

  if (session.userId && authUser.id === session.userId) {
    return { allowed: true, reason: 'owner' };
  }

  if (token && session.validTokens?.has(token) && session.validTokens.get(token) > currentTime) {
    return { allowed: true, reason: 'paired-token' };
  }

  return { allowed: false, reason: 'unauthorized' };
}

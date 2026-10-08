export interface FibeOwnerContext {
  ownerType: 'Player' | 'Team';
  ownerId: string;
  principalType?: 'Player' | 'TeamServicePrincipal';
  principalId?: string;
  authorizationVersion?: 1 | 2;
}

/** Runtime metadata identifies a credential; it never grants ownership. */
export function readFibeOwnerContext(
  env: Record<string, string | undefined>,
): FibeOwnerContext | undefined {
  const ownerType = env.FIBE_OWNER_TYPE;
  const ownerId = env.FIBE_OWNER_ID;
  if (!ownerType && !ownerId) return undefined;
  if (
    (ownerType !== 'Player' && ownerType !== 'Team') ||
    !ownerId || !/^[1-9]\d*$/.test(ownerId)
  ) throw new Error('Invalid FIBE owner context');
  const principalType = env.FIBE_PRINCIPAL_TYPE;
  const principalId = env.FIBE_PRINCIPAL_ID;
  if ((principalType || principalId) && (
    (principalType !== 'Player' && principalType !== 'TeamServicePrincipal') ||
    !principalId || !/^[1-9]\d*$/.test(principalId)
  )) throw new Error('Invalid FIBE principal context');
  const version = env.FIBE_AUTHORIZATION_VERSION;
  if (version && version !== '1' && version !== '2') throw new Error('Invalid FIBE authorization version');
  return {
    ownerType, ownerId,
    principalType: principalType as FibeOwnerContext['principalType'],
    principalId,
    authorizationVersion: version ? Number(version) as 1 | 2 : undefined,
  };
}

export function fibeOwnerProofHeaders(context?: FibeOwnerContext): Record<string, string> {
  return context ? {
    'X-Fibe-Expected-Owner-Type': context.ownerType,
    'X-Fibe-Expected-Owner-ID': context.ownerId,
  } : {};
}

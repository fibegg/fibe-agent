import { describe, expect, test } from 'bun:test';
import { fibeOwnerProofHeaders, readFibeOwnerContext } from './owner-context';

describe('FIBE credential owner context', () => {
  test('retains exact stable identities and exposes only owner proof headers', () => {
    const context = readFibeOwnerContext({
      FIBE_OWNER_TYPE: 'Team', FIBE_OWNER_ID: '9223372036854775806',
      FIBE_PRINCIPAL_TYPE: 'TeamServicePrincipal', FIBE_PRINCIPAL_ID: '31',
      FIBE_AUTHORIZATION_VERSION: '2', FIBE_API_KEY: 'fixture-opaque',
    });
    expect(context?.ownerId).toBe('9223372036854775806');
    expect(fibeOwnerProofHeaders(context)).toEqual({
      'X-Fibe-Expected-Owner-Type': 'Team', 'X-Fibe-Expected-Owner-ID': '9223372036854775806',
    });
  });
  test('keeps older unset metadata compatible and rejects partial/forged fields', () => {
    expect(readFibeOwnerContext({})).toBeUndefined();
    for (const env of [
      { FIBE_OWNER_TYPE: 'Team' },
      { FIBE_OWNER_TYPE: 'Player', FIBE_OWNER_ID: '-1' },
      { FIBE_OWNER_TYPE: 'Team', FIBE_OWNER_ID: '4', FIBE_PRINCIPAL_TYPE: 'Player' },
      { FIBE_OWNER_TYPE: 'Team', FIBE_OWNER_ID: '4', FIBE_AUTHORIZATION_VERSION: '3' },
    ]) expect(() => readFibeOwnerContext(env)).toThrow();
  });
});

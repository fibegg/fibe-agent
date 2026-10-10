import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fibeOwnerProofHeaders, readFibeOwnerContext } from './owner-context';

// One credential-metadata fixture is shared with the Rails contract and the Go SDK. Every repository pins the
// same digest, so a change to one copy fails the others until all are updated together.
const SHARED_FIXTURE_SHA256 = 'b0fdea43bb72126b5bf7dd744eb41cdc748db25775f385c29ebee762705d1085';

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

  test('matches the shared cross-repository credential metadata fixture', () => {
    const raw = readFileSync(join(import.meta.dir, 'fixtures/owner-context-metadata-v1.json'));
    expect(createHash('sha256').update(raw).digest('hex')).toBe(SHARED_FIXTURE_SHA256);
    const fixture = JSON.parse(raw.toString('utf8')) as {
      cases: Array<{
        name: string;
        credential: { owner_type: string; principal_type: string; authorization_version: number };
        container_env: Record<string, string>;
        proof_headers: Record<string, string>;
      }>;
    };
    expect(fixture.cases.map((entry) => entry.name)).toEqual([
      'company_service_principal', 'company_member_player', 'personal_player', 'largest_safe_bigint',
    ]);
    for (const entry of fixture.cases) {
      const context = readFibeOwnerContext(entry.container_env);
      // Identifiers are compared as the exact environment strings: JSON numbers above 2^53 lose precision in JS.
      expect(context?.ownerType, entry.name).toBe(entry.credential.owner_type);
      expect(context?.ownerId, entry.name).toBe(entry.container_env.FIBE_OWNER_ID);
      expect(context?.principalType, entry.name).toBe(entry.credential.principal_type);
      expect(context?.principalId, entry.name).toBe(entry.container_env.FIBE_PRINCIPAL_ID);
      expect(context?.authorizationVersion, entry.name).toBe(entry.credential.authorization_version);
      expect(fibeOwnerProofHeaders(context), entry.name).toEqual(entry.proof_headers);
    }
  });
});

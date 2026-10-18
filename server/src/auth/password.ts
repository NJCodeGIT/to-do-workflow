import argon2 from 'argon2';

// Pinned explicitly so a library default change cannot weaken stored hashes.
export const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, HASH_OPTIONS);
}

/** Parameters are read from the encoded hash. */
export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// Fixed, non-secret input. Cached as a promise so concurrent callers share one hash.
const DUMMY_INPUT = 'dummy-password-for-timing-equalization';
let dummyHash: Promise<string> | undefined;

/** Returns the cached dummy hash, starting it if needed. A rejected hash is never kept. */
function getDummyHash(): Promise<string> {
  if (!dummyHash) {
    const pending: Promise<string> = argon2
      .hash(DUMMY_INPUT, HASH_OPTIONS)
      .catch((err: unknown) => {
        // Clear the cache so the next call retries instead of failing forever.
        if (dummyHash === pending) dummyHash = undefined;
        throw err;
      });
    dummyHash = pending;
  }
  return dummyHash;
}

/**
 * Computes the dummy hash ahead of time (called once at server startup) so the first
 * unknown-email login costs the same as later ones. Optional: verifyAgainstDummy works without it.
 */
export async function warmDummyHash(): Promise<void> {
  await getDummyHash();
}

/** Runs one verify against a dummy hash so unknown-email logins cost the same as wrong-password ones. */
export async function verifyAgainstDummy(password: string): Promise<void> {
  await argon2.verify(await getDummyHash(), password);
}

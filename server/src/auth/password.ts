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
let dummyHash: Promise<string> | undefined;

/** Runs one verify against a dummy hash so unknown-email logins cost the same as wrong-password ones. */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= argon2.hash('dummy-password-for-timing-equalization', HASH_OPTIONS);
  await argon2.verify(await dummyHash, password);
}

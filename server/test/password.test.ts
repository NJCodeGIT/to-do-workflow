import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Each test gets a fresh copy of password.ts (its dummy-hash cache is module state) and a
// pass-through spy on argon2.hash. Real argon2 runs with the pinned parameters.
type PasswordModule = typeof import('../src/auth/password.js');

async function load(failFirstHash: boolean): Promise<{
  mod: PasswordModule;
  hashCalls: () => number;
}> {
  vi.resetModules();
  let calls = 0;
  vi.doMock('argon2', async (importOriginal) => {
    const actual = await importOriginal<typeof import('argon2')>();
    // The type declarations expose no `default` here, but at runtime the module has one (the app
    // uses a default import), so type it explicitly.
    const real = (actual as unknown as { default: typeof actual }).default;
    const hash = vi.fn(async (...args: Parameters<typeof real.hash>) => {
      calls += 1;
      if (failFirstHash && calls === 1) throw new Error('simulated hash failure');
      return real.hash(...args);
    });
    return { ...actual, default: { ...real, hash } };
  });
  const mod = await import('../src/auth/password.js');
  return { mod, hashCalls: () => calls };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('argon2');
  vi.resetModules();
});

describe('dummy hash caching', () => {
  it('does not cache a failed dummy hash: first call rejects, the next succeeds', async () => {
    const { mod, hashCalls } = await load(true);

    await expect(mod.verifyAgainstDummy('any-password')).rejects.toThrow('simulated hash failure');
    expect(hashCalls()).toBe(1);

    await expect(mod.verifyAgainstDummy('any-password')).resolves.toBeUndefined();
    expect(hashCalls()).toBe(2);

    // Later calls reuse the cached successful hash.
    await mod.verifyAgainstDummy('another-password');
    await mod.warmDummyHash();
    expect(hashCalls()).toBe(2);
  });

  it('warmDummyHash rejects on failure and retries on the next call', async () => {
    const { mod, hashCalls } = await load(true);

    await expect(mod.warmDummyHash()).rejects.toThrow('simulated hash failure');
    await expect(mod.warmDummyHash()).resolves.toBeUndefined();
    expect(hashCalls()).toBe(2);

    await mod.verifyAgainstDummy('any-password');
    expect(hashCalls()).toBe(2);
  });

  it('concurrent callers share one in-flight hash', async () => {
    const { mod, hashCalls } = await load(false);
    await Promise.all([
      mod.warmDummyHash(),
      mod.verifyAgainstDummy('a'),
      mod.verifyAgainstDummy('b'),
    ]);
    expect(hashCalls()).toBe(1);
  });

  it('warmDummyHash resolves with no value and a following verifyAgainstDummy computes no second hash', async () => {
    const { mod, hashCalls } = await load(false);

    await expect(mod.warmDummyHash()).resolves.toBeUndefined();
    expect(hashCalls()).toBe(1);

    await mod.verifyAgainstDummy('any-password');
    await mod.verifyAgainstDummy('other-password');
    expect(hashCalls()).toBe(1);
  });

  it('verifyAgainstDummy works lazily without warm-up and hashes once', async () => {
    const { mod, hashCalls } = await load(false);
    await mod.verifyAgainstDummy('any-password');
    await mod.verifyAgainstDummy('any-password');
    expect(hashCalls()).toBe(1);
  });
});

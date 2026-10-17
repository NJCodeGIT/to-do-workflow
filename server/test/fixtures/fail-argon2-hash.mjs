// Test-only preload for startup.test.ts (node --import). Makes argon2.hash reject so the
// server's startup warm-up fails. The rejection text is a marker the test checks is never printed.
import argon2 from 'argon2';

argon2.hash = () => Promise.reject(new Error('warmup-failure-marker-xyz'));

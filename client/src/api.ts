// The only module allowed to call fetch (CLAUDE.md architecture rule).
const API_BASE = '/api/v1';

export async function getHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return (await res.json()) as { status: string };
}

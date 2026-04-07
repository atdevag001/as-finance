import type { APIRequestContext } from '@playwright/test';

const API_URL = process.env['API_URL'] || 'http://localhost:3001';

type TrackedEntity = { type: string; id: string };

export function createCleanupTracker() {
  const tracked: TrackedEntity[] = [];

  return {
    track(type: string, id: string) {
      tracked.push({ type, id });
    },

    async cleanup(request: APIRequestContext, token: string) {
      // Reverse order: delete children before parents
      for (const entity of tracked.reverse()) {
        try {
          await request.delete(`${API_URL}/${entity.type}/${entity.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // Best-effort cleanup
        }
      }
      tracked.length = 0;
    },
  };
}

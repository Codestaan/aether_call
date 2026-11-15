import { BACKEND_URL } from '../config';

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, options);
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || 'Something went wrong');
    err.status = res.status;
    throw err;
  }
  return body;
}

/** Creates a meeting and remembers the host token so this browser is recognised as the host. */
export async function createMeeting() {
  const { roomId, hostToken } = await request('/api/meetings', { method: 'POST' });
  localStorage.setItem(`aether:host:${roomId}`, hostToken);
  return roomId;
}

export const checkMeeting = (roomId) => request(`/api/meetings/${encodeURIComponent(roomId)}`);
export const getHostToken = (roomId) => localStorage.getItem(`aether:host:${roomId}`) || undefined;

/** Accepts a full link ("https://app/m/abc-defg-hij") or a bare code and returns the code, or null. */
export function parseRoomId(input) {
  const match = String(input).trim().toLowerCase().match(/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?(?:[?#].*)?$/);
  return match ? match[1] : null;
}

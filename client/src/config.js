// Backend URL comes from Vite env so the same build logic works locally and in production.
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');

/**
 * ICE servers for RTCPeerConnection.
 * STUN (free Google servers) lets peers discover their public address and works for most home networks.
 * TURN relays media when a direct path is impossible (corporate firewalls, symmetric NAT, some mobile data).
 * Without TURN, a share of real-world calls will fail to connect, so add one before going live.
 */
export function getIceServers() {
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(',').map((u) => u.trim()).filter(Boolean),
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    });
  }
  return servers;
}

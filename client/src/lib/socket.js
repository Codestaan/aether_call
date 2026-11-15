import { io } from 'socket.io-client';
import { BACKEND_URL } from '../config';

/** One socket per meeting page. Not connected until .connect() is called. */
export function createSocket() {
  return io(BACKEND_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'], // websocket first; polling is a fallback for restrictive networks
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}

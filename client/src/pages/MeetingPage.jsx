import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLocalMedia } from '../hooks/useLocalMedia.js';
import { createSocket } from '../lib/socket';
import { checkMeeting, getHostToken } from '../lib/api';
import Lobby from '../components/Lobby.jsx';
import Room from '../components/Room.jsx';

/**
 * Owns the socket and the join flow:
 *   prejoin -> (guest) waiting -> room      or      prejoin -> (host) room
 * phases: 'prejoin' | 'waiting' | 'denied' | 'room' | 'left'
 */
export default function MeetingPage() {
  const { roomId } = useParams();
  const media = useLocalMedia();
  const hostToken = useMemo(() => getHostToken(roomId), [roomId]);

  const [name, setName] = useState(() => localStorage.getItem('aether:name') || '');
  const [phase, setPhase] = useState('prejoin');
  const [session, setSession] = useState(null);
  const [sessionKey, setSessionKey] = useState(0); // bump to remount <Room> with a clean WebRTC state
  const [connection, setConnection] = useState('connecting');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [exists, setExists] = useState(null);
  const [leftMessage, setLeftMessage] = useState('');

  const socketRef = useRef(null);
  const nameRef = useRef(name);
  nameRef.current = name;
  const joinedRef = useRef(false); // true once we've joined/knocked, so we know to rejoin after a reconnect

  useEffect(() => {
    checkMeeting(roomId)
      .then(() => setExists(true))
      .catch((err) => setExists(err.status === 404 || err.status === 400 ? false : true)); // network errors surface on join
  }, [roomId]);

  const requestJoin = useCallback(
    ({ rejoin = false } = {}) => {
      const socket = socketRef.current;
      if (!socket) return;
      setJoining(true);
      setError('');
      socket.timeout(10000).emit('room:join', { roomId, name: nameRef.current.trim(), hostToken }, (err, res) => {
        setJoining(false);
        if (err) return setError('The server did not respond. Try again.');
        if (!res.ok) {
          setError(res.error);
          if (rejoin) { joinedRef.current = false; setPhase('prejoin'); }
          return;
        }
        joinedRef.current = true;
        if (res.status === 'admitted') {
          setSession(res);
          setSessionKey((k) => k + 1);
          setPhase('room');
        } else {
          setPhase('waiting');
        }
      });
    },
    [roomId, hostToken]
  );

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnection('online');
      // After a dropped connection our old socket is gone server-side, so enter again.
      // A guest goes back through the waiting room; the host re-enters directly.
      if (joinedRef.current) requestJoin({ rejoin: true });
    });
    socket.on('disconnect', () => setConnection('offline'));
    socket.on('connect_error', () => setConnection('offline'));

    socket.on('lobby:admitted', (payload) => {
      joinedRef.current = true;
      setSession({ ok: true, status: 'admitted', ...payload });
      setSessionKey((k) => k + 1);
      setPhase('room');
    });
    socket.on('lobby:denied', () => {
      joinedRef.current = false;
      setPhase('denied');
    });
    socket.on('room:replaced', () => {
      joinedRef.current = false;
      setLeftMessage('You opened this meeting in another tab or device, so this one was closed.');
      setPhase('left');
    });

    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [requestJoin]);

  function handleJoin() {
    localStorage.setItem('aether:name', name.trim());
    requestJoin();
  }

  function handleLeave() {
    joinedRef.current = false;
    socketRef.current?.disconnect();
    setLeftMessage('');
    setSession(null);
    setPhase('left');
  }

  function handleCancelWaiting() {
    joinedRef.current = false;
    socketRef.current?.disconnect().connect(); // drop out of the host's waiting list
    setPhase('prejoin');
  }

  function handleRejoin() {
    setConnection('connecting');
    socketRef.current?.connect();
    setPhase('prejoin');
  }

  if (exists === false) {
    return (
      <main className="page-center">
        <h1>Meeting not found</h1>
        <p className="muted">Check the link with whoever invited you, or start a new meeting.</p>
        <Link className="btn btn-primary" to="/">Back to home</Link>
      </main>
    );
  }

  if (phase === 'left') {
    return (
      <main className="page-center">
        <h1>You left the meeting</h1>
        {leftMessage && <p className="muted">{leftMessage}</p>}
        <div className="row-actions">
          <button className="btn btn-primary" onClick={handleRejoin}>Rejoin</button>
          <Link className="btn btn-ghost" to="/">Home</Link>
        </div>
      </main>
    );
  }

  if (phase === 'room' && session) {
    return (
      <Room key={sessionKey} socket={socketRef.current} roomId={roomId} session={session} media={media} connection={connection} onLeave={handleLeave} />
    );
  }

  return (
    <Lobby
      media={media}
      name={name}
      onNameChange={setName}
      status={phase === 'waiting' ? 'waiting' : phase === 'denied' ? 'denied' : 'idle'}
      isHost={Boolean(hostToken)}
      roomId={roomId}
      onJoin={handleJoin}
      onCancel={handleCancelWaiting}
      joining={joining}
      error={error}
      connection={connection}
    />
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { getIceServers } from '../config';

/**
 * Mesh WebRTC: one RTCPeerConnection per remote participant.
 * Rule that avoids offer collisions ("glare"): whoever joins the room later sends the offers.
 *  - On mount we create connections (as initiator) to everyone already in the room.
 *  - People who join after us send us an offer, and we answer.
 */
export function useWebRTC({ socket, localStream, initialPeers }) {
  const pcsRef = useRef(new Map()); // peerId -> RTCPeerConnection
  const initiatorsRef = useRef(new Set()); // peers we are responsible for (re)offering to
  const pendingIceRef = useRef(new Map()); // ICE candidates that arrived before the remote description
  const remoteStreamsRef = useRef(new Map()); // fallback streams for tracks that arrive without a stream
  const localStreamRef = useRef(localStream);
  localStreamRef.current = localStream;

  const [peers, setPeers] = useState(() =>
    Object.fromEntries(initialPeers.map((p) => [p.id, { ...p, stream: null, connection: 'connecting' }]))
  );

  const patchPeer = useCallback((id, patch) => {
    setPeers((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));
  }, []);

  const closePeer = useCallback((id) => {
    const pc = pcsRef.current.get(id);
    if (pc) {
      pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = pc.onnegotiationneeded = null;
      pc.close();
    }
    pcsRef.current.delete(id);
    initiatorsRef.current.delete(id);
    pendingIceRef.current.delete(id);
    remoteStreamsRef.current.delete(id);
  }, []);

  const createPeer = useCallback(
    (id, initiator) => {
      const existing = pcsRef.current.get(id);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      pcsRef.current.set(id, pc);
      if (initiator) initiatorsRef.current.add(id);

      // Send our tracks. If we have none of a kind (denied camera, etc.) the initiator still
      // asks to RECEIVE it; the answerer's transceivers are created from the incoming offer.
      const local = localStreamRef.current;
      local?.getTracks().forEach((track) => pc.addTrack(track, local));
      if (initiator) {
        ['audio', 'video'].forEach((kind) => {
          if (!local?.getTracks().some((t) => t.kind === kind)) pc.addTransceiver(kind, { direction: 'recvonly' });
        });
      }

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('signal', { to: id, data: { candidate } });
      };

      pc.ontrack = ({ track, streams }) => {
        let remote = streams[0];
        if (!remote) {
          remote = remoteStreamsRef.current.get(id) || new MediaStream();
          remote.addTrack(track);
          remoteStreamsRef.current.set(id, remote);
        }
        patchPeer(id, { stream: remote });
      };

      if (initiator) {
        pc.onnegotiationneeded = async () => {
          try {
            const offer = await pc.createOffer(); // after restartIce() this automatically restarts ICE
            if (pc.signalingState !== 'stable') return;
            await pc.setLocalDescription(offer);
            socket.emit('signal', { to: id, data: { description: pc.localDescription } });
          } catch (err) {
            console.error('Negotiation failed', err);
          }
        };
      }

      // Recover from network changes (Wi-Fi to mobile data, brief drops)
      pc.onconnectionstatechange = () => {
        patchPeer(id, { connection: pc.connectionState });
        if (pc.connectionState === 'failed') {
          if (initiator) pc.restartIce();
          else socket.emit('signal', { to: id, data: { restart: true } }); // ask the offerer to restart
        }
      };

      return pc;
    },
    [socket, patchPeer]
  );

  useEffect(() => {
    // 1) Call everyone who was already here
    initialPeers.forEach((p) => createPeer(p.id, true));

    // 2) Someone new was admitted: wait for their offer
    const onPeerJoined = (peer) =>
      setPeers((prev) => ({
        ...prev,
        [peer.id]: { stream: null, connection: 'connecting', ...prev[peer.id], ...peer },
      }));

    const onPeerLeft = ({ id }) => {
      closePeer(id);
      setPeers((prev) => {
        const { [id]: _gone, ...rest } = prev;
        return rest;
      });
    };

    const onPeerMedia = ({ id, audio, video }) => patchPeer(id, { audio, video });

    // 3) Offers, answers and ICE candidates relayed through the server
    const onSignal = async ({ from, data }) => {
      try {
        if (data.restart) {
          if (initiatorsRef.current.has(from)) pcsRef.current.get(from)?.restartIce();
          return;
        }

        if (data.description) {
          const pc =
            pcsRef.current.get(from) || (data.description.type === 'offer' ? createPeer(from, false) : null);
          if (!pc) return;
          setPeers((prev) =>
            prev[from] ? prev : { ...prev, [from]: { id: from, name: 'Guest', audio: true, video: true, stream: null, connection: 'connecting' } }
          );
          await pc.setRemoteDescription(data.description);

          // Flush candidates that arrived early
          for (const c of pendingIceRef.current.get(from) || []) await pc.addIceCandidate(c).catch(() => {});
          pendingIceRef.current.delete(from);

          if (data.description.type === 'offer') {
            await pc.setLocalDescription(await pc.createAnswer());
            socket.emit('signal', { to: from, data: { description: pc.localDescription } });
          }
        } else if (data.candidate) {
          const pc = pcsRef.current.get(from);
          if (pc?.remoteDescription) {
            await pc.addIceCandidate(data.candidate).catch(() => {});
          } else {
            const queue = pendingIceRef.current.get(from) || [];
            queue.push(data.candidate);
            pendingIceRef.current.set(from, queue);
          }
        }
      } catch (err) {
        console.error('Signal handling failed', err);
      }
    };

    socket.on('peer:joined', onPeerJoined);
    socket.on('peer:left', onPeerLeft);
    socket.on('peer:media', onPeerMedia);
    socket.on('signal', onSignal);

    const pcs = pcsRef.current;
    return () => {
      socket.off('peer:joined', onPeerJoined);
      socket.off('peer:left', onPeerLeft);
      socket.off('peer:media', onPeerMedia);
      socket.off('signal', onSignal);
      [...pcs.keys()].forEach(closePeer);
    };
    // Runs once per Room mount; the Room is re-keyed on reconnect to start a clean session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return Object.values(peers);
}

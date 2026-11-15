import { useCallback, useEffect, useRef, useState } from 'react';

// Audio quality: browser-level echo cancellation, noise suppression and auto gain.
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: { ideal: 48000 },
};

const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: 'user',
};

/** Turns a getUserMedia failure into a message a person can act on. */
export function describeMediaError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera and microphone access is blocked. Click the lock icon in the address bar, allow both, then retry.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera or microphone was found. Connect one and retry.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Your camera or microphone is being used by another app. Close it and retry.';
    default:
      return 'Could not start your camera or microphone.';
  }
}

/** Tries camera+mic, then mic only, then camera only, so one broken device doesn't block joining. */
async function acquire() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { stream: null, error: 'Your browser cannot access media devices. Use HTTPS and a current browser.' };
  }
  const attempts = [
    { audio: AUDIO_CONSTRAINTS, video: VIDEO_CONSTRAINTS },
    { audio: AUDIO_CONSTRAINTS, video: false },
    { audio: false, video: VIDEO_CONSTRAINTS },
  ];
  let lastError;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      let warning = null;
      if (!stream.getVideoTracks().length) warning = 'Camera unavailable. You can still join with audio.';
      if (!stream.getAudioTracks().length) warning = 'Microphone unavailable. People will not hear you.';
      return { stream, warning };
    } catch (err) {
      lastError = err;
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') break; // retrying won't help
    }
  }
  return { stream: null, error: describeMediaError(lastError) };
}

export function useLocalMedia() {
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [audioOn, setAudioOn] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const streamRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    acquire().then((result) => {
      if (cancelled) {
        result.stream?.getTracks().forEach((t) => t.stop()); // component left before permission resolved
        return;
      }
      streamRef.current = result.stream;
      setStream(result.stream);
      setError(result.error || null);
      setWarning(result.warning || null);
      setAudioOn(Boolean(result.stream?.getAudioTracks().length));
      setVideoOn(Boolean(result.stream?.getVideoTracks().length));
      setLoading(false);

      // If a device is unplugged mid-call, tell the user instead of failing silently
      result.stream?.getTracks().forEach((track) =>
        track.addEventListener('ended', () => {
          setWarning(`Your ${track.kind === 'audio' ? 'microphone' : 'camera'} was disconnected.`);
          if (track.kind === 'audio') setAudioOn(false);
          else setVideoOn(false);
        })
      );
    });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop()); // releases the camera light
      streamRef.current = null;
    };
  }, [attempt]);

  // Muting only flips track.enabled: no renegotiation, instant, and remote peers keep the same tracks.
  const toggleAudio = useCallback(() => {
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    if (!tracks.length) return;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = next));
    setAudioOn(next);
  }, []);

  const toggleVideo = useCallback(() => {
    const tracks = streamRef.current?.getVideoTracks() ?? [];
    if (!tracks.length) return;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = next));
    setVideoOn(next);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { stream, loading, error, warning, audioOn, videoOn, toggleAudio, toggleVideo, retry };
}

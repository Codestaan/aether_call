import { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import CopyLinkButton from './CopyLinkButton.jsx';

/**
 * Pre-join screen + waiting room.
 * status: 'idle' (choose name/devices) | 'waiting' (knocked, host hasn't answered) | 'denied'
 */
export default function Lobby({ media, name, onNameChange, status, isHost, roomId, onJoin, onCancel, joining, error, connection }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = media.stream;
  }, [media.stream]);

  const canJoin = name.trim().length > 0 && !media.loading && connection === 'online' && !joining;

  function submit(e) {
    e.preventDefault();
    if (canJoin) onJoin();
  }

  return (
    <main className="lobby">
      <section className="preview">
        <video ref={videoRef} autoPlay playsInline muted className={`mirrored${media.videoOn ? '' : ' tile-video-off'}`} />
        {!media.videoOn && (
          <div className="preview-off">
            {media.loading ? 'Starting camera…' : media.stream ? 'Camera is off' : 'No camera'}
          </div>
        )}
        <div className="preview-controls">
          <button className={`ctl${media.audioOn ? '' : ' ctl-off'}`} onClick={media.toggleAudio} disabled={!media.stream?.getAudioTracks().length} aria-label="Toggle microphone">
            {media.audioOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button className={`ctl${media.videoOn ? '' : ' ctl-off'}`} onClick={media.toggleVideo} disabled={!media.stream?.getVideoTracks().length} aria-label="Toggle camera">
            {media.videoOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
        </div>
      </section>

      <section className="lobby-side">
        {status === 'waiting' ? (
          <>
            <h1>Waiting for the host</h1>
            <p className="muted"><span className="spinner" aria-hidden="true" /> The host has been told you’re here. You’ll join as soon as they let you in.</p>
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          </>
        ) : (
          <>
            <h1>{isHost ? 'Start your meeting' : 'Ready to join?'}</h1>
            <p className="muted mono">{roomId}</p>

            {status === 'denied' && <p className="field-error" role="alert">The host declined your request to join.</p>}
            {media.error && (
              <div className="notice notice-error" role="alert">
                <p>{media.error}</p>
                <button className="btn btn-small btn-ghost" onClick={media.retry}>Retry</button>
                <p className="muted">You can still join without them and listen in.</p>
              </div>
            )}
            {media.warning && !media.error && <p className="notice">{media.warning}</p>}
            {connection !== 'online' && <p className="notice">Connecting to the server…</p>}

            <form onSubmit={submit} className="stack">
              <label htmlFor="name">Your name</label>
              <input id="name" value={name} onChange={(e) => onNameChange(e.target.value)} maxLength={40} placeholder="Name shown to others" autoFocus autoComplete="name" />
              {error && <p className="field-error" role="alert">{error}</p>}
              <button className="btn btn-primary btn-large" type="submit" disabled={!canJoin}>
                {joining ? 'Joining…' : isHost ? 'Start meeting' : status === 'denied' ? 'Ask again' : 'Ask to join'}
              </button>
            </form>

            {isHost && <CopyLinkButton roomId={roomId} />}
          </>
        )}
      </section>
    </main>
  );
}

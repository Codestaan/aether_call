import { useEffect, useRef } from 'react';
import { MicOff } from 'lucide-react';

/** One participant. Shows an initial instead of video when the camera is off or not yet connected. */
export default function VideoTile({ stream, name, isLocal = false, audioOn = true, videoOn = true, isHost = false, connection = 'connected' }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el && el.srcObject !== (stream || null)) el.srcObject = stream || null;
  }, [stream]);

  const showVideo = Boolean(stream) && videoOn;
  const status =
    !isLocal && connection !== 'connected'
      ? connection === 'connecting' || connection === 'new'
        ? 'Connecting…'
        : 'Reconnecting…'
      : null;

  return (
    <div className={`tile${isLocal ? ' tile-local' : ''}`}>
      {/* Hidden (not unmounted) when the camera is off so remote audio keeps playing */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`tile-video${showVideo ? '' : ' tile-video-off'}${isLocal ? ' mirrored' : ''}`}
      />
      {!showVideo && <div className="avatar" aria-hidden="true">{(name || '?').trim().charAt(0).toUpperCase()}</div>}
      {status && <div className="tile-status">{status}</div>}
      <div className="tile-label">
        {!audioOn && <MicOff size={14} aria-label="Muted" />}
        <span>{isLocal ? 'You' : name}{isHost ? ' (host)' : ''}</span>
      </div>
    </div>
  );
}

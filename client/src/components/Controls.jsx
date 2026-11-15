import { Mic, MicOff, MessageSquare, PhoneOff, Users, Video, VideoOff } from 'lucide-react';

export default function Controls({
  audioOn, videoOn, hasAudio, hasVideo, onToggleAudio, onToggleVideo,
  panel, onPanel, unread, waitingCount, onLeave,
}) {
  return (
    <nav className="controls" aria-label="Meeting controls">
      <button
        className={`ctl${audioOn ? '' : ' ctl-off'}`}
        onClick={onToggleAudio}
        disabled={!hasAudio}
        aria-pressed={!audioOn}
        title={hasAudio ? (audioOn ? 'Mute microphone' : 'Unmute microphone') : 'No microphone'}
      >
        {audioOn ? <Mic size={20} /> : <MicOff size={20} />}
      </button>

      <button
        className={`ctl${videoOn ? '' : ' ctl-off'}`}
        onClick={onToggleVideo}
        disabled={!hasVideo}
        aria-pressed={!videoOn}
        title={hasVideo ? (videoOn ? 'Turn camera off' : 'Turn camera on') : 'No camera'}
      >
        {videoOn ? <Video size={20} /> : <VideoOff size={20} />}
      </button>

      <button
        className={`ctl${panel === 'chat' ? ' ctl-active' : ''}`}
        onClick={() => onPanel('chat')}
        title="Chat"
      >
        <MessageSquare size={20} />
        {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      <button
        className={`ctl${panel === 'people' ? ' ctl-active' : ''}`}
        onClick={() => onPanel('people')}
        title="People"
      >
        <Users size={20} />
        {waitingCount > 0 && <span className="badge badge-warn">{waitingCount}</span>}
      </button>

      <button className="ctl ctl-leave" onClick={onLeave} title="Leave meeting">
        <PhoneOff size={20} />
        <span>Leave</span>
      </button>
    </nav>
  );
}

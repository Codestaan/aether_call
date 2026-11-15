import { useCallback, useEffect, useRef, useState } from 'react';
import { useWebRTC } from '../hooks/useWebRTC.js';
import VideoGrid from './VideoGrid.jsx';
import Controls from './Controls.jsx';
import Chatbox from './Chatbox.jsx';
import PeoplePanel from './PeoplePanel.jsx';
import AdmitToast from './AdmitToast.jsx';
import CopyLinkButton from './CopyLinkButton.jsx';

/** The live meeting. Mounted only after the host admitted us (or we are the host). */
export default function Room({ socket, roomId, session, media, connection, onLeave }) {
  const { you, peers: initialPeers, history, waiting: initialWaiting } = session;
  const isHost = you.isHost;

  const peers = useWebRTC({ socket, localStream: media.stream, initialPeers });
  const [panel, setPanel] = useState(null); // 'chat' | 'people' | null
  const [messages, setMessages] = useState(history);
  const [unread, setUnread] = useState(0);
  const [waiting, setWaiting] = useState(initialWaiting);
  const [notice, setNotice] = useState('');
  const panelRef = useRef(panel);
  panelRef.current = panel;

  useEffect(() => {
    const onChat = (m) => {
      setMessages((prev) => [...prev, m]);
      if (panelRef.current !== 'chat' && m.from !== socket.id) setUnread((n) => n + 1);
    };
    const onWaiting = (list) => setWaiting(list);
    socket.on('chat:message', onChat);
    socket.on('waiting:update', onWaiting);
    return () => {
      socket.off('chat:message', onChat);
      socket.off('waiting:update', onWaiting);
    };
  }, [socket]);

  // Tell everyone our mic/camera state (drives muted badges and avatars on their screens)
  useEffect(() => {
    socket.emit('media:state', { audio: media.audioOn, video: media.videoOn });
  }, [socket, media.audioOn, media.videoOn]);

  // Make "someone is waiting" visible even when this tab is in the background
  useEffect(() => {
    if (!isHost) return undefined;
    document.title = waiting.length ? `(${waiting.length}) Someone is waiting · Aether` : 'Aether';
    return () => { document.title = 'Aether'; };
  }, [isHost, waiting.length]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const hostAction = useCallback(
    (event, payload) =>
      socket.timeout(8000).emit(event, payload, (err, res) => {
        if (err) setNotice('The server did not respond.');
        else if (res && !res.ok) setNotice(res.error);
      }),
    [socket]
  );

  const sendChat = useCallback(
    (text) =>
      new Promise((resolve) =>
        socket.timeout(8000).emit('chat:message', { text }, (err, res) =>
          resolve(err ? { ok: false, error: 'Message not delivered. Check your connection.' } : res)
        )
      ),
    [socket]
  );

  function togglePanel(name) {
    setPanel((cur) => (cur === name ? null : name));
    if (name === 'chat') setUnread(0);
  }

  return (
    <div className="room">
      <header className="room-bar">
        <span className="mono room-code">{roomId}</span>
        <CopyLinkButton roomId={roomId} />
        {connection !== 'online' && <span className="banner banner-warn">Connection lost. Reconnecting…</span>}
        {media.warning && <span className="banner">{media.warning}</span>}
        {notice && <span className="banner banner-warn" role="status">{notice}</span>}
      </header>

      <div className="room-main">
        <VideoGrid
          localStream={media.stream}
          localName={you.name}
          audioOn={media.audioOn}
          videoOn={media.videoOn}
          isHost={isHost}
          peers={peers}
        />
        {panel && (
          <aside className="side">
            {panel === 'chat' ? (
              <Chatbox messages={messages} selfId={socket.id} onSend={sendChat} onClose={() => setPanel(null)} />
            ) : (
              <PeoplePanel
                you={you}
                peers={peers}
                waiting={waiting}
                isHost={isHost}
                onAdmit={(id) => hostAction('room:admit', { id })}
                onDeny={(id) => hostAction('room:deny', { id })}
                onAdmitAll={() => hostAction('room:admitAll')}
                onClose={() => setPanel(null)}
              />
            )}
          </aside>
        )}
      </div>

      {isHost && panel !== 'people' && waiting.length > 0 && (
        <AdmitToast
          waiting={waiting}
          onAdmit={(id) => hostAction('room:admit', { id })}
          onDeny={(id) => hostAction('room:deny', { id })}
          onOpenPeople={() => setPanel('people')}
        />
      )}

      <Controls
        audioOn={media.audioOn}
        videoOn={media.videoOn}
        hasAudio={Boolean(media.stream?.getAudioTracks().length)}
        hasVideo={Boolean(media.stream?.getVideoTracks().length)}
        onToggleAudio={media.toggleAudio}
        onToggleVideo={media.toggleVideo}
        panel={panel}
        onPanel={togglePanel}
        unread={unread}
        waitingCount={isHost ? waiting.length : 0}
        onLeave={onLeave}
      />
    </div>
  );
}

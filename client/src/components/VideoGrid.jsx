import VideoTile from './VideoTile.jsx';

export default function VideoGrid({ localStream, localName, audioOn, videoOn, isHost, peers }) {
  const count = peers.length + 1;
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;

  return (
    <div className="grid" style={{ '--cols': cols }}>
      <VideoTile isLocal stream={localStream} name={localName} audioOn={audioOn} videoOn={videoOn} isHost={isHost} />
      {peers.map((p) => (
        <VideoTile
          key={p.id}
          stream={p.stream}
          name={p.name}
          audioOn={p.audio}
          videoOn={p.video}
          isHost={p.isHost}
          connection={p.connection}
        />
      ))}
    </div>
  );
}

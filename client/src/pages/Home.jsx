import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video } from 'lucide-react';
import { createMeeting, parseRoomId } from '../lib/api';

export default function Home() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');

  async function startMeeting() {
    setBusy(true);
    setError('');
    try {
      const roomId = await createMeeting();
      navigate(`/m/${roomId}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function joinMeeting(e) {
    e.preventDefault();
    const roomId = parseRoomId(code);
    if (!roomId) return setError('That doesn’t look like a meeting link or code (example: abc-defg-hij).');
    navigate(`/m/${roomId}`);
  }

  return (
    <main className="home">
      <div className="home-copy">
        <h1>Meet face to face, from any browser.</h1>
        <p className="muted lead">Start a meeting, send the link, and let people in from the waiting room when you’re ready.</p>
      </div>

      <div className="home-actions">
        <button className="btn btn-primary btn-large" onClick={startMeeting} disabled={busy}>
          <Video size={20} /> {busy ? 'Creating…' : 'New meeting'}
        </button>

        <form onSubmit={joinMeeting} className="join-row">
          <label htmlFor="code" className="sr-only">Meeting link or code</label>
          <input id="code" value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} placeholder="Paste a meeting link or code" />
          <button className="btn btn-ghost" type="submit" disabled={!code.trim()}>Join</button>
        </form>

        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </main>
  );
}

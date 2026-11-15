import { useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';

const timeFmt = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });

export default function Chatbox({ messages, selfId, onSend, onClose }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function submit(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    setError('');
    const res = await onSend(value);
    if (!res?.ok) {
      setText(value); // give the text back so nothing is lost
      setError(res?.error || 'Message not sent');
    }
  }

  return (
    <section className="panel" aria-label="Chat">
      <header className="panel-head">
        <h2>Chat</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close chat"><X size={18} /></button>
      </header>

      <ul className="messages">
        {messages.length === 0 && <li className="empty">No messages yet. Say hello.</li>}
        {messages.map((m) => {
          const mine = m.from === selfId;
          return (
            <li key={m.id} className={`msg${mine ? ' msg-mine' : ''}`}>
              <div className="msg-meta">{mine ? 'You' : m.name} · {timeFmt.format(m.ts)}</div>
              <div className="msg-text">{m.text}</div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ul>

      {error && <p className="field-error" role="alert">{error}</p>}
      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message everyone"
          maxLength={1000}
          aria-label="Message"
        />
        <button className="icon-btn icon-btn-primary" type="submit" aria-label="Send" disabled={!text.trim()}>
          <Send size={18} />
        </button>
      </form>
    </section>
  );
}

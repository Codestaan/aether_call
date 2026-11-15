import { Check, X } from 'lucide-react';

export default function PeoplePanel({ you, peers, waiting, isHost, onAdmit, onDeny, onAdmitAll, onClose }) {
  return (
    <section className="panel" aria-label="People">
      <header className="panel-head">
        <h2>People</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close people"><X size={18} /></button>
      </header>

      <div className="panel-body">
        {isHost && (
          <div className="group">
            <div className="group-head">
              <h3>Waiting to join ({waiting.length})</h3>
              {waiting.length > 1 && <button className="link-btn" onClick={onAdmitAll}>Admit all</button>}
            </div>
            {waiting.length === 0 && <p className="empty">Nobody is waiting.</p>}
            <ul className="people">
              {waiting.map((w) => (
                <li key={w.id}>
                  <span className="person-name">{w.name}</span>
                  <span className="row-actions">
                    <button className="btn btn-small btn-primary" onClick={() => onAdmit(w.id)}><Check size={14} /> Admit</button>
                    <button className="btn btn-small btn-ghost" onClick={() => onDeny(w.id)}><X size={14} /> Deny</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="group">
          <h3>In this meeting ({peers.length + 1})</h3>
          <ul className="people">
            <li><span className="person-name">{you.name} (you){you.isHost ? ', host' : ''}</span></li>
            {peers.map((p) => (
              <li key={p.id}><span className="person-name">{p.name}{p.isHost ? ' (host)' : ''}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

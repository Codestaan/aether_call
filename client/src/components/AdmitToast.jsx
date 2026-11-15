import { Check, X } from 'lucide-react';

/** Pops up for the host whenever someone is knocking, even with the side panel closed. */
export default function AdmitToast({ waiting, onAdmit, onDeny, onOpenPeople }) {
  const first = waiting[0];
  return (
    <div className="toast" role="alert">
      <p>
        <strong>{first.name}</strong> wants to join
        {waiting.length > 1 && (
          <> <button className="link-btn" onClick={onOpenPeople}>+{waiting.length - 1} more</button></>
        )}
      </p>
      <div className="row-actions">
        <button className="btn btn-small btn-primary" onClick={() => onAdmit(first.id)}><Check size={14} /> Admit</button>
        <button className="btn btn-small btn-ghost" onClick={() => onDeny(first.id)}><X size={14} /> Deny</button>
      </div>
    </div>
  );
}

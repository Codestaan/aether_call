import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / non-secure contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

export default function CopyLinkButton({ roomId }) {
  const [state, setState] = useState('idle'); // idle | copied | failed
  const link = `${window.location.origin}/m/${roomId}`;

  async function handleCopy() {
    const ok = await copyText(link);
    setState(ok ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button className="btn btn-ghost" onClick={handleCopy} title={link}>
      {state === 'copied' ? <Check size={16} /> : <Link2 size={16} />}
      <span>{state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy failed: select the link in the address bar' : 'Copy meeting link'}</span>
    </button>
  );
}

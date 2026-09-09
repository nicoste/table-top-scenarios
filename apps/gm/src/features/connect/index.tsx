// The address players connect to, always on screen (R-93), and copyable.

import { useEffect, useState } from 'react';
import { Tooltip } from '@tt/ui';

interface Props { urls: readonly string[] }

/**
 * `navigator.clipboard` only exists in a secure context, and the GM console is
 * served over plain HTTP — so it is present on `localhost` and **absent** when
 * the console is opened by LAN IP. The execCommand path is the fallback that
 * makes the button work either way; selecting the text is the last resort so the
 * GM can always copy by hand.
 */
async function copy(text: string): Promise<'copied' | 'selected'> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      // fall through
    }
  }
  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.style.position = 'fixed';
  scratch.style.opacity = '0';
  document.body.appendChild(scratch);
  scratch.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(scratch);
  return ok ? 'copied' : 'selected';
}

export function ConnectBadge({ urls }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'selected'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  if (urls.length === 0) return null;

  // The confirmation must not live in the tooltip: clicking can move focus or
  // take the pointer off the button, and the tooltip closes with it — leaving a
  // copy that looks like it did nothing. So the heading reports it instead, and
  // the tooltip is only there to make the button discoverable.
  const heading = state === 'copied'
    ? 'copied ✓'
    : state === 'selected'
      ? 'select and press ⌘C'
      : 'players join at';

  return (
    <div className="connect">
      <div className={`lbl${state === 'copied' ? ' ok' : ''}`}>{heading}</div>
      {urls.map((url) => (
        <Tooltip key={url} label="Click to copy" placement="left" stretch>
          <button className="url" onClick={() => { void copy(url).then(setState); }}>
            <code>{url}</code>
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

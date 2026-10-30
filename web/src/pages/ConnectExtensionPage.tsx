import { Check, Copy, PlugZap, Puzzle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { useStore } from '@/store/store';

// The Linkr extension opens this page to connect. Its helper script (injected into this tab only)
// says "ready"; we answer with a new token for this browser. Messages stay on this window and origin.
// Without the extension listening, the token is shown as a code to paste into it instead.

type ExtensionMessage = { source: 'linkr-extension'; type: 'ready' | 'connected' | 'failed'; message?: string };

export function browserName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Brave/.test(ua)
        ? 'Brave'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /CrOS/.test(ua)
        ? 'ChromeOS'
        : /Linux/.test(ua)
          ? 'Linux'
          : '';
  return os ? `${browser} on ${os}` : browser;
}

export function ConnectExtensionPage() {
  const user = useStore((state) => state.user);
  const [extensionReady, setExtensionReady] = useState(false);
  const [state, setState] = useState<'idle' | 'working' | 'connected' | 'code'>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = 'Connect the extension · Linkr';
    const onMessage = (event: MessageEvent<ExtensionMessage>) => {
      if (event.source !== window || event.origin !== location.origin) return;
      if (event.data?.source !== 'linkr-extension') return;
      if (event.data.type === 'ready') setExtensionReady(true);
      if (event.data.type === 'connected') setState('connected');
      if (event.data.type === 'failed') {
        setState('idle');
        setError(event.data.message ?? 'The extension couldn’t connect. Try again.');
      }
    };
    window.addEventListener('message', onMessage);
    // Ask, in case the helper loaded before this page did.
    window.postMessage({ source: 'linkr-page', type: 'hello' }, location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const connect = async () => {
    setError('');
    setState('working');
    try {
      const { token } = await api.post<{ token: string }>('/extension/tokens', { name: browserName() });
      if (extensionReady) {
        window.postMessage({ source: 'linkr-page', type: 'token', token }, location.origin);
      } else {
        setCode(token);
        setState('code');
      }
    } catch (failure) {
      setState('idle');
      setError(failure instanceof ApiError ? failure.message : 'Something went wrong');
    }
  };

  return (
    <div className="bg-background flex min-h-svh items-center justify-center p-4">
      <main className="bg-card grid w-full max-w-md gap-5 rounded-2xl border p-6 shadow-lg sm:p-8">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="size-9" />
          <PlugZap className="text-muted-foreground size-5" />
          <span className="bg-muted flex size-9 items-center justify-center rounded-lg">
            <Puzzle className="size-5" />
          </span>
        </div>

        {state === 'connected' ? (
          <div className="grid gap-2" role="status">
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Check className="size-5 text-green-600" /> Connected
            </h1>
            <p className="text-muted-foreground text-sm">
              The Linkr extension can now save to your spaces from this browser. You can close this tab.
            </p>
          </div>
        ) : state === 'code' ? (
          <div className="grid gap-3">
            <h1 className="text-xl font-semibold">Paste this code into the extension</h1>
            <p className="text-muted-foreground text-sm">
              Open the Linkr extension, choose “Paste a connection code”, and paste it there. It works once; keep it to
              yourself.
            </p>
            <code className="bg-muted rounded-lg p-3 text-xs break-all select-all">{code}</code>
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(code);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy code'}
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <h1 className="text-xl font-semibold">Connect the Linkr extension</h1>
              <p className="text-muted-foreground text-sm">
                Let the extension in this browser save pages, notes and tab groups to your spaces as{' '}
                <span className="text-foreground font-medium">{user?.username}</span>. You can disconnect it any time in
                Settings → Browser.
              </p>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button size="lg" onClick={() => void connect()} disabled={state === 'working'}>
              {extensionReady ? 'Connect this browser' : 'Create a connection code'}
            </Button>
            {!extensionReady && (
              <p className="text-muted-foreground text-xs">
                Opened this page yourself? That’s fine: you’ll get a code to paste into the extension.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { login, register, useStore } from '@/store/store';

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <div className="flex items-center gap-2">
        <img src="/logo.svg" alt="" className="size-8" />
        <span className="text-xl font-semibold tracking-tight">Linkr</span>
      </div>
      <div className="bg-card w-full max-w-sm rounded-2xl border p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <p className="text-muted-foreground text-xs">Organise your ideas.</p>
    </div>
  );
}

function Field(props: {
  id: string;
  label: string;
  type?: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        type={props.type ?? 'text'}
        autoComplete={props.autoComplete}
        autoCapitalize="none"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        required
      />
    </div>
  );
}

function useSubmit(action: () => Promise<void>) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, onSubmit };
}

export function LoginPage() {
  const registrationOpen = useStore((state) => state.appInfo?.registrationOpen !== false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const { error, busy, onSubmit } = useSubmit(() => login(name.trim(), password));

  return (
    <AuthCard title="Welcome back" subtitle="Sign in with your username or email.">
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field id="login" label="Username or email" autoComplete="username" value={name} onChange={setName} />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        {registrationOpen && (
          <p className="text-muted-foreground text-center text-sm">
            New here?{' '}
            <Link to="/register" className="text-foreground font-medium underline underline-offset-4">
              Create an account
            </Link>
          </p>
        )}
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const registrationOpen = useStore((state) => state.appInfo?.registrationOpen !== false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, busy, onSubmit } = useSubmit(() =>
    register({ username: username.trim(), email: email.trim(), password })
  );

  if (!registrationOpen) {
    return (
      <AuthCard title="Registration is closed" subtitle="Ask the owner of this Linkr server for an account.">
        <Link to="/login" className="text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your account" subtitle="One account keeps your spaces in sync on every device.">
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field
          id="username"
          label="Username"
          autoComplete="username"
          value={username}
          onChange={setUsername}
          placeholder="letters, numbers, . and _"
        />
        <Field id="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <Field
          id="new-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          placeholder="at least 8 characters"
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-foreground font-medium underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

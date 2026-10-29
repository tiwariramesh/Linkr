import { LogOut, Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import type { Member, PendingInvite, Role, Space } from '@/lib/types';
import { createSpace, refreshSpaces, updateSpace, useStore } from '@/store/store';
import { openSpaceSettings, useUi } from '@/store/ui';

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Can edit',
  viewer: 'Can view',
};

const failed = (error: unknown) => toast.error(error instanceof ApiError ? error.message : 'Something went wrong');

// A Personal space is private by design; sharing starts with a separate shared space.
function PersonalSpace() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const space = await createSpace(name.trim());
    if (!space) return;
    openSpaceSettings(false);
    navigate(`/s/${space.id}`);
    // Straight on to inviting people.
    requestAnimationFrame(() => openSpaceSettings(true));
  };
  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        Your Personal space is just for you. To work with others, make a shared space and invite them: each person keeps
        their own account, and everyone sees changes live.
      </p>
      <form onSubmit={create} className="flex gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Science department" />
        <Button type="submit" disabled={!name.trim()}>
          Create shared space
        </Button>
      </form>
    </div>
  );
}

function SharedSpace({ space }: { space: Space }) {
  const navigate = useNavigate();
  const me = useStore((state) => state.user);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [login, setLogin] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [name, setName] = useState(space.name);
  const isOwner = space.role === 'owner';

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ members: Member[]; invites: PendingInvite[] }>(`/spaces/${space.id}/members`);
      setMembers(result.members);
      setInvites(result.invites);
    } catch (error) {
      failed(error);
    }
  }, [space.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const pending = await api.post<PendingInvite>(`/spaces/${space.id}/invites`, { login: login.trim(), role });
      toast.success(`Invited ${pending.username}`, { description: 'They’ll see the invitation under the bell.' });
      setLogin('');
      await load();
    } catch (error) {
      failed(error);
    }
  };
  const changeRole = async (member: Member, next: Role) => {
    try {
      const result = await api.patch<{ members: Member[] }>(`/spaces/${space.id}/members/${member.userId}`, {
        role: next,
      });
      setMembers(result.members);
      await refreshSpaces();
    } catch (error) {
      failed(error);
    }
  };
  const remove = async (member: Member) => {
    const leaving = member.userId === me?.id;
    if (
      !confirm(
        leaving
          ? `Leave “${space.name}”? You’ll need a new invitation to come back.`
          : `Remove ${member.username} from “${space.name}”?`
      )
    )
      return;
    try {
      await api.delete(`/spaces/${space.id}/members/${member.userId}`);
      if (leaving) {
        openSpaceSettings(false);
        await refreshSpaces();
        navigate('/');
      } else await load();
    } catch (error) {
      failed(error);
    }
  };

  return (
    <div className="grid gap-5">
      {isOwner && (
        <form
          className="grid gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && name.trim() !== space.name) void updateSpace(space.id, { name: name.trim() });
          }}
        >
          <label htmlFor="space-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="space-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={(event) => event.currentTarget.form?.requestSubmit()}
          />
        </form>
      )}

      {isOwner && (
        <form onSubmit={invite} className="grid gap-1.5">
          <label htmlFor="invite-login" className="text-sm font-medium">
            Invite someone
          </label>
          <div className="flex gap-2">
            <Input
              id="invite-login"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              placeholder="Their Linkr username or email"
              autoComplete="off"
            />
            <Select value={role} onValueChange={(value) => setRole(value as 'editor' | 'viewer')}>
              <SelectTrigger className="w-32" aria-label="Their role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Can edit</SelectItem>
                <SelectItem value="viewer">Can view</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!login.trim()}>
              <UserPlus /> Invite
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">They need an account on this Linkr server first.</p>
        </form>
      )}

      <div className="grid gap-1">
        <p className="text-sm font-medium">People</p>
        <ul className="divide-y rounded-lg border">
          {members.map((member) => {
            const isMe = member.userId === me?.id;
            return (
              <li key={member.userId} className="flex items-center gap-3 px-3 py-2">
                <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase">
                  {member.username[0]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {member.username}
                  {isMe && <span className="text-muted-foreground"> (you)</span>}
                </span>
                {isOwner && !isMe ? (
                  <>
                    <Select value={member.role} onValueChange={(value) => void changeRole(member, value as Role)}>
                      <SelectTrigger size="sm" className="w-28" aria-label={`Role for ${member.username}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ROLE_LABELS) as Role[]).map((value) => (
                          <SelectItem key={value} value={value}>
                            {ROLE_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${member.username}`}
                      onClick={() => void remove(member)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                ) : (
                  <span className="text-muted-foreground text-xs">{ROLE_LABELS[member.role]}</span>
                )}
              </li>
            );
          })}
          {invites.map((pending) => (
            <li key={pending.id} className="flex items-center gap-3 px-3 py-2">
              <span className="text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed text-sm uppercase">
                {pending.username[0]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {pending.username}
                <span className="text-muted-foreground"> · invited, {ROLE_LABELS[pending.role].toLowerCase()}</span>
              </span>
              <Button
                variant="ghost"
                size="xs"
                onClick={async () => {
                  await api.delete(`/spaces/${space.id}/invites/${pending.id}`).catch(failed);
                  await load();
                }}
              >
                Cancel
              </Button>
            </li>
          ))}
        </ul>
      </div>

      {me && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              const self = members.find((member) => member.userId === me.id);
              if (self) void remove(self);
            }}
          >
            <LogOut /> Leave this space
          </Button>
        </div>
      )}
    </div>
  );
}

// Members, invitations and settings for the open space.
export function SpaceSettingsDialog() {
  const open = useUi((state) => state.spaceSettingsOpen);
  const space = useStore((state) => state.spaces.find((s) => s.id === state.spaceId));
  return (
    <Dialog open={open && !!space} onOpenChange={openSpaceSettings}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{space?.kind === 'personal' ? 'Share your work' : `${space?.name} · people`}</DialogTitle>
          <DialogDescription>
            {space?.kind === 'personal'
              ? 'Shared spaces let a team keep links, notes and sessions together.'
              : space?.role === 'owner'
                ? 'Invite people, choose what they can do, and manage the space.'
                : 'Who’s in this space and what they can do.'}
          </DialogDescription>
        </DialogHeader>
        {space && (space.kind === 'personal' ? <PersonalSpace /> : <SharedSpace key={space.id} space={space} />)}
      </DialogContent>
    </Dialog>
  );
}

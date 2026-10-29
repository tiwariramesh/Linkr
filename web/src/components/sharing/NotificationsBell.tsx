import { Bell, Check, FileText, Link2, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { timeAgo } from '@/lib/format';
import type { AppNotification } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  answerInvite,
  dismissNotification,
  loadNotifications,
  markAllRead,
  saveSent,
  unreadCount,
  useNotifications,
} from '@/store/social';
import { setMobileNav } from '@/store/ui';

function Entry({ n, close }: { n: AppNotification; close: () => void }) {
  const navigate = useNavigate();
  const d = n.data;
  const go = (path: string) => {
    close();
    setMobileNav(false);
    navigate(path);
  };

  let icon = <Users className="size-4" />;
  let text = <></>;
  let actions = null;
  if (n.kind === 'invite') {
    icon = <UserPlus className="size-4" />;
    text = (
      <>
        <b>{d.from}</b> invited you to <b>{d.spaceName}</b> as {d.role === 'viewer' ? 'a viewer' : 'an editor'}
      </>
    );
    actions = d.answer ? (
      <span className="text-muted-foreground text-xs">{d.answer === 'accepted' ? 'Accepted' : 'Declined'}</span>
    ) : (
      <>
        <Button
          size="xs"
          onClick={async () => {
            const spaceId = await answerInvite(d.inviteId!, true);
            if (spaceId) go(`/s/${spaceId}`);
          }}
        >
          <Check /> Join
        </Button>
        <Button size="xs" variant="ghost" onClick={() => void answerInvite(d.inviteId!, false)}>
          Decline
        </Button>
      </>
    );
  } else if (n.kind === 'joined') {
    text = (
      <>
        <b>{d.who}</b> joined <b>{d.spaceName}</b>
      </>
    );
    actions = (
      <Button size="xs" variant="ghost" onClick={() => go(`/s/${d.spaceId}`)}>
        Open space
      </Button>
    );
  } else {
    icon = d.kind === 'note' ? <FileText className="size-4" /> : <Link2 className="size-4" />;
    text = (
      <>
        <b>{d.from}</b> sent you {d.kind === 'note' ? 'a note' : 'a link'}: <b>{d.title}</b>
        {d.message && <span className="text-muted-foreground mt-0.5 block italic">“{d.message}”</span>}
      </>
    );
    actions = d.savedItemId ? (
      <Button size="xs" variant="ghost" onClick={() => go(`/s/${d.savedSpaceId}/i/${d.savedItemId}`)}>
        Saved · Open
      </Button>
    ) : (
      <>
        <Button
          size="xs"
          onClick={async () => {
            const item = await saveSent(n.id);
            if (item)
              toast.success('Saved to your Inbox', {
                action: { label: 'Open', onClick: () => go(`/s/${item.spaceId}/i/${item.id}`) },
              });
          }}
        >
          Save to my Inbox
        </Button>
        {d.kind !== 'note' && d.url && (
          <Button size="xs" variant="ghost" asChild>
            <a href={d.url} target="_blank" rel="noopener noreferrer">
              Open link
            </a>
          </Button>
        )}
      </>
    );
  }

  return (
    <li className={cn('group relative flex gap-3 rounded-lg px-3 py-2.5', !n.readAt && 'bg-primary/5')}>
      <span className="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full">
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-snug">
        <p>{text}</p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">{timeAgo(n.createdAt)}</p>
        {actions && <div className="mt-1.5 flex flex-wrap items-center gap-1">{actions}</div>}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => void dismissNotification(n.id)}
        className="text-muted-foreground hover:text-foreground absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

// The bell beside Search: invitations, things sent to you, people joining your spaces. Updates live.
export function NotificationsBell() {
  const list = useNotifications((state) => state.list);
  const [open, setOpen] = useState(false);
  const unread = unreadCount(list);

  useEffect(() => {
    void loadNotifications();
  }, []);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Seen once opened; invitations stay actionable until answered.
        if (!next && unread) void markAllRead();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 relative flex size-8 shrink-0 items-center justify-center rounded-md"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="bg-primary text-primary-foreground absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button size="xs" variant="ghost" onClick={() => void markAllRead()}>
              Mark all read
            </Button>
          )}
        </div>
        {list.length === 0 ? (
          <p className="text-muted-foreground px-4 py-10 text-center text-sm">
            Nothing yet. Invitations and things people send you will show up here.
          </p>
        ) : (
          <ul className="max-h-[60svh] overflow-y-auto p-1">
            {list.map((n) => (
              <Entry key={n.id} n={n} close={() => setOpen(false)} />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

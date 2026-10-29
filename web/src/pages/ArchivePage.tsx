import { Archive, ArchiveRestore, CalendarDays } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { FolderGlyph } from '@/components/folders/FolderGlyph';
import { Button } from '@/components/ui/button';
import { formatSessionDate, timeAgo } from '@/lib/format';
import { itemCounts } from '@/lib/tree';
import { updateFolder, useStore } from '@/store/store';

// Finished courses and past sessions: out of the sidebar, still one click away.
export function ArchivePage() {
  const { spaceId } = useParams();
  const folders = useStore((state) => state.folders);
  const items = useStore((state) => state.items);
  const counts = useMemo(() => itemCounts(items), [items]);
  const archived = useMemo(
    () =>
      Object.values(folders)
        .filter((folder) => folder.archivedAt && !folder.deletedAt)
        .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '')),
    [folders]
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="bg-muted flex size-11 items-center justify-center rounded-xl">
            <Archive className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Archive</h1>
            <p className="text-muted-foreground text-sm">
              Past terms and finished topics, kept intact for when you need them again.
            </p>
          </div>
        </div>
        {archived.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
            Nothing archived yet. Archive a folder from its menu when a term or topic is done.
          </div>
        ) : (
          <div className="flex flex-col divide-y rounded-xl border">
            {archived.map((folder) => (
              <div key={folder.id} className="flex items-center gap-3 px-3 py-2.5">
                <FolderGlyph folder={folder} />
                <Link to={`/s/${spaceId}/f/${folder.id}`} className="min-w-0 flex-1 hover:underline">
                  <p className="truncate text-sm font-medium">{folder.title}</p>
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    {folder.sessionDate && (
                      <>
                        <CalendarDays className="size-3" /> {formatSessionDate(folder.sessionDate)} ·
                      </>
                    )}
                    {folder.term && <>{folder.term} · </>}
                    {counts.get(folder.id) ?? 0} items · archived {timeAgo(folder.archivedAt!)}
                  </p>
                </Link>
                <Button size="sm" variant="ghost" onClick={() => updateFolder(folder.id, { archived: false })}>
                  <ArchiveRestore /> Unarchive
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

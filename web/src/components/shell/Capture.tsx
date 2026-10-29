import { Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { folderStatus } from '@/lib/tree';
import { addFromText, trashItems, useStore } from '@/store/store';
import { uploadFiles } from '@/store/uploads';

const isEditable = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');

const inEditor = (target: EventTarget | null) => target instanceof Element && !!target.closest('.ProseMirror');

// Something from outside the app: files from the desktop, or links and text from another window.
const isOutsideDrag = (event: DragEvent) =>
  [...(event.dataTransfer?.types ?? [])].some((type) => ['Files', 'text/uri-list', 'text/plain'].includes(type));

const dropTargetOf = (target: EventTarget | null) =>
  target instanceof Element ? target.closest<HTMLElement>('[data-drop-folder]') : null;

// Saves what was dropped or pasted into a folder (null = Inbox). Says where it went when that isn't on screen.
function capture(data: DataTransfer, folderId: string | null, onScreen: boolean) {
  const { folders } = useStore.getState();
  const where = folderId ? (folders[folderId]?.title ?? 'folder') : 'Inbox';
  const files = [...data.files];
  if (files.length) {
    const ids = uploadFiles(files, folderId);
    if (ids.length && !onScreen)
      toast.success(`Uploading ${ids.length === 1 ? 'a file' : `${ids.length} files`} to ${where}`);
    return;
  }
  // A dragged link carries text/uri-list (one URL per line, # lines are comments).
  const uris = data
    .getData('text/uri-list')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .join('\n');
  const text = uris || data.getData('text/plain');
  if (!text.trim()) return;
  void addFromText(text, folderId).then((ids) => {
    if (ids.length === 0) return;
    toast.success(onScreen ? `Saved ${ids.length === 1 ? 'it' : `${ids.length} items`}` : `Saved to ${where}`, {
      action: { label: 'Undo', onClick: () => void trashItems(ids) },
    });
  });
}

// Drop files, links or text anywhere in the app, or paste them when no text box has focus.
// They land in the folder on screen, or in whichever sidebar folder or folder tile they're dropped on.
export function Capture() {
  const { folderId } = useParams();
  const here = useStore((state) =>
    folderId && state.folders[folderId] && folderStatus(state.folders, folderId) !== 'trashed' ? folderId : null
  );
  const hereRef = useRef(here);
  const [target, setTarget] = useState<{ folderId: string | null } | null>(null);
  const targetTitle = useStore((state) =>
    target === null ? null : target.folderId ? (state.folders[target.folderId]?.title ?? 'folder') : 'Inbox'
  );

  useEffect(() => {
    hereRef.current = here;
  }, [here]);

  useEffect(() => {
    let depth = 0;
    let internal = false; // a drag that started inside the page (an image or link on a card)
    let highlighted: HTMLElement | null = null;

    const highlight = (element: HTMLElement | null) => {
      if (element === highlighted) return;
      highlighted?.removeAttribute('data-file-over');
      element?.setAttribute('data-file-over', '');
      highlighted = element;
    };
    const folderFor = (event: DragEvent) => {
      const element = dropTargetOf(event.target);
      return element ? element.dataset.dropFolder || null : hereRef.current;
    };
    const reset = () => {
      depth = 0;
      highlight(null);
      setTarget(null);
    };

    const onDragStart = () => {
      internal = true;
    };
    const onDragEnd = () => {
      internal = false;
    };
    const onDragEnter = (event: DragEvent) => {
      if (internal || !isOutsideDrag(event)) return;
      depth++;
    };
    const onDragOver = (event: DragEvent) => {
      if (internal || !isOutsideDrag(event)) return;
      // The notes editor places dropped files where they land.
      if (inEditor(event.target)) {
        highlight(null);
        setTarget(null);
        return;
      }
      // Let text boxes take dropped text as usual.
      if (isEditable(event.target) && !event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      highlight(dropTargetOf(event.target));
      const folderId = folderFor(event);
      setTarget((current) => (current?.folderId === folderId ? current : { folderId }));
    };
    const onDragLeave = (event: DragEvent) => {
      if (internal || !isOutsideDrag(event)) return;
      depth--;
      if (depth <= 0) reset();
    };
    const onDrop = (event: DragEvent) => {
      if (internal || !isOutsideDrag(event) || !event.dataTransfer || inEditor(event.target)) return;
      if (isEditable(event.target) && !event.dataTransfer.types.includes('Files')) return reset();
      event.preventDefault();
      const folderId = folderFor(event);
      reset();
      capture(event.dataTransfer, folderId, folderId === hereRef.current);
    };
    const onPaste = (event: ClipboardEvent) => {
      // Text boxes and open dialogs handle their own pasting.
      if (!event.clipboardData || isEditable(event.target) || document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      capture(event.clipboardData, hereRef.current, true);
    };

    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragend', onDragEnd);
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('dragend', onDragEnd);
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  if (!targetTitle) return null;
  return (
    <div className="border-primary/60 bg-primary/5 pointer-events-none fixed inset-2 z-50 flex items-end justify-center rounded-2xl border-2 border-dashed pb-10">
      <div className="bg-primary text-primary-foreground flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg">
        <Upload className="size-4" /> Drop to save to {targetTitle}
      </div>
    </div>
  );
}

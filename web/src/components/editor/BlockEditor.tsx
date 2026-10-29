import '@blocknote/shadcn/style.css';
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from '@blocknote/core';
import {
  createReactBlockSpec,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { MonitorPlay } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { videoEmbedUrl } from '@/lib/embed';
import { fileUrl } from '@/lib/items';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { uploadFiles, whenUploaded } from '@/store/uploads';

// Notes use BlockNote: a Notion-style block editor on ProseMirror. Type "/" for any kind of block, drag
// blocks by the handle on their left, select text for formatting. Notes are stored as
// { type: 'blocks', blocks } and saved as you type.

export type EditorSave = { body: string; text: string };

const SAVE_DELAY_MS = 700;

// A YouTube or Vimeo video playing inside the note. Pasting a video link makes one; so does "/video".
const VideoEmbed = createReactBlockSpec(
  { type: 'embed', propSchema: { url: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => {
      const src = videoEmbedUrl(block.props.url);
      if (src) {
        return (
          <div className="my-1 aspect-video w-full overflow-hidden rounded-lg bg-black" contentEditable={false}>
            <iframe
              src={src}
              title="Video"
              className="size-full border-0"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              // YouTube refuses to play without knowing which site embeds it; Linkr's default policy sends nothing.
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        );
      }
      const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const url = new FormData(event.currentTarget).get('url')?.toString().trim() ?? '';
        if (url) editor.updateBlock(block, { props: { url } });
      };
      return (
        <form onSubmit={submit} contentEditable={false} className="bg-muted flex w-full gap-2 rounded-lg p-2">
          <input
            name="url"
            autoFocus
            defaultValue={block.props.url}
            placeholder="Paste a YouTube or Vimeo link and press Enter"
            className="bg-background min-w-0 flex-1 rounded-md border px-2 py-1 text-sm outline-none"
          />
        </form>
      );
    },
    // Videos embedded in notes written with the earlier editor.
    parse: (element) => {
      if (!element.matches('div[data-youtube-video]')) return undefined;
      const src = element.querySelector('iframe')?.getAttribute('src');
      return src ? { url: src } : undefined;
    },
    toExternalHTML: ({ block }) => <a href={block.props.url}>{block.props.url}</a>,
  }
);

const schema = BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, embed: VideoEmbed() } });
type Editor = typeof schema.BlockNoteEditor;
type Block = typeof schema.Block;
type PartialBlock = typeof schema.PartialBlock;

type Stored = { type: 'blocks'; blocks: PartialBlock[] } | { type: 'doc' };

function parseBody(body: string | null): Stored | null {
  try {
    return body ? (JSON.parse(body) as Stored) : null;
  } catch {
    return null;
  }
}

// What a new editor starts with. Plain-text notes become one paragraph per line; earlier-editor
// documents start empty and are converted just after (see useLegacyConversion).
function initialBlocks(stored: Stored | null, fallbackText: string): PartialBlock[] | undefined {
  if (stored?.type === 'blocks' && stored.blocks.length) return stored.blocks;
  if (stored || !fallbackText.trim()) return undefined;
  return fallbackText.split('\n').map((line) => ({ type: 'paragraph', content: line }));
}

function useLegacyConversion(editor: Editor, stored: Stored | null, applying: { current: boolean }) {
  useEffect(() => {
    if (stored?.type !== 'doc') return;
    let cancelled = false;
    void import('./legacy').then(({ legacyHtml }) => {
      if (cancelled) return;
      const blocks = editor.tryParseHTMLToBlocks(legacyHtml(stored as never));
      applying.current = true;
      editor.replaceBlocks(editor.document, blocks.length ? blocks : [{ type: 'paragraph' }]);
      applying.current = false;
    });
    return () => {
      cancelled = true;
    };
  }, [editor, stored, applying]);
}

// Plain text for cards, previews and search: one line per block.
type Inline = { type: string; text?: string; content?: Inline[] };
const inlineText = (content: unknown): string => {
  if (Array.isArray(content)) {
    return (content as Inline[]).map((part) => part.text ?? inlineText(part.content)).join('');
  }
  if (content && typeof content === 'object' && 'rows' in content) {
    const rows = (content as { rows: { cells: unknown[] }[] }).rows;
    return rows
      .map((row) => row.cells.map((cell) => inlineText((cell as { content?: unknown }).content ?? cell)).join(' | '))
      .join('\n');
  }
  return '';
};
function blocksToText(blocks: Block[]): string {
  const lines: string[] = [];
  const walk = (block: Block) => {
    const text = block.type === 'embed' ? block.props.url : inlineText(block.content);
    if (text.trim()) lines.push(text);
    block.children.forEach(walk);
  };
  blocks.forEach(walk);
  return lines.join('\n').trim();
}

// Files added to a note (pasted, dropped or from the "/" menu) become items in the folder, like
// anything else saved there; the note shows them from their saved copy.
async function uploadFor(file: File, folderId: string | null) {
  const [id] = uploadFiles([file], folderId);
  const item = id ? await whenUploaded(id) : undefined;
  if (!item?.file) throw new Error('Upload failed');
  return fileUrl(item.file);
}

// `folderId` undefined turns uploads off (private drafts: uploads become folder items everyone can see).
function useNoteEditor(
  body: string | null,
  fallbackText: string,
  placeholder: string,
  folderId: string | null | undefined
) {
  const folderRef = useRef(folderId);
  useEffect(() => {
    folderRef.current = folderId ?? null;
  });
  const [stored] = useState(() => parseBody(body));
  const editor = useCreateBlockNote(
    {
      schema,
      initialContent: initialBlocks(stored, fallbackText),
      placeholders: { emptyDocument: placeholder, default: "Type '/' for commands" },
      uploadFile: folderId === undefined ? undefined : (file) => uploadFor(file, folderRef.current ?? null),
      // A pasted YouTube or Vimeo link becomes a player.
      pasteHandler: ({ event, editor: target, defaultPasteHandler }) => {
        const text = event.clipboardData?.getData('text/plain').trim() ?? '';
        if (text && !/\s/.test(text) && videoEmbedUrl(text)) {
          const at = target.getTextCursorPosition().block;
          target.insertBlocks([{ type: 'embed', props: { url: text } }], at, 'after');
          return true;
        }
        return defaultPasteHandler();
      },
    },
    []
  );
  return { editor, stored };
}

// The standard "/" menu plus a YouTube/Vimeo block, placed with the other media so its group stays together.
function slashItems(editor: Editor) {
  const items = getDefaultReactSlashMenuItems(editor);
  const video = {
    title: 'YouTube or Vimeo',
    subtext: 'Play a video inside the note',
    aliases: ['youtube', 'vimeo', 'video', 'embed'],
    group: 'Media',
    icon: <MonitorPlay size={18} />,
    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'embed' }),
  };
  const lastMedia = items.findLastIndex((item) => item.group === 'Media');
  return lastMedia < 0 ? [...items, video] : [...items.slice(0, lastMedia + 1), video, ...items.slice(lastMedia + 1)];
}

// Notes that save themselves. Edits from other devices replace the text only while there are no
// unsaved changes here.
export function BlockEditor({
  body,
  fallbackText = '',
  placeholder,
  folderId,
  onSave,
  className,
  editable = true,
}: {
  body: string | null;
  fallbackText?: string;
  placeholder: string;
  // Where pasted and dropped files are uploaded (null = Inbox; undefined = no uploads).
  folderId: string | null | undefined;
  onSave: (save: EditorSave) => void;
  className?: string;
  // Viewers of a shared space read notes without changing them.
  editable?: boolean;
}) {
  const theme = useTheme((state) => state.resolved);
  const { editor, stored } = useNoteEditor(body, fallbackText, placeholder, folderId);
  const savedBody = useRef(body);
  const dirty = useRef(false);
  const applying = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const onSaveRef = useRef(onSave);
  const [status, setStatus] = useState<'idle' | 'editing' | 'saved'>('idle');
  useEffect(() => {
    onSaveRef.current = onSave;
  });
  useLegacyConversion(editor, stored, applying);

  const flush = () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const json = JSON.stringify({ type: 'blocks', blocks: editor.document });
    if (json === savedBody.current) return;
    savedBody.current = json;
    onSaveRef.current({ body: json, text: blocksToText(editor.document) });
    setStatus('saved');
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  // Save anything pending when the editor goes away (closing the panel, moving to the next item).
  useEffect(() => () => flushRef.current(), []);

  // Changed elsewhere (another device or tab).
  useEffect(() => {
    if (body === savedBody.current || dirty.current) return;
    savedBody.current = body;
    const next = parseBody(body);
    if (next?.type !== 'blocks') return;
    applying.current = true;
    editor.replaceBlocks(editor.document, next.blocks.length ? next.blocks : [{ type: 'paragraph' }]);
    applying.current = false;
  }, [editor, body]);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto py-3" onBlur={() => flushRef.current()}>
        <BlockNoteView
          editor={editor}
          theme={theme}
          slashMenu={false}
          editable={editable}
          onChange={() => {
            if (applying.current) return;
            dirty.current = true;
            setStatus('editing');
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
          }}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) => filterSuggestionItems(slashItems(editor), query)}
          />
        </BlockNoteView>
      </div>
      <p className="text-muted-foreground border-t px-4 py-1 text-[11px]" aria-live="polite">
        {!editable
          ? 'View only'
          : status === 'editing'
            ? 'Editing…'
            : status === 'saved'
              ? 'Saved'
              : "Changes save automatically · type '/' for headings, lists, images, videos and more"}
      </p>
    </div>
  );
}

// Notes shown but not edited (presenter mode).
export function BlockView({
  body,
  fallbackText = '',
  className,
}: {
  body: string | null;
  fallbackText?: string;
  className?: string;
}) {
  const theme = useTheme((state) => state.resolved);
  const { editor, stored } = useNoteEditor(body, fallbackText, '', null);
  const applying = useRef(false);
  useLegacyConversion(editor, stored, applying);
  return (
    <BlockNoteView
      editor={editor}
      theme={theme}
      editable={false}
      sideMenu={false}
      formattingToolbar={false}
      slashMenu={false}
      linkToolbar={false}
      className={className}
    />
  );
}

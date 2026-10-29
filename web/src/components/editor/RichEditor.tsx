import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Youtube } from '@tiptap/extension-youtube';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import {
  Bold,
  Code2,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Paperclip,
  Quote,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fileUrl } from '@/lib/items';
import { cn } from '@/lib/utils';
import { uploadFiles, whenUploaded } from '@/store/uploads';

export type EditorSave = { body: string; text: string };

const SAVE_DELAY_MS = 700;

// Notes written before the rich editor existed are plain text: one paragraph per line.
const textToDoc = (text: string): JSONContent => ({
  type: 'doc',
  content: text
    .split('\n')
    .map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })),
});

const toContent = (body: string | null, fallbackText: string): JSONContent => {
  try {
    return body ? JSON.parse(body) : textToDoc(fallbackText);
  } catch {
    return textToDoc(fallbackText);
  }
};

// Files pasted or dropped into a note are uploaded as items in the folder, then shown in the note:
// images inline, anything else as a link.
function insertFiles(editor: Editor, files: File[], folderId: string | null, at?: number) {
  for (const id of uploadFiles(files, folderId)) {
    void whenUploaded(id).then((item) => {
      if (!item?.file || editor.isDestroyed) return;
      const src = fileUrl(item.file);
      const node: JSONContent = item.file.mime.startsWith('image/')
        ? { type: 'image', attrs: { src, alt: item.file.name } }
        : {
            type: 'paragraph',
            content: [{ type: 'text', text: item.file.name, marks: [{ type: 'link', attrs: { href: src } }] }],
          };
      if (at === undefined) editor.chain().focus().insertContent(node).run();
      else editor.chain().insertContentAt(Math.min(at, editor.state.doc.content.size), node).run();
    });
  }
}

function ToolButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()} // keep the selection in the editor
      onClick={onClick}
      className={cn(
        'text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-md',
        active && 'bg-muted text-foreground'
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState('');
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const value = href.trim();
    const url = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    if (value) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setOpen(false);
  };
  if (active) {
    return (
      <ToolButton
        icon={Link2}
        label="Remove link"
        active
        onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
      />
    );
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setHref('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Add link"
          aria-label="Add link"
          onMouseDown={(event) => event.preventDefault()}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-md"
        >
          <Link2 className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <form onSubmit={apply} className="flex gap-2">
          <Input autoFocus value={href} onChange={(event) => setHref(event.target.value)} placeholder="Paste a link" />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function Toolbar({ editor, folderId }: { editor: Editor; folderId: string | null }) {
  const is = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      highlight: e.isActive('highlight'),
      bullets: e.isActive('bulletList'),
      numbers: e.isActive('orderedList'),
      tasks: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('codeBlock'),
      link: e.isActive('link'),
    }),
  });
  const chain = () => editor.chain().focus();
  const attach = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => input.files?.length && insertFiles(editor, [...input.files], folderId);
    input.click();
  };
  return (
    <div
      className="flex items-center gap-0.5 overflow-x-auto border-b px-2 py-1"
      role="toolbar"
      aria-label="Formatting"
    >
      <ToolButton
        icon={Heading2}
        label="Heading"
        active={is.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <ToolButton
        icon={Heading3}
        label="Subheading"
        active={is.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <ToolButton icon={Bold} label="Bold" active={is.bold} onClick={() => chain().toggleBold().run()} />
      <ToolButton icon={Italic} label="Italic" active={is.italic} onClick={() => chain().toggleItalic().run()} />
      <ToolButton
        icon={Highlighter}
        label="Highlight"
        active={is.highlight}
        onClick={() => chain().toggleHighlight().run()}
      />
      <span className="bg-border mx-1 h-4 w-px shrink-0" />
      <ToolButton
        icon={List}
        label="Bulleted list"
        active={is.bullets}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolButton
        icon={ListOrdered}
        label="Numbered list"
        active={is.numbers}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolButton
        icon={ListChecks}
        label="Checklist"
        active={is.tasks}
        onClick={() => chain().toggleTaskList().run()}
      />
      <ToolButton icon={Quote} label="Quote" active={is.quote} onClick={() => chain().toggleBlockquote().run()} />
      <ToolButton icon={Code2} label="Code" active={is.code} onClick={() => chain().toggleCodeBlock().run()} />
      <span className="bg-border mx-1 h-4 w-px shrink-0" />
      <LinkButton editor={editor} active={is.link} />
      <ToolButton icon={Paperclip} label="Add image or file" onClick={attach} />
    </div>
  );
}

// What notes can contain. Shared by the editor and the read-only view so both understand the same documents.
const noteExtensions = (placeholder = '') => [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
  }),
  Placeholder.configure({ placeholder }),
  Highlight,
  TaskList,
  TaskItem.configure({ nested: true }),
  Image,
  Youtube.configure({
    nocookie: true,
    modestBranding: true,
    rel: 0,
    // YouTube refuses to play without knowing which site embeds it; the app's default policy sends nothing.
    HTMLAttributes: { referrerpolicy: 'strict-origin-when-cross-origin' },
  }),
];

// Notes shown but not edited (presenter mode). Links open normally here.
export function RichView({
  body,
  fallbackText = '',
  className,
}: {
  body: string | null;
  fallbackText?: string;
  className?: string;
}) {
  const editor = useEditor(
    {
      editable: false,
      extensions: noteExtensions(),
      content: toContent(body, fallbackText),
      editorProps: {
        attributes: { class: cn('tiptap prose dark:prose-invert max-w-none focus:outline-none', className) },
        handleClick: (_view, _pos, event) => {
          const link = (event.target as HTMLElement).closest('a');
          if (!link?.href) return false;
          window.open(link.href, '_blank', 'noopener,noreferrer');
          return true;
        },
      },
    },
    [body, fallbackText]
  );
  return <EditorContent editor={editor} />;
}

// Notes that save themselves. Markdown shortcuts work (# heading, - list, [ ] checklist, > quote),
// pasted YouTube links become players, and pasted or dropped images are uploaded and shown inline.
// Edits from other devices replace the text only while there are no unsaved changes here.
export function RichEditor({
  body,
  fallbackText = '',
  placeholder,
  folderId,
  onSave,
  className,
}: {
  body: string | null;
  fallbackText?: string;
  placeholder: string;
  // Where pasted and dropped files are uploaded (null = Inbox).
  folderId: string | null;
  onSave: (save: EditorSave) => void;
  className?: string;
}) {
  const savedBody = useRef(body);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const onSaveRef = useRef(onSave);
  const folderRef = useRef(folderId);
  const editorRef = useRef<Editor | null>(null);
  const [status, setStatus] = useState<'idle' | 'editing' | 'saved'>('idle');

  useEffect(() => {
    onSaveRef.current = onSave;
    folderRef.current = folderId;
  });

  const flush = (editor: Editor) => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const json = JSON.stringify(editor.getJSON());
    if (json === savedBody.current) return;
    savedBody.current = json;
    // Plain text for cards and search: one line per block, without the blank lines nested lists add.
    const text = editor
      .getText({ blockSeparator: '\n' })
      .replace(/\n{2,}/g, '\n')
      .trim();
    onSaveRef.current({ body: json, text });
    setStatus('saved');
  };

  const editor = useEditor({
    extensions: noteExtensions(placeholder),
    content: toContent(body, fallbackText),
    editorProps: {
      attributes: {
        class: 'tiptap prose prose-sm dark:prose-invert max-w-none min-h-40 px-4 py-3 focus:outline-none',
      },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.length || !editorRef.current) return false;
        insertFiles(editorRef.current, files, folderRef.current);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (moved || !files.length || !editorRef.current) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertFiles(editorRef.current, files, folderRef.current, at);
        return true;
      },
      // Links open with Ctrl/Cmd-click, so a plain click can place the cursor in them.
      handleClick: (_view, _pos, event) => {
        const link = (event.target as HTMLElement).closest('a');
        if (!link?.href || !(event.ctrlKey || event.metaKey)) return false;
        window.open(link.href, '_blank', 'noopener,noreferrer');
        return true;
      },
    },
    onCreate: ({ editor: created }) => {
      editorRef.current = created;
    },
    onUpdate: ({ editor: updated }) => {
      dirty.current = true;
      setStatus('editing');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => flush(updated), SAVE_DELAY_MS);
    },
    onBlur: ({ editor: blurred }) => flush(blurred),
  });

  // Save anything pending when the editor goes away (closing the panel, moving to the next item).
  useEffect(
    () => () => {
      if (editor && !editor.isDestroyed) flush(editor);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor]
  );

  // Changed elsewhere (another device or tab).
  useEffect(() => {
    if (!editor || body === savedBody.current || dirty.current) return;
    savedBody.current = body;
    editor.commands.setContent(toContent(body, fallbackText), { emitUpdate: false });
  }, [editor, body, fallbackText]);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {editor && <Toolbar editor={editor} folderId={folderId} />}
      <div className="min-h-0 flex-1 overflow-y-auto" onClick={() => editor?.commands.focus()}>
        <EditorContent editor={editor} onClick={(event) => event.stopPropagation()} />
      </div>
      <p className="text-muted-foreground border-t px-4 py-1 text-[11px]" aria-live="polite">
        {status === 'editing' ? 'Editing…' : status === 'saved' ? 'Saved' : 'Changes save automatically'}
      </p>
    </div>
  );
}

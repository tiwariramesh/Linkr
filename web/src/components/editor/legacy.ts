import { generateHTML, type JSONContent } from '@tiptap/core';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Youtube } from '@tiptap/extension-youtube';
import { StarterKit } from '@tiptap/starter-kit';

// Notes written before the block editor were Tiptap documents ({ type: 'doc' }). They are turned into
// HTML with the extensions they were written with, then read into blocks. Loaded only when such a
// note is opened; once edited, the note is saved in the new format.
const extensions = [
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  Highlight,
  TaskList,
  TaskItem.configure({ nested: true }),
  Image,
  Youtube,
];

export const legacyHtml = (doc: JSONContent) => generateHTML(doc, extensions);

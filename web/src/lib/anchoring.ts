// Finds highlights in rendered article text, and describes new selections so they can be found again.
//
// A passage is stored by its text, not by DOM position: the quote itself, up to CONTEXT characters
// either side (prefix and suffix), and its character offset in the whole text (start). Re-rendering
// the article, a re-fetched copy or a different screen width doesn't break it; if the words are gone,
// the highlight is reported as not found instead of marking the wrong text.

const CONTEXT = 32;

export type TextQuote = { quote: string; prefix: string; suffix: string; start: number };

type TextIndex = { text: string; nodes: { node: Text; start: number }[] };

// All the text under `root`, joined, with where each text node starts. Same string as Range.toString().
function indexText(root: Node): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: TextIndex['nodes'] = [];
  let text = '';
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    nodes.push({ node, start: text.length });
    text += node.data;
  }
  return { text, nodes };
}

// Character offset of a point (container, offset) from the start of `root`.
function offsetOf(root: Node, container: Node, offset: number) {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(container, offset);
  return range.toString().length;
}

export function describeSelection(root: HTMLElement, range: Range): TextQuote | null {
  if (!root.contains(range.commonAncestorContainer)) return null;
  const { text } = indexText(root);
  let start = offsetOf(root, range.startContainer, range.startOffset);
  let end = offsetOf(root, range.endContainer, range.endOffset);
  // Leave out spaces caught at either end of the selection.
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (end <= start) return null;
  return {
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
    start,
  };
}

// Where the passage is now: the exact quote with its context if possible, otherwise the copy of the
// quote nearest its old position, preferring one whose context still matches.
function locate(text: string, target: TextQuote): { start: number; end: number } | null {
  const exact = text.indexOf(target.prefix + target.quote + target.suffix);
  if (exact >= 0) {
    const start = exact + target.prefix.length;
    return { start, end: start + target.quote.length };
  }
  let best: { start: number; score: number } | null = null;
  for (let at = text.indexOf(target.quote); at >= 0; at = text.indexOf(target.quote, at + 1)) {
    const contextMatches =
      (target.prefix && text.slice(Math.max(0, at - target.prefix.length), at).endsWith(target.prefix.slice(-8))) ||
      (target.suffix && text.startsWith(target.suffix.slice(0, 8), at + target.quote.length));
    const score = Math.abs(at - target.start) - (contextMatches ? 1_000_000 : 0);
    if (!best || score < best.score) best = { start: at, score };
  }
  return best ? { start: best.start, end: best.start + target.quote.length } : null;
}

// Wraps the passage in <mark> elements, one per text node it spans. Returns false if it isn't there.
export function markPassage(root: HTMLElement, target: TextQuote, attributes: Record<string, string>): boolean {
  const index = indexText(root);
  const found = locate(index.text, target);
  if (!found) return false;
  for (const { node, start } of index.nodes) {
    const end = start + node.length;
    if (end <= found.start || start >= found.end) continue;
    if (!node.data.trim()) continue; // whitespace between blocks
    let piece = node;
    const from = Math.max(found.start - start, 0);
    const to = Math.min(found.end - start, node.length);
    if (to < piece.length) piece.splitText(to);
    if (from > 0) piece = piece.splitText(from);
    const mark = document.createElement('mark');
    for (const [name, value] of Object.entries(attributes)) mark.setAttribute(name, value);
    piece.parentNode?.insertBefore(mark, piece);
    mark.appendChild(piece);
  }
  return true;
}

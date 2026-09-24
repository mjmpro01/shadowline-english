/**
 * The small part of Markdown the tutor is told to use: paragraphs, lists,
 * **bold**, *italic* and `code`.
 *
 * Parsed into data rather than turned into HTML, so nothing the model writes is
 * ever handed to the DOM as markup. A model's output is text somebody else
 * wrote; rendering it with innerHTML would make it a way to run script in a
 * learner's session. This way the worst a strange answer can do is look odd.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }

export type Block =
  | { kind: 'paragraph'; lines: Inline[][] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = []
  let paragraph: Inline[][] = []
  let list: { ordered: boolean; items: Inline[][] } | null = null

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', lines: paragraph })
    if (list) blocks.push({ kind: 'list', ...list })
    paragraph = []
    list = null
  }

  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    // Headings are asked not to appear; if one does, it is read as a bold line
    // rather than dropped.
    const line = raw.replace(/^#{1,6}\s+(.*)$/, '**$1**')
    if (line.trim() === '') {
      flush()
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    const item = bullet ?? numbered
    if (item) {
      const ordered = numbered !== null
      if (paragraph.length) {
        blocks.push({ kind: 'paragraph', lines: paragraph })
        paragraph = []
      }
      if (!list || list.ordered !== ordered) {
        if (list) blocks.push({ kind: 'list', ...list })
        list = { ordered, items: [] }
      }
      list.items.push(parseInline(item[1]))
      continue
    }
    if (list) {
      blocks.push({ kind: 'list', ...list })
      list = null
    }
    paragraph.push(parseInline(line))
  }
  flush()
  return blocks
}

/** `code` first, so an asterisk inside it stays an asterisk; then **bold**,
 *  then *italic* or _italic_. Anything unmatched is text as written. */
const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_/g

export function parseInline(line: string): Inline[] {
  const out: Inline[] = []
  let at = 0
  for (const match of line.matchAll(INLINE)) {
    const start = match.index ?? 0
    if (start > at) out.push({ kind: 'text', text: line.slice(at, start) })
    if (match[1] !== undefined) out.push({ kind: 'code', text: match[1] })
    else if (match[2] !== undefined) out.push({ kind: 'bold', text: match[2] })
    else out.push({ kind: 'italic', text: match[3] ?? match[4] ?? '' })
    at = start + match[0].length
  }
  if (at < line.length) out.push({ kind: 'text', text: line.slice(at) })
  return out
}

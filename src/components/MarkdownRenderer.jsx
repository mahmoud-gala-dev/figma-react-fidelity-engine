import React, { useState } from 'react';

function renderInlineMarkdown(text, keyPrefix = 'in') {
  if (!text) return null;
  const tokens = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match;
  let idx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const raw = match[0];
    if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push(
        <strong key={`${keyPrefix}-b-${idx++}`} className="md-strong">
          {raw.slice(2, -2)}
        </strong>
      );
    } else if (raw.startsWith('`') && raw.endsWith('`')) {
      tokens.push(
        <code key={`${keyPrefix}-c-${idx++}`} className="md-inline-code" dir="ltr">
          {raw.slice(1, -1)}
        </code>
      );
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      tokens.push(
        <em key={`${keyPrefix}-i-${idx++}`} className="md-em">
          {raw.slice(1, -1)}
        </em>
      );
    } else if (raw.startsWith('[')) {
      const m = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) {
        tokens.push(
          <a
            key={`${keyPrefix}-a-${idx++}`}
            href={m[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="md-link"
          >
            {m[1]}
          </a>
        );
      } else {
        tokens.push(raw);
      }
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens;
}

function splitTableCells(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map(cell => cell.trim());
}

function isTableSeparator(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = splitTableCells(trimmed);
  return cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c));
}

export function MarkdownRenderer({ content = '', testId = 'markdown-rendered-content' }) {
  const [copiedBlockIdx, setCopiedBlockIdx] = useState(null);

  if (!content || typeof content !== 'string') {
    return null;
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const elements = [];
  let i = 0;
  let blockId = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block ```lang
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim() || 'code';
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      const codeText = codeLines.join('\n');
      const currentBlockIdx = blockId++;
      elements.push(
        <div key={`code-${currentBlockIdx}`} className="md-code-block" dir="ltr">
          <div className="md-code-header">
            <span className="md-code-lang">{lang.toUpperCase()}</span>
            <button
              type="button"
              className="md-copy-btn"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(codeText).catch(() => {});
                }
                setCopiedBlockIdx(currentBlockIdx);
                setTimeout(() => setCopiedBlockIdx(null), 1500);
              }}
            >
              {copiedBlockIdx === currentBlockIdx ? '✓ تم النسخ' : 'نسخ الكود'}
            </button>
          </div>
          <pre data-testid={lang === 'css' ? 'gemini-css-patch' : undefined}>
            <code>{codeText}</code>
          </pre>
        </div>
      );
      continue;
    }

    // GFM Table
    if (
      trimmed.startsWith('|') &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = splitTableCells(trimmed);
      i += 2; // skip header and separator
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitTableCells(lines[i]));
        i++;
      }
      const currentTableIdx = blockId++;
      elements.push(
        <div key={`tbl-${currentTableIdx}`} className="md-table-wrapper">
          <table className="md-table" data-testid={`markdown-table-${currentTableIdx}`}>
            <thead>
              <tr>
                {headers.map((h, hIdx) => (
                  <th key={`th-${hIdx}`}>{renderInlineMarkdown(h, `th-${currentTableIdx}-${hIdx}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rIdx) => (
                <tr key={`tr-${rIdx}`}>
                  {headers.map((_, cIdx) => (
                    <td key={`td-${cIdx}`}>
                      {renderInlineMarkdown(r[cIdx] ?? '', `td-${currentTableIdx}-${rIdx}-${cIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const textContent = headingMatch[2];
      const Tag = `h${Math.min(level + 1, 5)}`;
      elements.push(
        <Tag key={`h-${blockId++}`} className={`md-heading md-h${level}`}>
          {renderInlineMarkdown(textContent, `h-${blockId}`)}
        </Tag>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      elements.push(<hr key={`hr-${blockId++}`} className="md-hr" />);
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote key={`bq-${blockId++}`} className="md-blockquote">
          {renderInlineMarkdown(quoteLines.join(' '), `bq-${blockId}`)}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      const listIdx = blockId++;
      elements.push(
        <ul key={`ul-${listIdx}`} className="md-list md-ul">
          {items.map((item, idx) => (
            <li key={`uli-${idx}`}>{renderInlineMarkdown(item, `uli-${listIdx}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      const listIdx = blockId++;
      elements.push(
        <ol key={`ol-${listIdx}`} className="md-list md-ol">
          {items.map((item, idx) => (
            <li key={`oli-${idx}`}>{renderInlineMarkdown(item, `oli-${listIdx}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    elements.push(
      <p key={`p-${blockId++}`} className="md-paragraph">
        {renderInlineMarkdown(paraLines.join(' '), `p-${blockId}`)}
      </p>
    );
  }

  return (
    <div className="markdown-body" data-testid={testId}>
      {elements}
    </div>
  );
}

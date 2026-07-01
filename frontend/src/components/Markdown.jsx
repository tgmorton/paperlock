// Minimal, dependency-free markdown renderer for instructor-authored section
// intros: headings, bold/italic/code, bullet lists, blockquotes, paragraphs.
function renderInline(text, keyBase) {
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**"))
      parts.push(<strong key={`${keyBase}-${k++}`}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`"))
      parts.push(<code key={`${keyBase}-${k++}`}>{tok.slice(1, -1)}</code>);
    else parts.push(<em key={`${keyBase}-${k++}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ text, className }) {
  if (!text) return null;
  const lines = String(text).split("\n");
  const blocks = [];
  let list = null;
  const flushList = () => {
    if (list) {
      blocks.push(<ul key={`ul-${blocks.length}`}>{list}</ul>);
      list = null;
    }
  };
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) {
      flushList();
      return;
    }
    if (t.startsWith("### ")) {
      flushList();
      blocks.push(<h5 key={i}>{renderInline(t.slice(4), i)}</h5>);
    } else if (t.startsWith("## ")) {
      flushList();
      blocks.push(<h4 key={i}>{renderInline(t.slice(3), i)}</h4>);
    } else if (t.startsWith("# ")) {
      flushList();
      blocks.push(<h3 key={i}>{renderInline(t.slice(2), i)}</h3>);
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      if (!list) list = [];
      list.push(<li key={i}>{renderInline(t.slice(2), i)}</li>);
    } else if (t.startsWith("> ")) {
      flushList();
      blocks.push(<blockquote key={i}>{renderInline(t.slice(2), i)}</blockquote>);
    } else {
      flushList();
      blocks.push(<p key={i}>{renderInline(t, i)}</p>);
    }
  });
  flushList();
  return <div className={`md ${className || ""}`}>{blocks}</div>;
}

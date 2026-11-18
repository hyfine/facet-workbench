// A small JSON reader that never routes numbers through IEEE-754.
(() => {
  "use strict";
  const MAX_INPUT = 1024 * 1024;
  const MAX_VALUES = 8000, MAX_DEPTH = 96;
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const bareKey = /[A-Za-z_$][\w$-]*/y;
  function parse(source, repair = false, maxValues = MAX_VALUES, startDepth = 0) {
    if (source.length > MAX_INPUT) throw new RangeError("Input exceeds the 1 Mi-character limit.");
    let i = 0, count = 0;
    const fixes = new Map();
    const fixed = label => fixes.set(label, (fixes.get(label) || 0) + 1);
    function fail(message, ErrorType = SyntaxError) {
      const before = source.slice(0, i).split(/\r\n|\r|\n/);
      throw new ErrorType(`${message} (line ${before.length}, column ${before.at(-1).length + 1}).`);
    }
    function space() {
      while (i < source.length) {
        if (/[ \n\r\t]/.test(source[i])) { i++; continue; }
        if (!repair || source[i] !== "/") break;
        if (source[i + 1] === "/") {
          i += 2;
          while (i < source.length && !/[\n\r]/.test(source[i])) i++;
        } else if (source[i + 1] === "*") {
          const end = source.indexOf("*/", i + 2);
          if (end < 0) fail("Unclosed block comment");
          i = end + 2;
        } else break;
        fixed("removed comment");
      }
    }
    function string() {
      const start = i, quote = source[i++];
      let out = '"';
      while (i < source.length) {
        const c = source[i++];
        if (c === quote) {
          if (quote === "'") fixed("converted single quotes");
          try { return JSON.parse(quote === '"' ? source.slice(start, i) : out + '"'); }
          catch { fail("Invalid string or escape"); }
        }
        if (c === "\\") {
          const next = source[i++];
          if (quote === "'") out += next === "'" ? "'" : "\\" + next;
        } else if (quote === "'") out += c === '"' ? '\\"' : c;
      }
      fail("Unclosed string");
    }
    function value(depth) {
      space();
      if (++count > maxValues || depth > MAX_DEPTH) fail("Document exceeds 8,000 values or 96 nesting levels", RangeError);
      const c = source[i];
      if (c === "{" || c === "[") {
        const object = c === "{", end = object ? "}" : "]";
        const children = [], keys = new Set();
        i++; space();
        while (source[i] !== end) {
          let key = String(children.length);
          if (object) {
            if (source[i] === '"' || (repair && source[i] === "'")) key = string();
            else if (repair) {
              bareKey.lastIndex = i;
              const m = bareKey.exec(source);
              if (!m) fail("Expected a quoted object key");
              key = m[0]; i = bareKey.lastIndex; fixed("quoted bare key");
            } else fail("Expected a quoted object key");
            if (keys.has(key)) fail("Duplicate object key");
            keys.add(key); space();
            if (source[i] !== ":") fail("Expected ':' after key");
            i++;
          }
          children.push({ key, node: value(depth + 1) });
          space();
          if (source[i] === end) break;
          if (source[i] !== ",") fail(`Expected ',' or '${end}'`);
          i++; space();
          if (source[i] === end) {
            if (!repair) fail("Trailing comma");
            fixed("removed trailing comma");
          }
        }
        i++;
        return { type: object ? "object" : "array", children };
      }
      if (c === '"' || (repair && c === "'")) return { type: "string", value: string() };
      for (const token of ["true", "false", "null"]) {
        if (source.startsWith(token, i)) {
          i += token.length;
          return { type: token === "null" ? "null" : "boolean", value: token };
        }
      }
      number.lastIndex = i;
      const n = number.exec(source);
      if (!n) fail("Expected a JSON value");
      i = number.lastIndex;
      return { type: "number", value: n[0] };
    }
    if (repair && source.charCodeAt(0) === 0xfeff) { i++; fixed("removed BOM"); }
    const root = value(startDepth);
    space();
    if (i !== source.length) fail("Unexpected content after value");
    return { root, fixes, count };
  }
  function literal(node) {
    return node.type === "string" ? JSON.stringify(node.value) : node.value;
  }
  function format(node, indent = 2, depth = 0) {
    if (!node.children) return literal(node);
    const obj = node.type === "object", a = obj ? "{" : "[", b = obj ? "}" : "]";
    if (!node.children.length) return a + b;
    const line = n => indent ? "\n" + " ".repeat(n * indent) : "";
    return a + line(depth + 1) + node.children.map(({ key, node: child }) =>
      (obj ? JSON.stringify(key) + (indent ? ": " : ":") : "") + format(child, indent, depth + 1)
    ).join("," + line(depth + 1)) + line(depth) + b;
  }
  function unpackStrings(doc) {
    let count = doc.count, unpacked = 0, limited = 0, budget = MAX_INPUT * 8;
    function visit(node, depth) {
      if (node.children) return { ...node, children: node.children.map(({ key, node: child }) =>
        ({ key, node: visit(child, depth + 1) })) };
      if (node.type !== "string") return node;
      let text = node.value;
      for (let layer = 0; /^[ \t\r\n]*[[{"]/.test(text); layer++) {
        if (layer >= 8 || text.length > budget) { limited++; break; }
        budget -= text.length;
        let inner;
        try { inner = parse(text, false, MAX_VALUES - count + 1, depth); }
        catch (e) {
          if (e instanceof RangeError) limited++;
          else if (!(e instanceof SyntaxError)) throw e;
          break;
        }
        if (inner.root.children) {
          count += inner.count - 1; unpacked++;
          return visit(inner.root, depth);
        }
        if (inner.root.type !== "string") break;
        text = inner.root.value;
      }
      // Only replace the original string if a complete object or array was found.
      return node;
    }
    const root = visit(doc.root, 0);
    return { ...doc, root, count, unpacked, limited };
  }
  const api = { parse, unpackStrings, literal, format, MAX_INPUT };
  globalThis.FacetJSON = api;
})();

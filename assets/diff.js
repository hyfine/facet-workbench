(() => {
  "use strict";
  // Canonical decimal coefficient + exponent: 1.0 equals 1e0, without
  // rounding neighboring long integers to the same JavaScript number.
  function decimal(raw) {
    const [base, e = "0"] = raw.toLowerCase().split("e");
    const digits = base.replace(/[-.]/g, "").replace(/^0+/, "");
    if (!digits) return "0";
    let end = digits.length;
    while (digits[end - 1] === "0") end--;
    const significant = digits.slice(0, end);
    const magnitude = e.replace(/^[+-]?0*/, "");
    if (magnitude.length > 32) throw Error("Exponent is too large for structural comparison.");
    const exponent = BigInt(magnitude || "0") * (e[0] === "-" ? -1n : 1n);
    const offset = digits.length - significant.length - (base.split(".")[1]?.length || 0);
    return (base[0] === "-" ? "-" : "") + significant + "e" + (exponent + BigInt(offset));
  }
  function jsonDiff(left, right, ordered = false) {
    const intern = new Map(), ids = new Map(), marks = new Map();
    const counts = { same: 0, changed: 0, removed: 0, added: 0 };
    function signature(n) {
      let body;
      if (n.type === "object") {
        body = n.children.map(({ key, node }) => [key, signature(node)])
          .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
      } else if (n.type === "array") {
        body = n.children.map(({ node }) => signature(node));
        if (!ordered) body.sort((a, b) => a - b);
      } else body = n.type === "number" ? decimal(n.value) : n.value;
      const s = JSON.stringify([n.type, body]);
      if (!intern.has(s)) intern.set(s, intern.size + 1);
      ids.set(n, intern.get(s)); return ids.get(n);
    }
    signature(left); signature(right);
    function single(n, side) {
      marks.set(n, { status: side });
      if (n.children?.length) n.children.forEach(({ node }) => single(node, side));
      else counts[side]++;
    }
    function visit(a, b) {
      if (!a) return single(b, "added");
      if (!b) return single(a, "removed");
      const status = ids.get(a) === ids.get(b) ? "same" : "changed";
      marks.set(a, { status, peer: b }); marks.set(b, { status, peer: a });
      if (a.type !== b.type || !a.children) {
        counts[status]++;
        for (const [n, side] of [[a, "removed"], [b, "added"]])
          n.children?.forEach(({ node }) => single(node, side));
        return;
      }
      if (!a.children.length && !b.children.length) { counts.same++; return; }
      if (a.type === "object") {
        const remaining = new Map(b.children.map(({ key, node }) => [key, node]));
        for (const { key, node } of a.children) { visit(node, remaining.get(key)); remaining.delete(key); }
        remaining.forEach(node => single(node, "added"));
      } else if (ordered) {
        for (let i = 0; i < Math.max(a.children.length, b.children.length); i++)
          visit(a.children[i]?.node, b.children[i]?.node);
      } else {
        const x = new Set(a.children.map(c => c.node)), y = new Set(b.children.map(c => c.node));
        const pair = (l, r) => { x.delete(l); y.delete(r); visit(l, r); };
        const buckets = new Map();
        for (const r of [...y].reverse()) {
          const key = ids.get(r);
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(r);
        }
        for (const l of x) {
          const match = buckets.get(ids.get(l))?.pop();
          if (match) pair(l, match);
        }
        // Pair edited records only by unambiguous IDs. Never invent a link
        // between two unrelated unmatched records in an unordered collection.
        const identity = n => {
          if (n.type !== "object") return;
          const id = n.children.find(c => c.key === "id")?.node;
          if (id && ["string", "number"].includes(id.type)) return ids.get(id);
        };
        function unique(nodes) {
          const map = new Map();
          for (const n of nodes) {
            const id = identity(n);
            if (id !== undefined) map.set(id, map.has(id) ? null : n);
          }
          return map;
        }
        const yl = unique(y);
        for (const [id, l] of unique(x)) if (l && yl.get(id)) pair(l, yl.get(id));
        x.forEach(n => single(n, "removed")); y.forEach(n => single(n, "added"));
      }
    }
    visit(left, right);
    return { equal: ids.get(left) === ids.get(right), marks, counts };
  }
  function textDiff(left, right) {
    const lines = s => s === "" ? [] : s.replace(/\r\n?/g, "\n").split("\n");
    const a = lines(left), b = lines(right);
    if (Math.max(a.length, b.length) > 4000) throw Error("Text comparison supports up to 4,000 lines per side.");
    const pairs = [], counts = { same: 0, changed: 0, removed: 0, added: 0 };
    const add = (i, j, status) => { pairs.push({ i, j, status }); counts[status]++; };
    let start = 0, endA = a.length, endB = b.length;
    while (start < endA && start < endB && a[start] === b[start]) { add(start, start, "same"); start++; }
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    const m = endA - start, n = endB - start, w = n + 1;
    if (m * n > 4_000_000) throw Error("Too many differing lines. Compare a smaller section.");
    const dp = new Uint16Array((m + 1) * w);
    for (let i = m - 1; i >= 0; i--)
      for (let j = n - 1; j >= 0; j--)
        dp[i * w + j] = a[start + i] === b[start + j] ? dp[(i + 1) * w + j + 1] + 1
          : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    let i = 0, j = 0;
    function gap(i0, j0) {
      const both = Math.min(i - i0, j - j0);
      for (let k = 0; k < both; k++) add(start + i0 + k, start + j0 + k, "changed");
      for (let k = i0 + both; k < i; k++) add(start + k, null, "removed");
      for (let k = j0 + both; k < j; k++) add(null, start + k, "added");
    }
    let i0 = 0, j0 = 0;
    while (i < m && j < n) {
      if (a[start + i] === b[start + j]) {
        gap(i0, j0); add(start + i++, start + j++, "same"); i0 = i; j0 = j;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
      else j++;
    }
    i = m; j = n; gap(i0, j0);
    for (i = endA, j = endB; i < a.length; i++, j++) add(i, j, "same");
    return { a, b, pairs, counts, equal: !counts.changed && !counts.added && !counts.removed };
  }
  globalThis.FacetDiff = { jsonDiff, textDiff };
})();

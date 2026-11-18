const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../assets/json.js");
require("../assets/diff.js");
require("../assets/base64.js");
const { parse, format } = FacetJSON;
const { jsonDiff, textDiff } = FacetDiff;
const diff = (a, b, ordered) => jsonDiff(parse(a).root, parse(b).root, ordered);

test("repair is syntax-aware, explains edits and preserves numeric tokens", () => {
  const raw = "\ufeff{/* hi */ path:'https://demo.invalid/a,b//q', flag:true, n:9007199254740993,}";
  const { root, fixes } = parse(raw, true);
  assert.equal(format(root, 0), '{"path":"https://demo.invalid/a,b//q","flag":true,"n":9007199254740993}');
  assert.deepEqual([...fixes.values()], [1, 1, 3, 1, 1]);
  assert.throws(() => parse(raw), /line 1/);
  assert.equal(format(parse(String.raw`{t:'Don\'t say "hi".\n'}`, true).root, 0), JSON.stringify({ t: 'Don\'t say "hi".\n' }));
});
test("ambiguous repairs, JS expressions and duplicate decoded keys are refused", () => {
  for (const bad of ['{"a":1,"\\u0061":2}', '{a:1 a:2}', '{a:}', '{a:undefined}', '[1,,2]', "'unclosed", "[] /*"])
    assert.throws(() => parse(bad, true), /line \d+, column \d+/);
  assert.equal(format(parse('{"__proto__":9,"10":"a","2":"b"}').root, 0), '{"__proto__":9,"10":"a","2":"b"}');
});
test("reordered nested objects and repeated array elements retain actual peer links", () => {
  const a = parse('{"a":[1,2,1],"b":{"k":true,"n":null}}').root;
  const b = parse('{"b":{"n":null,"k":true},"a":[1,1,2]}').root;
  const r = jsonDiff(a, b);
  assert.equal(r.equal, true);
  assert.equal(r.marks.get(a.children[0].node).peer, b.children[1].node);
  assert.equal(new Set(a.children[0].node.children.map(c => r.marks.get(c.node).peer)).size, 3);
  assert.equal(jsonDiff(a, b, true).equal, false);
  assert.equal(diff('[1,1]', '[1]').counts.removed, 1);
});
test("changed records match by unique id; unmatched members are additions/removals", () => {
  const r = diff('[{"id":1,"x":"a"},{"id":2}]','[{"id":2},{"id":1,"x":"b"}]');
  assert.deepEqual(r.counts, { same: 2, changed: 1, removed: 0, added: 0 });
  assert.equal(diff('{"old":1}', '{"new":1}').equal, false);
  assert.equal(diff('null', '{}').equal, false);
});
test("numbers compare by exact decimal value without expanding huge exponents", () => {
  for (const [a,b] of [["-0","0e1234"],["12.30e-1","1.2300"],["100000","1e+0005"],["9e99999","90e99998"]])
    assert.equal(diff(a,b).equal, true);
  assert.equal(diff("9007199254740992","9007199254740993").equal, false);
  assert.notEqual(diff("1",'"1"').equal, true);
});
test("line comparison keeps matching anchors and notices terminal newlines", () => {
  const r = textDiff("a\r\nb\r\nc\r\n", "a\nnew\nc");
  assert.deepEqual(r.counts, { same: 2, changed: 1, removed: 1, added: 0 });
  assert.equal(textDiff("a\r\nb", "a\nb").equal, true);
  assert.equal(textDiff("", "x").counts.added, 1);
  assert.deepEqual(textDiff("a\nb", "b\na").counts, { same: 1, changed: 0, removed: 1, added: 1 });
});
test("Base64 handles Unicode, URL-safe encoding, whitespace, a data URL and BOM", () => {
  const text = "Hello, 世界 🌿";
  assert.equal(FacetBase64.decode(Buffer.from(text).toString("base64url")).text, text);
  assert.equal(FacetBase64.decode("data:text/plain;base64,SGVs\nbG8=").text, "Hello");
  assert.equal(FacetBase64.decode("//5IAGkA").text, "Hi");
});
test("Base64 refuses invalid padding, invalid UTF-8 and binary data", () => {
  for (const data of ["A","S===","Zg=","Zh==","////","AAAA","data:,Hi"])
    assert.throws(() => FacetBase64.decode(data));
});
test("size, complexity and nesting limits fail explicitly", () => {
  assert.throws(() => parse("[".repeat(100) + "0" + "]".repeat(100)), /nesting/);
  assert.throws(() => parse(" ".repeat(1024 * 1024 + 1)), /limit/);
  assert.throws(() => textDiff("a\n".repeat(4001), ""), /4,000/);
  assert.throws(() => textDiff("a\n".repeat(2100), "b\n".repeat(2100)), /smaller section/);
});

(() => {
  "use strict";
  const MAX_TEXT = 1024 * 1024;
  function encode(text) {
    if (text.length > MAX_TEXT) throw Error("Text exceeds the 1 Mi-character limit.");
    const bytes = new TextEncoder().encode(text), chunks = [];
    for (let i = 0; i < bytes.length; i += 0x4000)
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x4000)));
    const base64 = btoa(chunks.join(""));
    const recovered = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    if (new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(recovered) !== text)
      throw Error("Text cannot round-trip through UTF-8. Check for an unpaired surrogate.");
    return { base64, bytes: bytes.length };
  }
  function encodeTurnN(source) {
    const { parse, format } = globalThis.FacetJSON;
    const { root } = parse(source);
    if (root.type !== "object" || root.children.length !== 1 || root.children[0].key !== "TurnN")
      throw Error('Expected an envelope with exactly one field: {"TurnN": {...}}.');
    const field = root.children[0].node;
    // Keep an already serialized field intact; never stringify the field twice.
    const inner = field.type === "string" ? parse(field.value).root : field;
    if (inner.type !== "object") throw Error("TurnN must contain an object, or a string holding one JSON object.");
    const expected = format(inner, 0);
    const innerText = field.type === "string" ? field.value : expected;
    const wire = '{"TurnN": ' + JSON.stringify(innerText) + '}';
    const result = encode(wire);
    const envelope = JSON.parse(decode(result.base64).text);
    if (typeof envelope.TurnN !== "string" || format(parse(envelope.TurnN).root, 0) !== expected)
      throw Error("The generated patch did not round-trip to the input document.");
    return result;
  }
  function decode(input) {
    // One UTF-16 code unit can produce up to three UTF-8 bytes / four Base64 characters.
    if (input.length > 4 * MAX_TEXT) throw Error("Encoded input exceeds the 4 Mi-character limit.");
    let s = input.trim();
    if (/^data:/i.test(s)) {
      const match = /^data:[^,]*;base64,/i.exec(s);
      if (!match) throw Error("This data URL does not contain Base64.");
      s = s.slice(match[0].length);
    }
    s = s.replace(/[ \t\r\n]/g, "").replace(/-/g, "+").replace(/_/g, "/");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 === 1 ||
        (s.includes("=") && s.length % 4 !== 0)) throw Error("Invalid Base64 alphabet, length or padding.");
    const binary = atob(s);
    if (btoa(binary).replace(/=+$/, "") !== s.replace(/=+$/, "")) throw Error("Invalid Base64 padding bits.");
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const encoding = bytes[0] === 255 && bytes[1] === 254 ? "UTF-16LE" :
      bytes[0] === 254 && bytes[1] === 255 ? "UTF-16BE" : "UTF-8";
    let text;
    try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
    catch { throw Error("Decoded bytes are not valid UTF-8 or BOM-marked UTF-16 text."); }
    if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(text))
      throw Error("Decoded bytes contain binary control characters, not readable text.");
    return { text, bytes: bytes.length, encoding };
  }
  globalThis.FacetBase64 = { decode, encode, encodeTurnN };
})();

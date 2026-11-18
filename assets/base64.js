(() => {
  "use strict";
  function decode(input) {
    if (input.length > 1024 * 1024) throw Error("Input exceeds the 1 Mi-character limit.");
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
  globalThis.FacetBase64 = { decode };
})();

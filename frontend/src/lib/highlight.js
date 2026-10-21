// A tiny Python highlighter for the landing page's code samples: keywords, function names,
// strings, numbers, comments and type names. Returns [{ text, cls }] tokens for one line.

const KW = new Set(["def", "return", "if", "else", "elif", "for", "in", "while", "import", "from", "as", "class",
  "with", "try", "except", "not", "and", "or", "None", "True", "False", "lambda", "pass", "raise"]);
const TYPES = new Set(["str", "int", "bool", "float", "date", "dict", "list"]);
const TOKEN = /(#.*$)|('[^']*'|"[^"]*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|(.)/g;

export function highlight(line) {
  const out = [];
  let m;
  let prev = "";
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line)) !== null) {
    const [tok, com, str, num, word] = m;
    let cls = "";
    if (com) cls = "tok-com";
    else if (str) cls = "tok-str";
    else if (num) cls = "tok-num";
    else if (word) {
      if (KW.has(word)) cls = "tok-kw";
      else if (TYPES.has(word)) cls = "tok-ty";
      else if (prev === "def" || line.slice(m.index + word.length).startsWith("(")) cls = "tok-fn";
    }
    if (word) prev = word;
    out.push({ text: tok, cls });
    if (tok === "") break;
  }
  return out;
}

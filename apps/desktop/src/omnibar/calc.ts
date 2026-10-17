/**
 * The OmniBar calculator (FEAT-023). A small parser, never `eval`.
 *
 * Supports + − × ÷ ^, parentheses, `50%` (= 0.5, and `x + 12%` = x · 1.12), `pi`, `e`, and sqrt, abs,
 * round, floor, ceil, sin, cos, tan (radians), log (base 10), ln.
 */

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token = { t: "num"; v: number } | { t: "op"; v: string } | { t: "id"; v: string };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  const src = input.replace(/[×x*]/g, "*").replace(/[÷/]/g, "/").replace(/−/g, "-").replace(/,/g, "");
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) return null;
      tokens.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z]/i.test(c)) {
      const m = /^[a-z]+/i.exec(src.slice(i))!;
      tokens.push({ t: "id", v: m[0].toLowerCase() });
      i += m[0].length;
    } else if ("+-*/^%()".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
    } else {
      return null;
    }
  }
  return tokens;
}

/** The value of `input`, or null if it isn't a calculation. */
export function evaluate(input: string): number | null {
  const tokens = tokenize(input);
  if (!tokens || tokens.length === 0) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => {
    const tok = peek();
    return tok?.t === "op" && tok.v === v;
  };

  // expr := term (('+'|'-') term)*
  // `x + 12%` adds 12 % of x, like a desk calculator.
  const expr = (): number => {
    let v = term();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[pos++] as { v: string }).v;
      const start = pos;
      let r = term();
      const last = tokens[pos - 1];
      if (pos - start === 2 && tokens[start]?.t === "num" && last?.t === "op" && last.v === "%") r *= v;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  // term := unary (('*'|'/') unary | implicit-multiply)*
  const term = (): number => {
    let v = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = (tokens[pos++] as { v: string }).v;
        const r = unary();
        v = op === "*" ? v * r : v / r;
      } else if (isOp("(") || peek()?.t === "id") {
        v *= unary(); // 2pi, 3(4+1)
      } else {
        return v;
      }
    }
  };
  // unary := ('-'|'+') unary | power
  const unary = (): number => {
    if (isOp("-")) {
      pos++;
      return -unary();
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return power();
  };
  // power := postfix ('^' unary)?   (right-associative)
  const power = (): number => {
    const base = postfix();
    if (isOp("^")) {
      pos++;
      return base ** unary();
    }
    return base;
  };
  // postfix := atom '%'*
  const postfix = (): number => {
    let v = atom();
    while (isOp("%")) {
      pos++;
      v /= 100;
    }
    return v;
  };
  const atom = (): number => {
    const tok = tokens[pos++];
    if (!tok) throw new Error("end");
    if (tok.t === "num") return tok.v;
    if (tok.t === "op" && tok.v === "(") {
      const v = expr();
      if (!isOp(")")) throw new Error("paren");
      pos++;
      return v;
    }
    if (tok.t === "id") {
      if (tok.v in CONSTANTS) return CONSTANTS[tok.v]!;
      const fn = FUNCTIONS[tok.v];
      if (fn) return fn(isOp("(") ? atom() : unary());
    }
    throw new Error("token");
  };

  try {
    const value = expr();
    if (pos !== tokens.length || !Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

/** Only treat input as a sum if it does something: `42` alone is not one. */
export function looksLikeMath(input: string): boolean {
  const s = input.trim();
  if (!/\d|\bpi\b/i.test(s)) return false;
  return (
    /[+\-*/^%×÷−()x]/.test(s.replace(/^[-+]/, "")) ||
    /\dpi\b/i.test(s) ||
    /^(sqrt|abs|round|floor|ceil|sin|cos|tan|log|ln)\b/i.test(s)
  );
}

/** Up to 12 significant digits, no float noise: 0.1 + 0.2 → "0.3". */
export function formatNumber(n: number): string {
  if (Object.is(n, -0)) return "0";
  const rounded = Number(n.toPrecision(12));
  return Math.abs(rounded) >= 1e15 || (Math.abs(rounded) < 1e-9 && rounded !== 0)
    ? rounded.toExponential(6).replace(/\.?0+e/, "e")
    : String(rounded);
}

/** The result to show, or null if `input` isn't a calculation. */
export function calculate(input: string): string | null {
  if (!looksLikeMath(input)) return null;
  const value = evaluate(input);
  return value === null ? null : formatNumber(value);
}

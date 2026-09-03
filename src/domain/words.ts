/**
 * Loops writes sentences, not counters — so numbers are spelled out as far as
 * anyone would say them aloud, and past a hundred the digit is honest about
 * being a lot.
 */
const SPELLED = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

export function spell(n: number): string {
  if (n < 0 || !Number.isInteger(n)) return String(n);
  if (n < SPELLED.length) return SPELLED[n];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    const units = n % 10;
    return units === 0 ? tens : `${tens}-${SPELLED[units]}`;
  }
  return String(n);
}

/** Sentence-leading form: "Three things need you." */
export function spellCapitalised(n: number): string {
  const word = spell(n);
  return word[0].toUpperCase() + word.slice(1);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** "2 days late", "1 day late" — the mono time-fact on a row. */
export function countOf(n: number, one: string, many = `${one}s`): string {
  return `${n} ${plural(n, one, many)}`;
}

/** Joins clauses into a paragraph: each sentence ends where it should. */
export function sentences(...parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(" ");
}

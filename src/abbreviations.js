// abbreviations that end on a full stop without ending a sentence
// single letters, which cover "e.g.", "i.e." and initials, are handled by their own rule
// a word that also stands on its own, such as "no", stays out: "the answer is no." does end a sentence
export const ABBREVIATIONS = [
  'al',
  'approx',
  'cf',
  'Dr',
  'etc',
  'fig',
  'Inc',
  'Ltd',
  'Mr',
  'Mrs',
  'Ms',
  'Prof',
  'ref',
  'vs',
  'ep'
];

// each abbreviation is matched as written and capitalised, since it can open a sentence
const FORMS = [...new Set(ABBREVIATIONS.flatMap(word => [word, word[0].toUpperCase() + word.slice(1)]))];

export const abbreviationAlternatives = FORMS.join('|');

const forms = new Set(FORMS);

// tells whether the full stop ending the text closes an abbreviation or an initial rather than a sentence
export function endsOnAbbreviation(text) {
  if (!text.endsWith('.')) return false;

  // the word is read backwards from its end, since a pattern anchored there would be tried from every position of the text
  const end = text.length - 1;
  let start = end;
  while (start > 0 && /[A-Za-z]/.test(text[start - 1])) start--;
  const word = text.slice(start, end);
  return word.length === 1 || forms.has(word);
}

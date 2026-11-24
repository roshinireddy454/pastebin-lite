// Must match the ids supported by the server (src/lib/languages.js).
export const LANGUAGES = [
  ['plaintext', 'Plain text'],
  ['bash', 'Bash / Shell'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['css', 'CSS'],
  ['dockerfile', 'Dockerfile'],
  ['go', 'Go'],
  ['html', 'HTML'],
  ['java', 'Java'],
  ['javascript', 'JavaScript'],
  ['json', 'JSON'],
  ['kotlin', 'Kotlin'],
  ['markdown', 'Markdown'],
  ['php', 'PHP'],
  ['python', 'Python'],
  ['ruby', 'Ruby'],
  ['rust', 'Rust'],
  ['scss', 'SCSS'],
  ['sql', 'SQL'],
  ['swift', 'Swift'],
  ['typescript', 'TypeScript'],
  ['xml', 'XML'],
  ['yaml', 'YAML'],
];

const NAMES = Object.fromEntries(LANGUAGES);
export const languageName = (id) => NAMES[id] ?? 'Plain text';

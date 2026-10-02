import { toast } from './ui';

export const STATES = [
  { id: 'toread', name: 'To Read' },
  { id: 'upnext', name: 'Up Next' },
  { id: 'reading', name: 'Reading' },
  { id: 'onhold', name: 'On Hold' },
  { id: 'finished', name: 'Finished' },
  { id: 'dropped', name: 'Dropped' },
] as const;

export type StateId = (typeof STATES)[number]['id'];
export const isState = (v: unknown): v is StateId => STATES.some((s) => s.id === v);
export const stateName = (id: StateId) => (STATES.find((s) => s.id === id) ?? STATES[0]).name;

export interface Book {
  id: string;
  title: string;
  author: string;
  state: StateId;
  bg: string;
  ink: string;
  cover: string | null;
  file: { name: string; size: number };
  added: string;
  history: { at: string; text: string }[];
  kindle: { status: 'sending' | 'delivered'; at: string } | null;
}

const COVER_COLORS: [string, string][] = [
  ['#CFE8DC', '#1F4A37'], ['#F8D9C8', '#6E3318'], ['#E2DAF6', '#433683'],
  ['#D6E6F7', '#2A4E75'], ['#F6E7A8', '#6B4F0E'], ['#F7D2DC', '#7A2E44'],
  ['#D5EFE3', '#1F5A40'], ['#FBEDB8', '#6B4F0E'], ['#E9E6EE', '#4A4660'],
];
export const colorFor = (text: string): [string, string] => {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COVER_COLORS[h % COVER_COLORS.length];
};

export const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const CONFIG = { kindleEmail: '[tu-correo]@kindle.com' };

function seed(): Book[] {
  const now = Date.now();
  const day = 86400000;
  const palette: Record<string, [string, string]> = {
    'Cien años de soledad': ['#F6E7A8', '#6B4F0E'], 'El infinito en un junco': ['#D6E6F7', '#2A4E75'],
    'Project Hail Mary': ['#F7D2DC', '#7A2E44'], 'Klara y el Sol': ['#D5EFE3', '#1F5A40'],
    'Piranesi': ['#E2DAF6', '#433683'], 'La península de las casas vacías': ['#F9DCCB', '#6E3318'],
    'El nombre del viento': ['#CFE8DC', '#1F4A37'], 'Pedro Páramo': ['#F8D9C8', '#6E3318'],
    'Middlemarch': ['#DCE9F7', '#244E78'], 'Tomás Nevinson': ['#E5DDF7', '#433683'],
    'Hábitos atómicos': ['#FBEDB8', '#6B4F0E'], 'La vegetariana': ['#D5EFE3', '#1F5A40'],
    'Ulises': ['#E9E6EE', '#4A4660'],
  };
  const mk = (title: string, author: string, state: StateId, daysAgo: number, extra: Partial<Book> = {}): Book => {
    const [bg, ink] = palette[title] ?? colorFor(title);
    const added = new Date(now - daysAgo * day).toISOString();
    const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
    return {
      id: uid(), title, author, state, bg, ink, cover: null,
      file: { name: slug + '.epub', size: 1200000 + title.length * 91234 },
      added, history: [{ at: added, text: 'Agregado a la biblioteca' }],
      kindle: null, ...extra,
    };
  };
  const sentAt = new Date(now - 2 * day).toISOString();
  return [
    mk('Cien años de soledad', 'Gabriel García Márquez', 'toread', 30),
    mk('El infinito en un junco', 'Irene Vallejo', 'toread', 26),
    mk('Project Hail Mary', 'Andy Weir', 'toread', 20),
    mk('Klara y el Sol', 'Kazuo Ishiguro', 'toread', 12),
    mk('Piranesi', 'Susanna Clarke', 'upnext', 18),
    mk('La península de las casas vacías', 'David Uclés', 'upnext', 9),
    mk('El nombre del viento', 'Patrick Rothfuss', 'reading', 28, {
      kindle: { status: 'delivered', at: sentAt },
      history: [
        { at: new Date(now - 28 * day).toISOString(), text: 'Agregado a la biblioteca' },
        { at: sentAt, text: 'Movido a Reading' },
        { at: sentAt, text: 'Email enviado a ' + CONFIG.kindleEmail },
        { at: sentAt, text: 'Aceptado por el servidor de correo' },
      ],
    }),
    mk('Pedro Páramo', 'Juan Rulfo', 'reading', 6, { kindle: { status: 'sending', at: new Date().toISOString() } }),
    mk('Middlemarch', 'George Eliot', 'onhold', 60),
    mk('Tomás Nevinson', 'Javier Marías', 'finished', 90),
    mk('Hábitos atómicos', 'James Clear', 'finished', 120),
    mk('La vegetariana', 'Han Kang', 'finished', 75),
    mk('Ulises', 'James Joyce', 'dropped', 200),
  ];
}

const KEY = 'readflow:books:v1';
let books: Book[] = [];

export function load(): Book[] {
  try {
    const raw = localStorage.getItem(KEY);
    books = raw ? JSON.parse(raw) : seed();
    if (!raw) save();
  } catch {
    books = seed();
  }
  return books;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(books));
  } catch {
    toast('No se pudo guardar en este navegador');
  }
}

export const getBook = (id: string | null) => books.find((b) => b.id === id);

export function addBooks(list: Book[]) {
  books.unshift(...list);
  save();
}

const listeners = new Set<() => void>();
export const onChange = (fn: () => void) => listeners.add(fn);
const notify = () => listeners.forEach((fn) => fn());

export function sendToKindle(book: Book) {
  const at = new Date().toISOString();
  book.kindle = { status: 'sending', at };
  book.history.push({ at, text: 'Email enviado a ' + CONFIG.kindleEmail });
  save();
  toast('Enviando «' + book.title + '» a tu Kindle…', 'mail');
  setTimeout(() => {
    const fresh = getBook(book.id);
    if (!fresh) return;
    const done = new Date().toISOString();
    fresh.kindle = { status: 'delivered', at: done };
    fresh.history.push({ at: done, text: 'Aceptado por el servidor de correo' });
    save();
    toast('Listo: ya está en tu Kindle', 'check');
    notify();
  }, 2200);
}

export function moveBook(id: string, state: StateId) {
  const book = getBook(id);
  if (!book || book.state === state) return;
  const prev = book.state;
  book.state = state;
  book.history.push({ at: new Date().toISOString(), text: 'Movido de ' + stateName(prev) + ' a ' + stateName(state) });
  save();
  if (state === 'reading') sendToKindle(book);
  else toast('Movido a ' + stateName(state));
  notify();
}

export function resumePending() {
  books.filter((b) => b.kindle?.status === 'sending').forEach((b) => {
    setTimeout(() => {
      b.kindle = { status: 'delivered', at: new Date().toISOString() };
      b.history.push({ at: b.kindle.at, text: 'Aceptado por el servidor de correo' });
      save();
      notify();
    }, 2500);
  });
}

import { ApiError, listBooks, getBook as apiGetBook, patchBook, resendKindle, deleteBook as apiDeleteBook, type ApiBook, type ApiEvent, type BookPatch } from './api';
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

export const TYPES = [
  { id: 'productivity', name: 'Desarrollo y Productividad' },
  { id: 'wellbeing', name: 'Mente y bienestar' },
  { id: 'history', name: 'Historia y Sociedad' },
  { id: 'film', name: 'Cine y cultura' },
  { id: 'philosophy', name: 'Filosofía' },
  { id: 'fiction', name: 'Clásicos y Narrativa' },
  { id: 'thriller', name: 'Thriller y Terror' },
  { id: 'scifi', name: 'Ciencia Ficción y Fantasía' },
  { id: 'design', name: 'Arte y Diseño' },
  { id: 'strategy', name: 'Sistemas y Estrategia' },
  { id: 'programming', name: 'Programación y Software' },
  { id: 'other', name: 'Otros y Antologías' },
] as const;

export type TypeId = (typeof TYPES)[number]['id'];
export const isType = (v: unknown): v is TypeId => TYPES.some((t) => t.id === v);

export type EventKind = ApiEvent['kind'];

export interface Book {
  id: string;
  title: string;
  author: string;
  authors: string[];
  state: StateId;
  type?: TypeId;
  score?: number;
  year?: number;
  bg: string;
  ink: string;
  cover: string | null;
  file: { name: string; size?: number };
  added: string;
  history: { at: string; kind: EventKind; text: string }[];
  kindle: { status: 'sending' | 'sent' | 'failed'; at: string } | null;
  ingest: 'pending' | 'ready' | 'failed';
  ingestError?: string;
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

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function eventText(ev: ApiEvent): string {
  const d = ev.data;
  switch (ev.kind) {
    case 'uploaded': return 'Agregado a la biblioteca';
    case 'ingest_ready': return 'Metadata extraída del EPUB';
    case 'ingest_failed': return 'No se pudo leer el EPUB: ' + (str(d.error) || 'error desconocido');
    case 'status_changed': {
      const from = isState(d.from) ? stateName(d.from) : str(d.from);
      const to = isState(d.to) ? stateName(d.to) : str(d.to);
      return 'Movido de ' + from + ' a ' + to;
    }
    case 'kindle_requested': return 'Envío al Kindle pedido';
    case 'kindle_sent': return 'Aceptado por el servidor de correo';
    case 'kindle_failed': return 'Falló el envío al Kindle' + (str(d.error) ? ': ' + str(d.error) : '');
    default: return String(ev.kind);
  }
}

function toBook(b: ApiBook, history: Book['history']): Book {
  const [bg, ink] = colorFor(b.id);
  const k = b.kindle;
  return {
    id: b.id,
    title: b.name,
    author: b.authors.map((a) => a.name).join(', ') || 'Autor desconocido',
    authors: b.authors.map((a) => a.name),
    state: b.status,
    type: b.type,
    score: b.score,
    year: b.year,
    bg, ink,
    cover: b.coverUrl ?? null,
    file: { name: b.epubFileName, size: b.epubSize },
    added: b.createdAt,
    history,
    kindle: k?.status ? { status: k.status, at: k.at ?? k.requestedAt ?? b.updatedAt } : null,
    ingest: b.ingest,
    ingestError: b.ingestError,
  };
}

const books: Book[] = [];

function upsert(b: ApiBook, events?: ApiEvent[]): Book {
  const i = books.findIndex((x) => x.id === b.id);
  const history = events ? events.map((ev) => ({ at: ev.at, kind: ev.kind, text: eventText(ev) })) : books[i]?.history ?? [];
  const book = toBook(b, history);
  if (i < 0) books.push(book);
  else books[i] = book;
  return book;
}

export async function load(): Promise<Book[]> {
  const { books: list } = await listBooks();
  const prev = new Map(books.map((b) => [b.id, b.history]));
  books.splice(0, books.length, ...list.map((b) => toBook(b, prev.get(b.id) ?? [])));
  return books;
}

export const getBook = (id: string | null) => books.find((b) => b.id === id);

export async function fetchBook(id: string): Promise<Book> {
  const { book, events } = await apiGetBook(id);
  return upsert(book, events);
}

const listeners = new Set<() => void>();
export const onChange = (fn: () => void) => listeners.add(fn);
const notify = () => listeners.forEach((fn) => fn());

export function showError(err: unknown) {
  console.error(err);
  const code = err instanceof ApiError ? err.code : '';
  if (code === 'kindle_email_missing') return toast('Configura tu correo de Kindle en Ajustes', 'settings', '/ajustes');
  if (code === 'ingest_failed') return toast('El EPUB no se pudo procesar: no se puede enviar al Kindle');
  if (code === 'not_found') return toast('El libro ya no existe');
  if (code === 'invalid_request') return toast('Datos no válidos: ' + (err as ApiError).message);
  toast('No se pudo conectar con el servidor');
}

export async function updateBook(id: string, body: BookPatch): Promise<Book | undefined> {
  try {
    const book = upsert((await patchBook(id, body)).book);
    notify();
    return book;
  } catch (err) {
    showError(err);
  }
}

export async function moveBook(id: string, state: StateId) {
  const book = getBook(id);
  if (!book || book.state === state) return;
  const updated = await updateBook(id, { status: state });
  if (!updated) return;
  if (state === 'reading') toast('Enviando «' + updated.title + '» a tu Kindle…', 'mail');
  else toast('Movido a ' + stateName(state));
  pollPending();
}

export async function sendToKindle(id: string) {
  try {
    const book = upsert((await resendKindle(id)).book);
    toast('Enviando «' + book.title + '» a tu Kindle…', 'mail');
    notify();
    pollPending();
  } catch (err) {
    showError(err);
  }
}

export async function removeBook(id: string): Promise<boolean> {
  try {
    await apiDeleteBook(id);
    const i = books.findIndex((b) => b.id === id);
    if (i >= 0) books.splice(i, 1);
    notify();
    return true;
  } catch (err) {
    showError(err);
    return false;
  }
}

const POLL_MS = 3000;
const POLL_LIMIT_MS = 2 * 60 * 1000;
const pending = (b: Book) => b.ingest === 'pending' || b.kindle?.status === 'sending';
let polling = false;
let detailId: string | null = null;

export async function pollPending() {
  if (polling) return;
  polling = true;
  const until = Date.now() + POLL_LIMIT_MS;
  while (books.some(pending) && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    try {
      const before = new Map(books.map((b) => [b.id, b.kindle?.status]));
      if (detailId) await fetchBook(detailId);
      else await load();
      for (const b of books) {
        if (before.get(b.id) !== 'sending') continue;
        if (b.kindle?.status === 'sent') toast('Listo: «' + b.title + '» ya está en tu Kindle', 'check');
        if (b.kindle?.status === 'failed') toast('No se pudo enviar «' + b.title + '» al Kindle');
      }
      notify();
    } catch (err) {
      console.error(err);
    }
  }
  polling = false;
}

export const watchBook = (id: string) => { detailId = id; };

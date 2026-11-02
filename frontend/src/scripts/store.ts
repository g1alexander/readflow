import { ApiError, listBooks, getBook as apiGetBook, patchBook, resendKindle, deleteBook as apiDeleteBook, type ApiBook, type ApiEvent, type BookPatch, type ListParams } from './api';
import { CONNECTION_STATE_CHANGE, ConnectionState, events } from 'aws-amplify/api';
import { Hub } from 'aws-amplify/utils';
import { userSub } from './auth';
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
  { id: 'productivity', name: 'Desarrollo y Productividad', color: '#4FAE82' },
  { id: 'wellbeing', name: 'Mente y bienestar', color: '#7CC4B4' },
  { id: 'history', name: 'Historia y Sociedad', color: '#C9A15A' },
  { id: 'film', name: 'Cine y cultura', color: '#E07A7A' },
  { id: 'philosophy', name: 'Filosofía', color: '#9686DC' },
  { id: 'fiction', name: 'Clásicos y Narrativa', color: '#C48BA1' },
  { id: 'thriller', name: 'Thriller y Terror', color: '#8A2B2B' },
  { id: 'scifi', name: 'Ciencia Ficción y Fantasía', color: '#6FA3D8' },
  { id: 'design', name: 'Arte y Diseño', color: '#E79673' },
  { id: 'strategy', name: 'Sistemas y Estrategia', color: '#D9B13E' },
  { id: 'programming', name: 'Programación y Software', color: '#2A4E75' },
  { id: 'other', name: 'Otros y Antologías', color: '#8A85A0' },
] as const;

export type TypeId = (typeof TYPES)[number]['id'];
export const isType = (v: unknown): v is TypeId => TYPES.some((t) => t.id === v);
export const typeOf = (id?: TypeId) => TYPES.find((t) => t.id === id);

export const NO_TYPE = 'none';
export type TypeFilter = TypeId | typeof NO_TYPE;

export const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
export const matchesQuery = (b: Book, q: string) => !q || [b.title, ...b.authors].some((t) => fold(t).includes(fold(q)));

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
  kindle: { status: 'sending' | 'sent' | 'failed'; at: string; error?: string } | null;
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

const KINDLE_ERRORS: Record<string, string> = {
  too_large: 'el EPUB pesa más de 28 MB',
  kindle_email_missing: 'falta tu correo de Kindle en Ajustes',
  ses_error: 'el servidor de correo rechazó el envío',
  ingest_failed: 'el EPUB no se pudo procesar',
};

export const kindleErrorText = (code?: string) => (code ? KINDLE_ERRORS[code] ?? code : '');

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
    case 'kindle_failed': return 'Falló el envío al Kindle' + (str(d.error) ? ': ' + kindleErrorText(str(d.error)) : '');
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
    kindle: k?.status ? { status: k.status, at: k.at ?? k.requestedAt ?? b.updatedAt, error: k.error } : null,
    ingest: b.ingest,
    ingestError: b.ingestError,
  };
}

const cache = new Map<string, Book>();

function upsert(b: ApiBook, events?: ApiEvent[]): Book {
  const history = events ? events.map((ev) => ({ at: ev.at, kind: ev.kind, text: eventText(ev) })) : cache.get(b.id)?.history ?? [];
  const book = toBook(b, history);
  cache.set(book.id, book);
  return book;
}

export async function queryBooks(params: ListParams): Promise<{ books: Book[]; nextCursor: string | null }> {
  const { books, nextCursor } = await listBooks(params);
  return {
    books: books.map((b) => {
      const before = cache.get(b.id)?.kindle?.status;
      const book = upsert(b);
      toastKindle(book, before);
      return book;
    }),
    nextCursor,
  };
}

export const getBook = (id: string | null) => (id ? cache.get(id) : undefined);

export async function fetchBook(id: string): Promise<Book> {
  const { book, events } = await apiGetBook(id);
  return upsert(book, events);
}

const listeners = new Set<(book: Book | undefined, id: string) => void>();
export const onChange = (fn: (book: Book | undefined, id: string) => void) => listeners.add(fn);
const notify = (id: string) => listeners.forEach((fn) => fn(cache.get(id), id));

const reloaders = new Set<() => void>();
export const onReconnect = (fn: () => void) => reloaders.add(fn);

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
    notify(id);
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
}

export async function sendToKindle(id: string) {
  try {
    const book = upsert((await resendKindle(id)).book);
    toast('Enviando «' + book.title + '» a tu Kindle…', 'mail');
    notify(id);
  } catch (err) {
    showError(err);
  }
}

export async function removeBook(id: string): Promise<boolean> {
  try {
    await apiDeleteBook(id);
    cache.delete(id);
    notify(id);
    return true;
  } catch (err) {
    showError(err);
    return false;
  }
}

let detailId: string | null = null;
let subscribed = false;

function toastKindle(book: Book, before: string | undefined) {
  if (before !== 'sending') return;
  if (book.kindle?.status === 'sent') toast('Listo: «' + book.title + '» ya está en tu Kindle', 'check');
  if (book.kindle?.status === 'failed') toast('No se pudo enviar «' + book.title + '» al Kindle');
}

async function refresh(id: string) {
  try {
    const before = cache.get(id)?.kindle?.status;
    toastKindle(await fetchBook(id), before);
    notify(id);
  } catch (err) {
    console.error(err);
  }
}

export async function subscribe() {
  if (subscribed) return;
  subscribed = true;
  Hub.listen('api', ({ payload }) => {
    const data = payload.data as { connectionState?: ConnectionState } | undefined;
    if (payload.event === CONNECTION_STATE_CHANGE && data?.connectionState === ConnectionState.Connected) {
      if (detailId) refresh(detailId);
      else reloaders.forEach((fn) => fn());
    }
  });
  try {
    const channel = await events.connect('/readflow/users/' + (await userSub()));
    channel.subscribe({
      next: ({ event }) => {
        const id = event?.bookId;
        if (typeof id === 'string' && (!detailId || id === detailId)) refresh(id);
      },
      error: (err) => console.error(err),
    });
  } catch (err) {
    subscribed = false;
    console.error(err);
  }
}

export const watchBook = (id: string) => { detailId = id; };

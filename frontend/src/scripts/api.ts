import { accessToken } from './auth';
import type { StateId, TypeId } from './store';

export interface Author { id: string; name: string }

export interface ApiBook {
  id: string;
  name: string;
  authors: Author[];
  status: StateId;
  type?: TypeId;
  score?: number;
  year?: number;
  ingest: 'pending' | 'ready' | 'failed';
  ingestError?: string;
  epubSize?: number;
  epubKey: string;
  epubFileName: string;
  coverKey?: string;
  coverUrl?: string;
  kindle?: { requestedAt?: string; status?: 'sending' | 'sent' | 'failed'; at?: string };
  createdAt: string;
  updatedAt: string;
}

export interface ApiEvent {
  id: string;
  kind: 'uploaded' | 'ingest_ready' | 'ingest_failed' | 'status_changed' | 'kindle_requested' | 'kindle_sent' | 'kindle_failed';
  data: Record<string, unknown>;
  at: string;
}

export interface BookPatch {
  status?: StateId;
  name?: string;
  authors?: string[];
  type?: TypeId | null;
  score?: number | null;
  year?: number | null;
}

export interface Settings { kindleEmail?: string }

export interface Upload {
  url: string;
  method: string;
  headers: Record<string, string>;
  expiresIn: number;
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(import.meta.env.PUBLIC_API_URL + path, {
    method,
    headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'http', data?.error?.message ?? res.statusText);
  return data as T;
}

export const listBooks = () => request<{ books: ApiBook[] }>('GET', '/books');

const bookPath = (id: string) => '/books/' + encodeURIComponent(id);

export const getBook = (id: string) => request<{ book: ApiBook; events: ApiEvent[] }>('GET', bookPath(id));

export const patchBook = (id: string, body: BookPatch) => request<{ book: ApiBook }>('PATCH', bookPath(id), body);

export const resendKindle = (id: string) => request<{ book: ApiBook }>('POST', bookPath(id) + '/kindle');

export const deleteBook = (id: string) => request<null>('DELETE', bookPath(id));

export const getSettings = () => request<Settings>('GET', '/settings');

export const putSettings = (body: { kindleEmail: string | null }) => request<Settings>('PUT', '/settings', body);

export const listAuthors = () => request<{ authors: Author[] }>('GET', '/authors');

export const createUpload = (file: File) =>
  request<{ book: ApiBook; upload: Upload }>('POST', '/uploads', { fileName: file.name, size: file.size });

export async function putFile({ url, method, headers }: Upload, file: File) {
  const res = await fetch(url, { method, headers, body: file });
  if (!res.ok) throw new ApiError(res.status, 's3', `S3 ${res.status}`);
}

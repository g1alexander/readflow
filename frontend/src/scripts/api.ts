import { accessToken } from './auth';
import type { StateId } from './store';

export interface ApiBook {
  id: string;
  name: string;
  authors: { id: string; name: string }[];
  status: StateId;
  ingest: 'pending' | 'ready' | 'failed';
  epubKey: string;
  epubFileName: string;
  createdAt: string;
  updatedAt: string;
}

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
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'http', data?.error?.message ?? res.statusText);
  return data as T;
}

export const createUpload = (file: File) =>
  request<{ book: ApiBook; upload: Upload }>('POST', '/uploads', { fileName: file.name, size: file.size });

export async function putFile({ url, method, headers }: Upload, file: File) {
  const res = await fetch(url, { method, headers, body: file });
  if (!res.ok) throw new ApiError(res.status, 's3', `S3 ${res.status}`);
}

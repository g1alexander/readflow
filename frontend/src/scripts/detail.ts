import { STATES, TYPES, isState, isType, getBook, fetchBook, moveBook, sendToKindle, updateBook, removeBook, onChange, pollPending, watchBook, showError, type Book } from './store';
import { listAuthors, ApiError, type BookPatch } from './api';
import { $, esc, icon, coverHTML, fmtDate, fmtDateTime, fmtSize, pill, toast, btn, ICON_SM, STATE_BTN, FIELD } from './ui';

const markdown = (b: Book) => `---
title: ${b.title}
author: ${b.author}
status: ${b.state}
---

## Highlights

> [texto del highlight]
— Ubicación [###]`;

const MAX_AUTHORS = 10;

const TIMELINE_STATE: Record<string, string> = {
  uploaded: 'toread',
  ingest_ready: 'toread',
  ingest_failed: 'dropped',
  status_changed: 'upnext',
  kindle_requested: 'upnext',
  kindle_sent: 'reading',
  kindle_failed: 'dropped',
};

const KINDLE_PILL = {
  sending: ['warn', 'Enviando…'],
  sent: ['ok', 'Entregado'],
  failed: ['err', 'Falló el envío'],
} as const;

export async function initDetail() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.replace('/tablero'); return; }

  let book: Book;
  try {
    book = await fetchBook(id);
  } catch (err) {
    showError(err);
    if (err instanceof ApiError && err.code === 'not_found') setTimeout(() => location.replace('/tablero'), 1500);
    return;
  }
  watchBook(id);

  const states = $('#states');
  const kindlePill = $('#kindle-pill');
  const form = $<HTMLFormElement>('#edit-form');
  const fName = $<HTMLInputElement>('#f-name');
  const fAuthors = $('#f-authors');
  const fType = $<HTMLSelectElement>('#f-type');
  const fScore = $<HTMLSelectElement>('#f-score');
  const fYear = $<HTMLInputElement>('#f-year');
  const saveBtn = $<HTMLButtonElement>('#save-edit');

  fType.innerHTML = '<option value="">Sin tipo</option>' + TYPES.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  fScore.innerHTML = '<option value="">Sin puntuación</option>' + [1, 2, 3, 4, 5].map((n) => `<option value="${n}">${'★'.repeat(n)}</option>`).join('');
  fYear.max = String(new Date().getUTCFullYear());

  listAuthors()
    .then(({ authors }) => { $('#author-options').innerHTML = authors.map((a) => `<option value="${esc(a.name)}"></option>`).join(''); })
    .catch((err) => console.error(err));

  const authorRow = (name: string) => `<div class="flex gap-2" data-author>
    <input class="${FIELD}" type="text" maxlength="300" list="author-options" value="${esc(name)}" aria-label="Autor" />
    <button class="${btn('ghost', 'icon')}" type="button" data-remove-author aria-label="Quitar autor">×</button>
  </div>`;
  const authorInputs = () => Array.from(fAuthors.querySelectorAll<HTMLInputElement>('input'));
  const syncAddAuthor = () => { $<HTMLButtonElement>('#add-author').disabled = authorInputs().length >= MAX_AUTHORS; };

  function fillForm() {
    fName.value = book.title;
    fAuthors.innerHTML = (book.authors.length ? book.authors : ['']).map(authorRow).join('');
    fType.value = book.type ?? '';
    fScore.value = book.score ? String(book.score) : '';
    fYear.value = book.year === undefined ? '' : String(book.year);
    syncAddAuthor();
  }

  function render() {
    book = getBook(book.id) ?? book;
    document.title = book.title + ' — Readflow';
    $('#cover').innerHTML = coverHTML(book, 'lg');
    document.querySelectorAll('[data-bind="title"]').forEach((el) => { el.textContent = book.title; });
    document.querySelectorAll('[data-bind="author"]').forEach((el) => { el.textContent = book.author; });
    $('#file-name').textContent = book.file.name;
    $('#file-meta').textContent = (book.file.size ? fmtSize(book.file.size) + ' · ' : '') + `subido el ${fmtDate(book.added)}`;

    states.innerHTML = STATES.map((s) =>
      `<button type="button" class="${STATE_BTN}" data-state="${s.id}" data-move="${s.id}" aria-pressed="${book.state === s.id}">${s.name}</button>`).join('');

    const [tone, text] = book.kindle ? KINDLE_PILL[book.kindle.status] : ['state', 'Sin enviar'] as const;
    kindlePill.className = pill(tone);
    kindlePill.textContent = text;

    const events = book.history;
    $('#timeline').innerHTML = events.map((ev, i) => {
      const done = ev.kind === 'kindle_sent';
      return `<li class="flex gap-3 items-start">
        <span class="size-6 rounded-full shrink-0 grid place-items-center text-xs font-bold bg-s-bg text-s-ink" data-state="${TIMELINE_STATE[ev.kind] ?? 'toread'}">${done ? icon('check', ICON_SM) : events.length - i}</span>
        <span class="flex flex-col gap-0.5"><strong class="text-sm font-semibold">${esc(ev.text)}</strong><span class="text-[13px] text-muted">${fmtDateTime(ev.at)}</span></span>
      </li>`;
    }).join('');

    $('#md').textContent = markdown(book);
  }

  const refresh = () => fetchBook(book.id).then(render).catch(showError);

  states.addEventListener('click', async (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-move]');
    if (!b || !isState(b.dataset.move)) return;
    await moveBook(book.id, b.dataset.move);
    refresh();
  });
  $('#resend').addEventListener('click', async () => {
    await sendToKindle(book.id);
    refresh();
  });

  $('#add-author').addEventListener('click', () => {
    fAuthors.insertAdjacentHTML('beforeend', authorRow(''));
    authorInputs().at(-1)?.focus();
    syncAddAuthor();
  });
  fAuthors.addEventListener('click', (e) => {
    const rm = (e.target as Element).closest('[data-remove-author]');
    if (!rm) return;
    rm.closest('[data-author]')?.remove();
    if (!authorInputs().length) fAuthors.insertAdjacentHTML('beforeend', authorRow(''));
    syncAddAuthor();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = fName.value.trim();
    const authors = authorInputs().map((i) => i.value.trim()).filter(Boolean);
    const type = isType(fType.value) ? fType.value : null;
    const score = fScore.value ? Number(fScore.value) : null;
    const yearText = fYear.value.trim();
    const year = yearText ? Number(yearText) : null;

    if (!name) { fName.focus(); toast('Escribe un título'); return; }
    if (!authors.length && book.authors.length) { toast('Agrega al menos un autor'); return; }
    if (year !== null && (!Number.isInteger(year) || year < 0 || year > new Date().getUTCFullYear())) { fYear.focus(); toast('Año no válido'); return; }

    const body: BookPatch = {};
    if (name !== book.title) body.name = name;
    if (authors.length && authors.join('\n') !== book.authors.join('\n')) body.authors = authors;
    if (type !== (book.type ?? null)) body.type = type;
    if (score !== (book.score ?? null)) body.score = score;
    if (year !== (book.year ?? null)) body.year = year;
    if (!Object.keys(body).length) { toast('Sin cambios'); return; }

    saveBtn.disabled = true;
    const updated = await updateBook(book.id, body);
    saveBtn.disabled = false;
    if (!updated) return;
    toast('Cambios guardados', 'check');
    await refresh();
    fillForm();
  });

  $('#delete').addEventListener('click', async () => {
    if (!confirm(`¿Borrar «${book.title}»? Se eliminan el EPUB, la portada y el historial.`)) return;
    if (await removeBook(book.id)) location.replace('/tablero');
  });

  $('#download').addEventListener('click', () => toast('La descarga estará disponible cuando conectes el servidor'));
  $('#copy-md').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(markdown(book));
      toast('Markdown copiado', 'check');
    } catch {
      toast('No se pudo copiar');
    }
  });

  onChange(render);
  render();
  fillForm();
  pollPending();
}

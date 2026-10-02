import { STATES, isState, load, getBook, moveBook, sendToKindle, onChange, resumePending, type Book } from './store';
import { $, esc, icon, coverHTML, fmtDate, fmtDateTime, fmtSize, pill, toast, ICON_SM, STATE_BTN } from './ui';

const markdown = (b: Book) => `---
title: ${b.title}
author: ${b.author}
status: ${b.state}
---

## Highlights

> [texto del highlight]
— Ubicación [###]`;

export function initDetail() {
  const books = load();
  const id = new URLSearchParams(location.search).get('id');
  let book = getBook(id) ?? books.find((b) => b.state === 'reading') ?? books[0];
  if (!book) { location.href = '/tablero'; return; }

  const states = $('#states');
  const kindlePill = $('#kindle-pill');

  function render() {
    book = getBook(book.id) ?? book;
    document.title = book.title + ' — Readflow';
    $('#cover').innerHTML = coverHTML(book, 'lg');
    document.querySelectorAll('[data-bind="title"]').forEach((el) => { el.textContent = book.title; });
    document.querySelectorAll('[data-bind="author"]').forEach((el) => { el.textContent = book.author; });
    $('#file-name').textContent = book.file.name;
    $('#file-meta').textContent = `${fmtSize(book.file.size)} · subido el ${fmtDate(book.added)}`;

    states.innerHTML = STATES.map((s) =>
      `<button type="button" class="${STATE_BTN}" data-state="${s.id}" data-move="${s.id}" aria-pressed="${book.state === s.id}">${s.name}</button>`).join('');

    const k = book.kindle;
    const [tone, text] = !k ? ['state', 'Sin enviar'] as const : k.status === 'sending' ? ['warn', 'Enviando…'] as const : ['ok', 'Entregado'] as const;
    kindlePill.className = pill(tone);
    kindlePill.textContent = text;

    const events = book.history.slice().reverse();
    $('#timeline').innerHTML = events.map((ev, i) => {
      const done = /Aceptado/.test(ev.text);
      const st = done || /Reading/.test(ev.text) ? 'reading' : /Email/.test(ev.text) ? 'upnext' : 'toread';
      return `<li class="flex gap-3 items-start">
        <span class="size-6 rounded-full shrink-0 grid place-items-center text-xs font-bold bg-s-bg text-s-ink" data-state="${st}">${done ? icon('check', ICON_SM) : events.length - i}</span>
        <span class="flex flex-col gap-0.5"><strong class="text-sm font-semibold">${esc(ev.text)}</strong><span class="text-[13px] text-muted">${fmtDateTime(ev.at)}</span></span>
      </li>`;
    }).join('');

    $('#md').textContent = markdown(book);
  }

  states.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-move]');
    if (b && isState(b.dataset.move)) moveBook(book.id, b.dataset.move);
  });
  $('#resend').addEventListener('click', () => { sendToKindle(book); render(); });
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
  resumePending();
}

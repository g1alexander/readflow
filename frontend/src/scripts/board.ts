import { STATES, isState, queryBooks, getBook, kindleErrorText, matchesQuery, moveBook, onChange, onReconnect, subscribe, showError, type Book, type StateId } from './store';
import { getSettings } from './api';
import { $, bindSearch, btn, esc, icon, coverHTML, fmtDate, pill, ICON_SM, STATE_BTN } from './ui';

const TOREAD_LIMIT = 5;
const OTHER_STATES = STATES.map((s) => s.id).filter((s) => s !== 'toread');

const detailHref = (b: Book) => `/libro?id=${encodeURIComponent(b.id)}`;

function cardHTML(b: Book, mobile: boolean) {
  const size = mobile ? 'items-center' : '';
  return `<a class="flex gap-2.5 p-2.5 bg-surface rounded-md no-underline text-ink hover:text-ink shadow-card hover:shadow-[0_2px_8px_rgba(43,40,64,.10)] select-none [-webkit-touch-callout:none] [&[draggable=true]]:cursor-grab data-dragging:opacity-45 ${size}" href="${detailHref(b)}" data-id="${esc(b.id)}" ${mobile ? '' : 'draggable="true"'}>
    ${coverHTML(b, 'xs')}
    <span class="flex flex-col gap-[3px] min-w-0">
      <span class="font-semibold leading-[1.25] ${mobile ? 'text-sm' : 'text-[13px]'}">${esc(b.title)}</span>
      <span class="text-muted ${mobile ? 'text-[13px]' : 'text-xs'}">${esc(b.author)}</span>
      ${ingestHTML(b)}
    </span>${mobile ? icon('chev', 'size-[18px] ml-auto text-[#8A85A0]') : ''}
  </a>`;
}

function ingestHTML(b: Book) {
  if (b.ingest === 'pending') return `<span class="${pill('warn')}">${icon('clock', ICON_SM)}Procesando…</span>`;
  if (b.ingest === 'failed') return `<span class="${pill('err')}">${esc(b.ingestError ?? 'Error al procesar')}</span>`;
  return '';
}

function kindleStatusHTML(b: Book) {
  const base = 'mt-auto flex items-center gap-1.5 text-[13px] font-medium max-md:text-xs max-md:font-semibold';
  if (b.kindle?.status === 'sending') return `<span class="${base} text-onhold-ink">${icon('clock', ICON_SM)}Enviando al Kindle…</span>`;
  if (b.kindle?.status === 'sent') return `<span class="${base} text-reading-ink">${icon('check', ICON_SM)}En tu Kindle desde el ${fmtDate(b.kindle.at)}</span>`;
  if (b.kindle?.status === 'failed') return `<span class="${base} text-err-ink">No se pudo enviar${b.kindle.error ? ': ' + esc(kindleErrorText(b.kindle.error)) : ' al Kindle'}</span>`;
  return `<span class="${base}">Aún no enviado</span>`;
}

export async function initBoard() {
  let toread: Book[] = [];
  let toreadMore = false;
  let others: Book[] = [];
  let query = '';
  let mobileTab: StateId = 'toread';
  let dragId: string | null = null;
  let generation = 0;

  const byState = (s: StateId) => (s === 'toread' ? toread : others.filter((b) => b.state === s));
  const countLabel = (s: StateId) => byState(s).length + (s === 'toread' && toreadMore ? '+' : '');
  const seeAllHTML = () => {
    const href = '/biblioteca?status=toread' + (query ? '&q=' + encodeURIComponent(query) : '');
    return `<a class="${btn('ghost')} min-h-9 text-[13px] text-s-ink hover:text-s-ink hover:bg-white/60" href="${esc(href)}">Ver todos ${icon('chev', ICON_SM)}</a>`;
  };

  const now = $('#now');
  const board = $('#board');
  const tabs = $('#tabs');
  const mlist = $('#mlist');
  const sheet = $<HTMLDialogElement>('#move-sheet');
  const sheetStates = $('#sheet-states');

  function render() {
    const reading = byState('reading');
    $('#summary').textContent = `${reading.length} leyendo ahora` + (query ? ` · resultados para «${query}»` : '');

    now.innerHTML = reading.length
      ? reading.map((b) => `
        <a class="flex gap-5 p-5 bg-surface border border-line rounded-[20px] no-underline text-ink hover:text-ink hover:border-[#d6cfe8] max-md:shrink-0 max-md:w-[270px] max-md:p-3.5 max-md:gap-3.5 max-md:rounded-lg" href="${detailHref(b)}">
          ${coverHTML(b, 'now')}
          <span class="flex flex-col gap-2 min-w-0">
            <span class="${pill()} max-md:hidden" data-state="reading">Reading</span>
            <span class="font-display font-bold text-[22px] tracking-[-0.01em] leading-[1.15] max-md:font-body max-md:text-[15px]">${esc(b.title)}</span>
            <span class="text-muted text-sm max-md:text-[13px]">${esc(b.author)}</span>
            ${kindleStatusHTML(b)}
          </span>
        </a>`).join('')
      : '<p class="p-[22px] rounded-[20px] border-2 border-dashed border-line-strong text-muted text-sm text-center">Nada en lectura. Mueve un libro a Reading y llegará a tu Kindle.</p>';

    board.innerHTML = STATES.map((s) => {
      const list = byState(s.id);
      return `<section class="bg-s-bg rounded-lg px-3 py-3.5 flex flex-col gap-2.5 min-h-[420px] border-2 border-transparent transition-colors data-over:border-s-ink data-over:border-dashed" data-state="${s.id}" data-column aria-label="${s.name}, ${list.length} libros">
        <div class="flex items-center justify-between px-1 pt-0.5 pb-1">
          <h3 class="flex items-center gap-2 font-bold text-sm text-s-ink"><span class="size-[9px] rounded-full bg-s-dot"></span>${s.name}</h3>
          <span class="text-xs font-bold text-s-ink bg-white/70 px-2 py-0.5 rounded-full">${countLabel(s.id)}</span>
        </div>
        ${list.map((b) => cardHTML(b, false)).join('') || '<p class="text-[13px] text-s-ink opacity-70 px-1 py-2">Suelta un libro aquí</p>'}
        ${s.id === 'toread' ? seeAllHTML() : ''}
      </section>`;
    }).join('');

    tabs.innerHTML = STATES.map((s) => `<button type="button" class="shrink-0 min-h-10 px-3.5 rounded-full border-2 border-line-soft bg-surface text-ink-2 text-[13px] font-bold whitespace-nowrap aria-selected:bg-s-bg aria-selected:text-s-ink aria-selected:border-s-ink" role="tab" data-state="${s.id}" data-tab="${s.id}" aria-selected="${s.id === mobileTab}">${s.name} · ${countLabel(s.id)}</button>`).join('');

    mlist.dataset.state = mobileTab;
    mlist.innerHTML = (byState(mobileTab).map((b) => cardHTML(b, true)).join('') ||
      '<p class="text-[13px] text-s-ink opacity-70 px-1 py-2">No hay libros en este estado</p>') +
      (mobileTab === 'toread' ? seeAllHTML() : '');

    const last = [...toread, ...others].filter((b) => b.kindle).sort((a, b) => b.kindle!.at.localeCompare(a.kindle!.at))[0];
    $('#kindle-last').textContent = last?.kindle ? `Último envío: ${last.title} · ${fmtDate(last.kindle.at)}` : 'Sin envíos todavía';
  }

  async function reload() {
    const current = ++generation;
    const q = query || undefined;
    try {
      const [first, rest] = await Promise.all([
        queryBooks({ status: ['toread'], limit: TOREAD_LIMIT, q }),
        queryBooks({ status: OTHER_STATES, q }),
      ]);
      if (current !== generation) return;
      toread = first.books;
      toreadMore = first.nextCursor !== null;
      others = rest.books;
      render();
    } catch (err) {
      showError(err);
    }
  }

  async function reloadToread() {
    const current = generation;
    try {
      const { books, nextCursor } = await queryBooks({ status: ['toread'], limit: TOREAD_LIMIT, q: query || undefined });
      if (current !== generation) return;
      toread = books;
      toreadMore = nextCursor !== null;
      render();
    } catch (err) {
      showError(err);
    }
  }

  function applyChange(book: Book | undefined, id: string) {
    const ti = toread.findIndex((b) => b.id === id);
    if (ti >= 0) toread.splice(ti, 1);
    const oi = others.findIndex((b) => b.id === id);
    if (oi >= 0) others.splice(oi, 1);
    if (book && matchesQuery(book, query)) {
      if (book.state !== 'toread') others.splice(oi >= 0 ? oi : 0, 0, book);
      else {
        toread.splice(ti >= 0 ? ti : 0, 0, book);
        if (toread.length > TOREAD_LIMIT) {
          toread.length = TOREAD_LIMIT;
          toreadMore = true;
        }
      }
    }
    render();
    if (ti >= 0 && !toread.some((b) => b.id === id)) reloadToread();
  }

  bindSearch((q) => { query = q; reload(); });

  tabs.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-tab]');
    if (!t || !isState(t.dataset.tab)) return;
    mobileTab = t.dataset.tab;
    render();
  });

  const clearOver = (except?: Element) => board.querySelectorAll('[data-over]').forEach((c) => c !== except && c.removeAttribute('data-over'));
  board.addEventListener('dragstart', (e) => {
    const card = (e.target as Element).closest<HTMLElement>('[data-id]');
    if (!card || !e.dataTransfer) return;
    dragId = card.dataset.id ?? null;
    card.toggleAttribute('data-dragging', true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId ?? '');
  });
  board.addEventListener('dragend', (e) => {
    (e.target as Element).closest('[data-id]')?.removeAttribute('data-dragging');
    clearOver();
  });
  board.addEventListener('dragover', (e) => {
    const col = (e.target as Element).closest('[data-column]');
    if (!col || !dragId) return;
    e.preventDefault();
    clearOver(col);
    col.toggleAttribute('data-over', true);
  });
  board.addEventListener('drop', (e) => {
    const col = (e.target as Element).closest<HTMLElement>('[data-column]');
    if (!col || !dragId || !isState(col.dataset.state)) return;
    e.preventDefault();
    const id = dragId;
    dragId = null;
    moveBook(id, col.dataset.state);
  });

  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressedId: string | null = null;
  let longPressed = false;
  mlist.addEventListener('pointerdown', (e) => {
    const card = (e.target as Element).closest<HTMLElement>('[data-id]');
    if (!card) return;
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      pressedId = card.dataset.id ?? null;
      openSheet(pressedId);
    }, 480);
  });
  (['pointerup', 'pointerleave', 'pointercancel'] as const).forEach((ev) => mlist.addEventListener(ev, () => clearTimeout(pressTimer)));
  mlist.addEventListener('click', (e) => { if (longPressed) { e.preventDefault(); longPressed = false; } });
  mlist.addEventListener('contextmenu', (e) => { if ((e.target as Element).closest('[data-id]')) e.preventDefault(); });

  function openSheet(id: string | null) {
    const b = getBook(id);
    if (!b) return;
    $('#sheet-title').textContent = b.title;
    sheetStates.innerHTML = STATES.map((s) =>
      `<button type="button" class="${STATE_BTN}" data-state="${s.id}" data-move="${s.id}" aria-pressed="${b.state === s.id}">${s.name}</button>`).join('');
    sheet.showModal();
  }
  sheetStates.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-move]');
    if (!btn || !pressedId || !isState(btn.dataset.move)) return;
    moveBook(pressedId, btn.dataset.move);
    sheet.close();
  });
  $('#sheet-close').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

  onChange(applyChange);
  onReconnect(reload);
  render();
  getSettings()
    .then((s) => {
      $('#kindle-card').dataset.state = s.kindleEmail ? 'reading' : 'onhold';
      $('#kindle-status').textContent = s.kindleEmail ? 'Kindle conectado' : 'Kindle sin configurar';
      $('#kindle-email').textContent = s.kindleEmail ?? 'Agrega tu correo en Ajustes';
    })
    .catch(showError);
  await reload();
  subscribe();
}

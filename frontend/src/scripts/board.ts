import { STATES, isState, load, getBook, moveBook, onChange, resumePending, type Book, type StateId } from './store';
import { $, esc, icon, coverHTML, fmtDate, pill, ICON_SM, STATE_BTN } from './ui';

const detailHref = (b: Book) => `/libro?id=${encodeURIComponent(b.id)}`;

function cardHTML(b: Book, mobile: boolean) {
  const size = mobile ? 'items-center' : '';
  return `<a class="flex gap-2.5 p-2.5 bg-surface rounded-md no-underline text-ink hover:text-ink shadow-card hover:shadow-[0_2px_8px_rgba(43,40,64,.10)] select-none [-webkit-touch-callout:none] [&[draggable=true]]:cursor-grab data-dragging:opacity-45 ${size}" href="${detailHref(b)}" data-id="${esc(b.id)}" ${mobile ? '' : 'draggable="true"'}>
    ${coverHTML(b, 'xs')}
    <span class="flex flex-col gap-[3px] min-w-0">
      <span class="font-semibold leading-[1.25] ${mobile ? 'text-sm' : 'text-[13px]'}">${esc(b.title)}</span>
      <span class="text-muted ${mobile ? 'text-[13px]' : 'text-xs'}">${esc(b.author)}</span>
    </span>${mobile ? icon('chev', 'size-[18px] ml-auto text-[#8A85A0]') : ''}
  </a>`;
}

function kindleStatusHTML(b: Book) {
  const base = 'mt-auto flex items-center gap-1.5 text-[13px] font-medium max-md:text-xs max-md:font-semibold';
  if (b.kindle?.status === 'sending') return `<span class="${base} text-onhold-ink">${icon('clock', ICON_SM)}Enviando al Kindle…</span>`;
  if (b.kindle?.status === 'delivered') return `<span class="${base} text-reading-ink">${icon('check', ICON_SM)}En tu Kindle desde el ${fmtDate(b.kindle.at)}</span>`;
  return `<span class="${base}">Aún no enviado</span>`;
}

export function initBoard() {
  const books = load();
  let query = '';
  let mobileTab: StateId = 'toread';
  let dragId: string | null = null;

  const matches = (b: Book) => !query || (b.title + ' ' + b.author).toLowerCase().includes(query);
  const byState = (s: StateId) => books.filter((b) => b.state === s && matches(b));

  const now = $('#now');
  const board = $('#board');
  const tabs = $('#tabs');
  const mlist = $('#mlist');
  const sheet = $<HTMLDialogElement>('#move-sheet');
  const sheetStates = $('#sheet-states');

  function render() {
    const reading = books.filter((b) => b.state === 'reading');
    $('#summary').textContent = `${books.length} ${books.length === 1 ? 'libro' : 'libros'} en tu biblioteca · ${reading.length} leyendo ahora`;

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
          <span class="text-xs font-bold text-s-ink bg-white/70 px-2 py-0.5 rounded-full">${list.length}</span>
        </div>
        ${list.map((b) => cardHTML(b, false)).join('') || '<p class="text-[13px] text-s-ink opacity-70 px-1 py-2">Suelta un libro aquí</p>'}
      </section>`;
    }).join('');

    tabs.innerHTML = STATES.map((s) => `<button type="button" class="shrink-0 min-h-10 px-3.5 rounded-full border-2 border-line-soft bg-surface text-ink-2 text-[13px] font-bold whitespace-nowrap aria-selected:bg-s-bg aria-selected:text-s-ink aria-selected:border-s-ink" role="tab" data-state="${s.id}" data-tab="${s.id}" aria-selected="${s.id === mobileTab}">${s.name} · ${byState(s.id).length}</button>`).join('');

    mlist.dataset.state = mobileTab;
    mlist.innerHTML = byState(mobileTab).map((b) => cardHTML(b, true)).join('') ||
      '<p class="text-[13px] text-s-ink opacity-70 px-1 py-2">No hay libros en este estado</p>';

    const last = books.filter((b) => b.kindle).sort((a, b) => b.kindle!.at.localeCompare(a.kindle!.at))[0];
    $('#kindle-last').textContent = last?.kindle ? `Último envío: ${last.title} · ${fmtDate(last.kindle.at)}` : 'Sin envíos todavía';
  }

  const search = $<HTMLInputElement>('#search');
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); render(); });
  $('#search-toggle').addEventListener('click', () => {
    $('#search-box').toggleAttribute('data-open');
    search.focus();
  });

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

  onChange(render);
  render();
  resumePending();
}

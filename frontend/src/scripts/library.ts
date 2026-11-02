import { STATES, TYPES, NO_TYPE, isState, isType, typeOf, stateName, matchesQuery, queryBooks, onChange, onReconnect, subscribe, showError, type Book, type TypeFilter } from './store';
import { $, bindSearch, esc, coverHTML, CHIP, STATE_CHIP, TYPE_CHIP } from './ui';

const PAGE_SIZE = 24;

const isTypeFilter = (v: string): v is TypeFilter => v === NO_TYPE || isType(v);
const csv = (v: string | null) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

function tileHTML(b: Book) {
  const type = typeOf(b.type);
  return `<a class="group relative block rounded-[10px] no-underline text-ink hover:text-ink focus-visible:outline-offset-4" href="/libro?id=${encodeURIComponent(b.id)}" data-id="${esc(b.id)}" aria-label="${esc(b.title)} — ${esc(b.author)}">
    ${coverHTML(b, 'grid')}
    <span class="absolute inset-0 rounded-[10px] bg-ink/85 text-white p-3 flex flex-col justify-end gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
      <span class="font-display font-bold text-base leading-[1.15]">${esc(b.title)}</span>
      <span class="text-xs opacity-90">${esc(b.author)}</span>
      <span class="flex flex-wrap gap-1.5 mt-1">
        <span class="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/15"><span class="size-2 rounded-full bg-(--t)" style="--t:${type?.color ?? '#8A85A0'}"></span>${esc(type?.name ?? 'Sin categoría')}</span>
        <span class="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-s-bg text-s-ink" data-state="${b.state}">${stateName(b.state)}</span>
      </span>
    </span>
  </a>`;
}

export async function initLibrary() {
  const params = new URLSearchParams(location.search);
  const types = new Set(csv(params.get('type')).filter(isTypeFilter));
  const statuses = new Set(csv(params.get('status')).filter(isState));
  let query = (params.get('q') ?? '').trim();

  let books: Book[] = [];
  let cursor: string | null = null;
  let done = false;
  let loading = false;
  let failed = false;
  let generation = 0;

  const grid = $('#grid');
  const status = $('#grid-status');
  const typeChips = $('#type-chips');
  const statusChips = $('#status-chips');

  const matches = (b: Book) =>
    (!types.size || types.has(b.type ?? NO_TYPE)) && (!statuses.size || statuses.has(b.state)) && matchesQuery(b, query);

  function syncUrl() {
    const next = new URLSearchParams();
    if (types.size) next.set('type', [...types].join(','));
    if (statuses.size) next.set('status', [...statuses].join(','));
    if (query) next.set('q', query);
    const qs = next.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  function renderChips() {
    typeChips.innerHTML = [
      ...TYPES.map((t) => ({ id: t.id as TypeFilter, name: t.name, color: t.color })),
      { id: NO_TYPE as TypeFilter, name: 'Sin categoría', color: '#C9C4D6' },
    ].map((t) => `<button type="button" class="${TYPE_CHIP}" style="--t:${t.color}" data-type="${t.id}" aria-pressed="${types.has(t.id)}"><span class="size-2.5 rounded-full bg-(--t)"></span>${esc(t.name)}</button>`).join('');
    statusChips.innerHTML = STATES.map((s) =>
      `<button type="button" class="${STATE_CHIP}" data-state="${s.id}" data-status="${s.id}" aria-pressed="${statuses.has(s.id)}"><span class="size-2 rounded-full bg-s-dot"></span>${s.name}</button>`).join('') +
      (types.size || statuses.size ? `<button type="button" class="${CHIP} border-transparent bg-transparent text-muted hover:text-ink" data-clear>Limpiar filtros</button>` : '');
  }

  function render() {
    grid.innerHTML = books.map(tileHTML).join('');
    const n = books.length;
    $('#summary').textContent = n ? `${n}${done ? '' : '+'} ${n === 1 ? 'libro' : 'libros'}` + (query ? ` para «${query}»` : '') : '';
    status.textContent = failed ? 'No se pudieron cargar más libros.' : loading ? 'Cargando…' : !n ? 'No hay libros con estos filtros.' : '';
  }

  async function loadMore() {
    if (loading || done) return;
    loading = true;
    failed = false;
    render();
    const current = generation;
    try {
      const page = await queryBooks({
        limit: PAGE_SIZE,
        cursor,
        type: [...types],
        status: [...statuses],
        q: query || undefined,
      });
      if (current !== generation) return;
      const seen = new Set(books.map((b) => b.id));
      books.push(...page.books.filter((b) => !seen.has(b.id)));
      cursor = page.nextCursor;
      done = cursor === null;
    } catch (err) {
      if (current !== generation) return;
      failed = true;
      showError(err);
    } finally {
      if (current === generation) {
        loading = false;
        render();
        if (!failed) checkSentinel();
      }
    }
  }

  function reset() {
    generation++;
    books = [];
    cursor = null;
    done = false;
    loading = false;
    syncUrl();
    renderChips();
    loadMore();
  }

  const sentinel = $('#sentinel');
  let sentinelVisible = false;
  const observer = new IntersectionObserver(([entry]) => {
    sentinelVisible = entry.isIntersecting;
    if (sentinelVisible) loadMore();
  }, { rootMargin: '600px 0px' });
  observer.observe(sentinel);
  const checkSentinel = () => { if (sentinelVisible) loadMore(); };

  typeChips.addEventListener('click', (e) => {
    const chip = (e.target as Element).closest<HTMLElement>('[data-type]');
    const id = chip?.dataset.type;
    if (!id || !isTypeFilter(id)) return;
    if (!types.delete(id)) types.add(id);
    reset();
  });
  statusChips.addEventListener('click', (e) => {
    const target = e.target as Element;
    if (target.closest('[data-clear]')) {
      types.clear();
      statuses.clear();
      return reset();
    }
    const id = target.closest<HTMLElement>('[data-status]')?.dataset.status;
    if (!isState(id)) return;
    if (!statuses.delete(id)) statuses.add(id);
    reset();
  });

  bindSearch((q) => { query = q; reset(); }, query);

  onChange((book, id) => {
    const i = books.findIndex((b) => b.id === id);
    if (book && matches(book)) {
      if (i >= 0) books[i] = book;
      else books.unshift(book);
    } else if (i >= 0) books.splice(i, 1);
    render();
  });
  onReconnect(reset);

  reset();
  subscribe();
}

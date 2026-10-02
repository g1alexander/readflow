const ICON_PATHS = {
  doc: [1.8, '<path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 13h8M8 17h5"/>'],
  board: [1.8, '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>'],
  library: [1.8, '<path d="M5 4h3v16H5zM10 4h3v16h-3zM15.5 5l3-.8 3.6 15-3 .8z"/>'],
  notes: [1.8, '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h5"/>'],
  settings: [1.8, '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'],
  search: [2, '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'],
  upload: [2, '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'],
  tray: [1.8, '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'],
  plus: [2.2, '<path d="M12 5v14M5 12h14"/>'],
  mail: [2, '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>'],
  check: [2.2, '<path d="M20 6 9 17l-5-5"/>'],
  clock: [2, '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  chev: [2, '<path d="m9 18 6-6-6-6"/>'],
  back: [2, '<path d="M15 18 9 12l6-6"/>'],
} as const;

export type IconName = keyof typeof ICON_PATHS;
export const ICON = 'size-[18px]';
export const ICON_SM = 'size-[15px]';

export function icon(name: IconName, cls = ICON): string {
  const [sw, body] = ICON_PATHS[name];
  return `<svg class="shrink-0 ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const NAV: { label: string; icon: IconName; href?: string }[] = [
  { label: 'Tablero', icon: 'board', href: '/tablero' },
  { label: 'Biblioteca', icon: 'library' },
  { label: 'Notas', icon: 'notes' },
  { label: 'Ajustes', icon: 'settings' },
];

const BTN_BASE = 'inline-flex items-center justify-center gap-2 rounded-md border no-underline whitespace-nowrap transition-colors disabled:opacity-55 disabled:cursor-not-allowed aria-disabled:opacity-55 aria-disabled:cursor-not-allowed';
const BTN_VARIANT = {
  primary: 'border-transparent bg-ink text-white font-semibold hover:bg-[#3b3756] hover:text-white disabled:bg-[#a7a3b8]',
  soft: 'border-transparent bg-toread-bg text-toread-ink font-bold hover:bg-[#e1daf7] hover:text-toread-ink',
  sky: 'border-transparent bg-upnext-bg text-upnext-ink font-bold',
  outline: 'border-line-strong bg-surface text-ink font-semibold hover:border-[#c3bbd8] hover:text-ink',
  ghost: 'border-transparent bg-transparent text-ink-2 font-semibold hover:bg-soft hover:text-ink',
};
const BTN_SIZE = {
  md: 'min-h-11 px-[18px] text-sm',
  block: 'w-full min-h-[50px] px-[18px] text-[15px]',
  icon: 'size-11',
};
export type BtnVariant = keyof typeof BTN_VARIANT;
export type BtnSize = keyof typeof BTN_SIZE;
export const btn = (v: BtnVariant = 'primary', s: BtnSize = 'md') => `${BTN_BASE} ${BTN_VARIANT[v]} ${BTN_SIZE[s]}`;

const PILL_TONE = {
  state: 'bg-s-bg text-s-ink',
  warn: 'bg-onhold-bg text-onhold-ink',
  ok: 'bg-reading-bg text-reading-ink',
  err: 'bg-err-bg text-err-ink',
};
export type PillTone = keyof typeof PILL_TONE;
export const pill = (t: PillTone = 'state') => `inline-flex items-center gap-1.5 self-start text-xs font-bold px-2.5 py-1 rounded-full ${PILL_TONE[t]}`;

export const DISPLAY = 'font-display font-bold tracking-[-0.025em]';
export const PAGE_TITLE = `${DISPLAY} leading-[1.05] text-[40px] max-md:text-[28px]`;
export const SUBTITLE = 'text-muted';
export const SECTION_TITLE = 'text-[13px] font-bold tracking-[.06em] text-muted';
export const CARD_TITLE = 'text-lg font-bold';
export const FIELD_FOCUS = 'focus:outline-none focus:border-toread-dot focus:ring-3 focus:ring-toread-bg';
export const STATE_BTN = 'min-h-11 px-[18px] rounded-full border-2 border-line-soft bg-surface text-ink-2 text-sm font-bold hover:not-aria-pressed:border-s-dot aria-pressed:bg-s-bg aria-pressed:text-s-ink aria-pressed:border-s-ink max-md:px-1.5 max-md:rounded-md max-md:text-[13px]';
export const STATES_ROW = 'flex flex-wrap gap-2 max-md:grid max-md:grid-cols-3';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]
));
export const fmtSize = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? mb.toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
};
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (iso: string) => fmtDate(iso) + ', ' + fmtTime(iso);

export interface CoverData { title: string; author: string; bg: string; ink: string; cover: string | null }

const COVER = {
  xs: { box: 'w-[38px] p-[5px] justify-end rounded-[4px]', title: 'text-base leading-none', author: '' },
  queue: { box: 'w-[52px] max-md:w-[46px] p-[5px] justify-end rounded-[4px]', title: 'text-base leading-none', author: '' },
  now: { box: 'w-[92px] px-2.5 py-3 rounded-[6px] max-md:w-16 max-md:p-2', title: 'text-[13px] leading-[1.08] max-md:text-[10px]', author: 'text-[9px] max-md:hidden' },
  lg: { box: 'w-full px-6 py-7 rounded-[10px] shadow-cover max-md:w-28 max-md:px-2.5 max-md:py-3 max-md:rounded-[8px]', title: 'text-[34px] leading-[1.08] max-md:text-[15px]', author: 'text-sm max-md:text-[9px]' },
};
export type CoverSize = keyof typeof COVER;

export function coverHTML(c: CoverData, size: CoverSize): string {
  const s = COVER[size];
  const img = c.cover ? `<img class="absolute inset-0 size-full object-cover" src="${esc(c.cover)}" alt="">` : '';
  const initialOnly = !s.author;
  return `<div class="relative shrink-0 overflow-hidden flex flex-col justify-between aspect-[2/3] bg-(--c-bg) text-(--c-ink) ${s.box}" style="--c-bg:${esc(c.bg)};--c-ink:${esc(c.ink)}" aria-hidden="true">${img}
    <span class="font-display font-bold tracking-[-0.01em] ${s.title}">${esc(initialOnly ? c.title.charAt(0) : c.title)}</span>
    ${initialOnly ? '' : `<span class="font-semibold opacity-90 ${s.author}">${esc(c.author)}</span>`}</div>`;
}

export function toast(msg: string, iconName?: IconName) {
  let wrap = document.querySelector<HTMLElement>('[data-toasts]');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.dataset.toasts = '';
    wrap.className = 'fixed left-1/2 bottom-6 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none w-max max-w-[calc(100%-32px)]';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'flex items-center gap-2.5 px-4 py-3 rounded-[14px] bg-ink text-white text-sm font-semibold shadow-[0_10px_28px_rgba(43,40,64,.25)] animate-toast-in';
  el.innerHTML = (iconName ? icon(iconName, ICON_SM) : '') + '<span>' + esc(msg) + '</span>';
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Falta ${sel}`);
  return el;
};

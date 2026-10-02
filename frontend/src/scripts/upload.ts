import { STATES, isState, load, addBooks, sendToKindle, colorFor, uid, stateName, type Book, type StateId } from './store';
import { $, esc, coverHTML, fmtSize, pill, toast, FIELD_FOCUS } from './ui';

interface QueueItem { key: string; file: File; title: string; state: StateId }

const titleFromName = (name: string) => name.replace(/\.epub$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

export function initUpload() {
  load();
  const queue: QueueItem[] = [];
  const dz = $('#dropzone');
  const input = $<HTMLInputElement>('#files');
  const list = $('#queue-list');
  const hint = $('#reading-hint');
  const saveBtn = $<HTMLButtonElement>('#save');

  const syncHint = () => { hint.hidden = !queue.some((q) => q.state === 'reading'); };

  function addFiles(files: FileList | null) {
    const epubs = Array.from(files ?? []).filter((f) => /\.epub$/i.test(f.name) && f.size > 0);
    if (!epubs.length) { toast('Solo se aceptan archivos .epub'); return; }
    epubs.forEach((file) => queue.push({ key: uid(), file, title: titleFromName(file.name) || file.name, state: 'toread' }));
    render();
  }

  function render() {
    $('#queue').hidden = queue.length === 0;
    $('#queue-title').textContent = `${queue.length} ${queue.length === 1 ? 'archivo' : 'archivos'}`;

    list.innerHTML = queue.map((q) => {
      const [bg, ink] = colorFor(q.title);
      return `<div class="grid grid-cols-[52px_minmax(0,1fr)_150px_170px] gap-[18px] items-center py-3.5 border-t border-[#EFECF5] max-md:grid-cols-[46px_minmax(0,1fr)] max-md:gap-3" data-key="${q.key}">
        ${coverHTML({ title: q.title, author: '', bg, ink, cover: null }, 'queue')}
        <div class="flex flex-col gap-1.5 min-w-0">
          <span class="font-bold text-[15px] truncate">${esc(q.title)}</span>
          <span class="text-xs text-muted-2">${esc(q.file.name)} · ${fmtSize(q.file.size)}</span>
        </div>
        <span class="${pill('ok')} max-md:col-start-2">Listo para subir</span>
        <div class="flex flex-col gap-1 max-md:col-span-full max-md:flex-row max-md:items-center max-md:justify-between">
          <label class="text-xs font-semibold text-muted" for="s-${q.key}">Estado inicial</label>
          <select class="h-10 px-3.5 rounded-sm border border-line-strong bg-[#FBFAFD] text-sm w-full ${FIELD_FOCUS} max-md:w-40 max-md:h-11 max-md:text-[15px]" id="s-${q.key}" data-field="state">
            ${STATES.map((s) => `<option value="${s.id}" ${s.id === q.state ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
      </div>`;
    }).join('');

    saveBtn.disabled = queue.length === 0;
    saveBtn.textContent = queue.length ? `Agregar ${queue.length} ${queue.length === 1 ? 'libro' : 'libros'} a la biblioteca` : 'Agregar a la biblioteca';
    syncHint();
  }

  list.addEventListener('change', (e) => {
    const el = e.target as HTMLSelectElement;
    const q = queue.find((x) => x.key === el.closest<HTMLElement>('[data-key]')?.dataset.key);
    if (q && el.dataset.field === 'state' && isState(el.value)) {
      q.state = el.value;
      syncHint();
    }
  });

  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  (['dragenter', 'dragover'] as const).forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.toggleAttribute('data-over', true); }));
  (['dragleave', 'drop'] as const).forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.removeAttribute('data-over'); }));
  dz.addEventListener('drop', (e) => addFiles(e.dataTransfer?.files ?? null));

  saveBtn.addEventListener('click', () => {
    const now = new Date().toISOString();
    const added: Book[] = queue.map((q) => {
      const [bg, ink] = colorFor(q.title);
      return {
        id: uid(), title: q.title, author: 'Autor desconocido', state: q.state, bg, ink, cover: null,
        file: { name: q.file.name, size: q.file.size },
        added: now, history: [{ at: now, text: 'Agregado a la biblioteca en ' + stateName(q.state) }],
        kindle: null,
      };
    });
    addBooks(added);
    const toSend = added.filter((b) => b.state === 'reading');
    toSend.forEach(sendToKindle);
    setTimeout(() => { window.location.href = '/tablero'; }, toSend.length ? 900 : 0);
  });

  render();
}

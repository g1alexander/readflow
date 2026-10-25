import { colorFor, uid } from './store';
import { createUpload, putFile } from './api';
import { $, esc, coverHTML, fmtSize, pill, toast, type PillTone } from './ui';

const MAX_SIZE = 100 * 1024 * 1024;

type Status = 'ready' | 'uploading' | 'failed';
interface QueueItem { key: string; file: File; title: string; status: Status }

const STATUS: Record<Status, [PillTone, string]> = {
  ready: ['ok', 'Listo para subir'],
  uploading: ['state', 'Subiendo…'],
  failed: ['err', 'Error al subir'],
};

const titleFromName = (name: string) => name.replace(/\.epub$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

export function initUpload() {
  let queue: QueueItem[] = [];
  let busy = false;
  const dz = $('#dropzone');
  const input = $<HTMLInputElement>('#files');
  const list = $('#queue-list');
  const saveBtn = $<HTMLButtonElement>('#save');

  function addFiles(files: FileList | null) {
    if (busy) return;
    const all = Array.from(files ?? []);
    const epubs = all.filter((f) => /\.epub$/i.test(f.name) && f.size > 0);
    const valid = epubs.filter((f) => f.size <= MAX_SIZE);
    if (!epubs.length) { toast('Solo se aceptan archivos .epub'); return; }
    if (valid.length < epubs.length) toast('Los archivos de más de 100 MB no se suben');
    valid.forEach((file) => queue.push({ key: uid(), file, title: titleFromName(file.name) || file.name, status: 'ready' }));
    render();
  }

  function render() {
    $('#queue').hidden = queue.length === 0;
    $('#queue-title').textContent = `${queue.length} ${queue.length === 1 ? 'archivo' : 'archivos'}`;

    list.innerHTML = queue.map((q) => {
      const [bg, ink] = colorFor(q.title);
      const [tone, label] = STATUS[q.status];
      return `<div class="grid grid-cols-[52px_minmax(0,1fr)_150px] gap-[18px] items-center py-3.5 border-t border-[#EFECF5] max-md:grid-cols-[46px_minmax(0,1fr)] max-md:gap-3" data-key="${q.key}">
        ${coverHTML({ title: q.title, author: '', bg, ink, cover: null }, 'queue')}
        <div class="flex flex-col gap-1.5 min-w-0">
          <span class="font-bold text-[15px] truncate">${esc(q.title)}</span>
          <span class="text-xs text-muted-2">${esc(q.file.name)} · ${fmtSize(q.file.size)}</span>
        </div>
        <span class="${pill(tone)} max-md:col-start-2">${label}</span>
      </div>`;
    }).join('');

    saveBtn.disabled = busy || queue.length === 0;
    saveBtn.textContent = busy ? 'Subiendo…' : queue.length ? `Agregar ${queue.length} ${queue.length === 1 ? 'libro' : 'libros'} a la biblioteca` : 'Agregar a la biblioteca';
  }

  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  (['dragenter', 'dragover'] as const).forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.toggleAttribute('data-over', true); }));
  (['dragleave', 'drop'] as const).forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.removeAttribute('data-over'); }));
  dz.addEventListener('drop', (e) => addFiles(e.dataTransfer?.files ?? null));

  saveBtn.addEventListener('click', async () => {
    busy = true;
    const done = new Set<string>();
    for (const q of queue) {
      q.status = 'uploading';
      render();
      try {
        const { upload } = await createUpload(q.file);
        await putFile(upload, q.file);
        done.add(q.key);
      } catch (err) {
        console.error(err);
        q.status = 'failed';
      }
    }
    busy = false;
    queue = queue.filter((q) => !done.has(q.key));
    if (!queue.length) { window.location.href = '/tablero'; return; }
    toast(`${queue.length} ${queue.length === 1 ? 'archivo no se pudo subir' : 'archivos no se pudieron subir'}`);
    render();
  });

  render();
}

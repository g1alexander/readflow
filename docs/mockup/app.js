/* =========================================================
   Readflow — lógica del front
   ---------------------------------------------------------
   Esta versión guarda todo en el navegador (localStorage)
   para que la maqueta funcione sin servidor. Los puntos donde
   va tu backend están marcados con  // BACKEND:
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Estados de lectura ---------- */
  const STATES = [
    { id: 'toread',   name: 'To Read' },
    { id: 'upnext',   name: 'Up Next' },
    { id: 'reading',  name: 'Reading' },
    { id: 'onhold',   name: 'On Hold' },
    { id: 'finished', name: 'Finished' },
    { id: 'dropped',  name: 'Dropped' }
  ];
  const stateName = (id) => (STATES.find((s) => s.id === id) || STATES[0]).name;

  /* Colores para portadas generadas (cuando el EPUB no trae portada) */
  const COVER_COLORS = [
    ['#CFE8DC', '#1F4A37'], ['#F8D9C8', '#6E3318'], ['#E2DAF6', '#433683'],
    ['#D6E6F7', '#2A4E75'], ['#F6E7A8', '#6B4F0E'], ['#F7D2DC', '#7A2E44'],
    ['#D5EFE3', '#1F5A40'], ['#FBEDB8', '#6B4F0E'], ['#E9E6EE', '#4A4660']
  ];
  const colorFor = (text) => {
    let h = 0;
    for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COVER_COLORS[h % COVER_COLORS.length];
  };

  /* ---------- Utilidades ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmtSize = (bytes) => {
    if (!bytes && bytes !== 0) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? mb.toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  };
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const fmtDateTime = (iso) => fmtDate(iso) + ', ' + fmtTime(iso);

  const ICONS = {
    check: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    clock: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    mail: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>',
    chev: '<svg class="icon chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
  };

  /* ---------- Configuración ---------- */
  const CONFIG = {
    kindleEmail: '[tu-correo]@kindle.com' // BACKEND: vendrá de Ajustes
  };

  /* ---------- Datos de ejemplo ---------- */
  function seed() {
    const now = Date.now();
    const day = 86400000;
    const mk = (title, author, state, daysAgo, extra = {}) => {
      const [bg, ink] = colorFor(title);
      const added = new Date(now - daysAgo * day).toISOString();
      return {
        id: uid(), title, author, state, bg, ink, cover: null,
        file: { name: title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-') + '.epub', size: 1200000 + (title.length * 91234) },
        added, history: [{ at: added, text: 'Agregado a la biblioteca' }],
        kindle: null, ...extra
      };
    };
    const sentAt = new Date(now - 2 * day).toISOString();
    const palette = {
      'Cien años de soledad': ['#F6E7A8', '#6B4F0E'], 'El infinito en un junco': ['#D6E6F7', '#2A4E75'],
      'Project Hail Mary': ['#F7D2DC', '#7A2E44'], 'Klara y el Sol': ['#D5EFE3', '#1F5A40'],
      'Piranesi': ['#E2DAF6', '#433683'], 'La península de las casas vacías': ['#F9DCCB', '#6E3318'],
      'El nombre del viento': ['#CFE8DC', '#1F4A37'], 'Pedro Páramo': ['#F8D9C8', '#6E3318'],
      'Middlemarch': ['#DCE9F7', '#244E78'], 'Tomás Nevinson': ['#E5DDF7', '#433683'],
      'Hábitos atómicos': ['#FBEDB8', '#6B4F0E'], 'La vegetariana': ['#D5EFE3', '#1F5A40'],
      'Ulises': ['#E9E6EE', '#4A4660']
    };
    return withPalette(palette, [
      mk('Cien años de soledad', 'Gabriel García Márquez', 'toread', 30),
      mk('El infinito en un junco', 'Irene Vallejo', 'toread', 26),
      mk('Project Hail Mary', 'Andy Weir', 'toread', 20),
      mk('Klara y el Sol', 'Kazuo Ishiguro', 'toread', 12),
      mk('Piranesi', 'Susanna Clarke', 'upnext', 18),
      mk('La península de las casas vacías', 'David Uclés', 'upnext', 9),
      mk('El nombre del viento', 'Patrick Rothfuss', 'reading', 28, {
        kindle: { status: 'delivered', at: sentAt },
        history: [
          { at: new Date(now - 28 * day).toISOString(), text: 'Agregado a la biblioteca' },
          { at: sentAt, text: 'Movido a Reading' },
          { at: sentAt, text: 'Email enviado a ' + CONFIG.kindleEmail },
          { at: sentAt, text: 'Aceptado por el servidor de correo' }
        ]
      }),
      mk('Pedro Páramo', 'Juan Rulfo', 'reading', 6, { kindle: { status: 'sending', at: new Date().toISOString() } }),
      mk('Middlemarch', 'George Eliot', 'onhold', 60),
      mk('Tomás Nevinson', 'Javier Marías', 'finished', 90),
      mk('Hábitos atómicos', 'James Clear', 'finished', 120),
      mk('La vegetariana', 'Han Kang', 'finished', 75),
      mk('Ulises', 'James Joyce', 'dropped', 200)
    ]);
  }
  function withPalette(palette, list) {
    list.forEach((b) => { if (palette[b.title]) [b.bg, b.ink] = palette[b.title]; });
    return list;
  }

  /* ---------- Almacenamiento ----------
     BACKEND: reemplaza load/save por llamadas a tu API
     (GET /books, PATCH /books/:id, POST /books).            */
  const KEY = 'readflow:books:v1';
  let books = [];
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      books = raw ? JSON.parse(raw) : seed();
      if (!raw) save();
    } catch (e) {
      books = seed();
    }
    return books;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(books)); }
    catch (e) { toast('No se pudo guardar en este navegador'); }
  }
  const getBook = (id) => books.find((b) => b.id === id);

  /* ---------- Toasts ---------- */
  function toast(msg, icon = '') {
    let wrap = $('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = icon + '<span>' + esc(msg) + '</span>';
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  /* ---------- Envío al Kindle ----------
     BACKEND: aquí llamarías a POST /books/:id/send-to-kindle.
     El servidor adjunta el EPUB y lo envía por email a la
     dirección de "Send to Kindle". Ahora solo se simula.       */
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());

  function sendToKindle(book) {
    const at = new Date().toISOString();
    book.kindle = { status: 'sending', at };
    book.history.push({ at, text: 'Email enviado a ' + CONFIG.kindleEmail });
    save();
    toast('Enviando «' + book.title + '» a tu Kindle…', ICONS.mail);
    setTimeout(() => {
      const fresh = getBook(book.id);
      if (!fresh) return;
      const done = new Date().toISOString();
      fresh.kindle = { status: 'delivered', at: done };
      fresh.history.push({ at: done, text: 'Aceptado por el servidor de correo' });
      save();
      toast('Listo: ya está en tu Kindle', ICONS.check);
      notify();
    }, 2200);
  }

  function moveBook(id, state) {
    const book = getBook(id);
    if (!book || book.state === state) return;
    const prev = book.state;
    book.state = state;
    book.history.push({ at: new Date().toISOString(), text: 'Movido de ' + stateName(prev) + ' a ' + stateName(state) });
    save();
    if (state === 'reading') sendToKindle(book);
    else toast('Movido a ' + stateName(state));
    notify();
  }

  /* Al recargar, un envío que quedó "enviando" se completa */
  function resumePending() {
    books.filter((b) => b.kindle && b.kindle.status === 'sending').forEach((b) => {
      setTimeout(() => {
        b.kindle = { status: 'delivered', at: new Date().toISOString() };
        b.history.push({ at: b.kindle.at, text: 'Aceptado por el servidor de correo' });
        save(); notify();
      }, 2500);
    });
  }

  /* ---------- Portadas ---------- */
  function coverHTML(book, size) {
    const style = `--c-bg:${book.bg};--c-ink:${book.ink}`;
    const img = book.cover ? `<img src="${esc(book.cover)}" alt="">` : '';
    if (size === 'xs') {
      return `<div class="cover cover-xs" style="${style}" aria-hidden="true">${img}<span class="cover-title">${esc(book.title.charAt(0))}</span></div>`;
    }
    return `<div class="cover cover-${size}" style="${style}" aria-hidden="true">${img}
      <span class="cover-title">${esc(book.title)}</span>
      <span class="cover-author">${esc(book.author)}</span></div>`;
  }

  function kindleStatusHTML(book) {
    if (book.kindle && book.kindle.status === 'sending') {
      return `<span class="now-status is-sending">${ICONS.clock}Enviando al Kindle…</span>`;
    }
    if (book.kindle && book.kindle.status === 'delivered') {
      return `<span class="now-status is-ok">${ICONS.check}En tu Kindle desde el ${fmtDate(book.kindle.at)}</span>`;
    }
    return `<span class="now-status">Aún no enviado</span>`;
  }

  /* =========================================================
     Página: Login
     ========================================================= */
  function initLogin() {
    // BACKEND: autenticar contra tu servidor (POST /login).
    $('#login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      window.location.href = 'tablero.html';
    });
    $('#magic-link').addEventListener('click', () => {
      const email = $('#email').value.trim();
      if (!email) { $('#email').focus(); toast('Escribe tu correo para recibir el enlace'); return; }
      toast('Te enviamos un enlace a ' + email, ICONS.mail);
    });
  }

  /* =========================================================
     Página: Tablero
     ========================================================= */
  function initBoard() {
    load();
    let query = '';
    let mobileTab = 'toread';
    let dragId = null;

    const matches = (b) => !query ||
      (b.title + ' ' + b.author).toLowerCase().includes(query);

    function cardHTML(b, opts = {}) {
      return `<a class="book-card" href="libro.html?id=${encodeURIComponent(b.id)}" data-id="${esc(b.id)}" ${opts.draggable ? 'draggable="true"' : ''}>
        ${coverHTML(b, 'xs')}
        <span class="book-card-info">
          <span class="book-card-title">${esc(b.title)}</span>
          <span class="book-card-author">${esc(b.author)}</span>
        </span>${opts.chev ? ICONS.chev : ''}
      </a>`;
    }

    function render() {
      const reading = books.filter((b) => b.state === 'reading');
      $('#summary').textContent = `${books.length} ${books.length === 1 ? 'libro' : 'libros'} en tu biblioteca · ${reading.length} leyendo ahora`;

      // Leyendo ahora
      $('#now').innerHTML = reading.length ? reading.map((b) => `
        <a class="now-card" href="libro.html?id=${encodeURIComponent(b.id)}">
          ${coverHTML(b, 'sm')}
          <span class="now-info">
            <span class="pill" data-state="reading">Reading</span>
            <span class="now-title">${esc(b.title)}</span>
            <span class="now-author">${esc(b.author)}</span>
            ${kindleStatusHTML(b)}
          </span>
        </a>`).join('')
        : '<p class="empty">Nada en lectura. Mueve un libro a Reading y llegará a tu Kindle.</p>';

      // Kanban (escritorio)
      $('#board').innerHTML = STATES.map((s) => {
        const list = books.filter((b) => b.state === s.id && matches(b));
        return `<section class="column" data-state="${s.id}" aria-label="${s.name}, ${list.length} libros">
          <div class="column-head">
            <h3 class="column-name"><span class="column-dot"></span>${s.name}</h3>
            <span class="count">${list.length}</span>
          </div>
          ${list.map((b) => cardHTML(b, { draggable: true })).join('') || '<p class="column-empty">Suelta un libro aquí</p>'}
        </section>`;
      }).join('');

      // Pestañas (móvil)
      $('#tabs').innerHTML = STATES.map((s) => {
        const n = books.filter((b) => b.state === s.id && matches(b)).length;
        return `<button type="button" class="tab" role="tab" data-state="${s.id}" data-tab="${s.id}" aria-selected="${s.id === mobileTab}">${s.name} · ${n}</button>`;
      }).join('');
      const mlist = $('#mlist');
      mlist.dataset.state = mobileTab;
      const mbooks = books.filter((b) => b.state === mobileTab && matches(b));
      mlist.innerHTML = mbooks.map((b) => cardHTML(b, { chev: true })).join('') ||
        '<p class="column-empty">No hay libros en este estado</p>';

      // Tarjeta Kindle del sidebar
      const last = books.filter((b) => b.kindle).sort((a, b) => b.kindle.at.localeCompare(a.kindle.at))[0];
      $('#kindle-last').textContent = last ? `Último envío: ${last.title} · ${fmtDate(last.kindle.at)}` : 'Sin envíos todavía';
    }

    // Búsqueda
    const search = $('#search');
    search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); render(); });
    $('#search-toggle').addEventListener('click', () => {
      $('.search').classList.toggle('is-open');
      search.focus();
    });

    // Pestañas
    $('#tabs').addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (!t) return;
      mobileTab = t.dataset.tab;
      render();
    });

    // Arrastrar y soltar (escritorio)
    const board = $('#board');
    board.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.book-card');
      if (!card) return;
      dragId = card.dataset.id;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    board.addEventListener('dragend', (e) => {
      e.target.closest('.book-card')?.classList.remove('is-dragging');
      board.querySelectorAll('.is-over').forEach((c) => c.classList.remove('is-over'));
    });
    board.addEventListener('dragover', (e) => {
      const col = e.target.closest('.column');
      if (!col || !dragId) return;
      e.preventDefault();
      board.querySelectorAll('.is-over').forEach((c) => c !== col && c.classList.remove('is-over'));
      col.classList.add('is-over');
    });
    board.addEventListener('drop', (e) => {
      const col = e.target.closest('.column');
      if (!col || !dragId) return;
      e.preventDefault();
      const id = dragId; dragId = null;
      moveBook(id, col.dataset.state);
    });

    // Pulsación larga (móvil) → hoja para mover de estado
    const sheet = $('#move-sheet');
    let pressTimer = null, pressedId = null, longPressed = false;
    const mlist = $('#mlist');
    mlist.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.book-card');
      if (!card) return;
      longPressed = false;
      pressTimer = setTimeout(() => {
        longPressed = true;
        pressedId = card.dataset.id;
        openSheet(pressedId);
      }, 480);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
      mlist.addEventListener(ev, () => clearTimeout(pressTimer)));
    mlist.addEventListener('click', (e) => { if (longPressed) { e.preventDefault(); longPressed = false; } });
    mlist.addEventListener('contextmenu', (e) => { if (e.target.closest('.book-card')) e.preventDefault(); });

    function openSheet(id) {
      const b = getBook(id);
      if (!b) return;
      $('#sheet-title').textContent = b.title;
      $('#sheet-states').innerHTML = STATES.map((s) =>
        `<button type="button" class="state-btn" data-state="${s.id}" data-move="${s.id}" aria-pressed="${b.state === s.id}">${s.name}</button>`).join('');
      if (typeof sheet.showModal === 'function') sheet.showModal();
    }
    $('#sheet-states').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-move]');
      if (!btn || !pressedId) return;
      moveBook(pressedId, btn.dataset.move);
      sheet.close();
    });
    $('#sheet-close').addEventListener('click', () => sheet.close());
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

    listeners.add(render);
    render();
    resumePending();
  }

  /* =========================================================
     Página: Subir EPUB
     ========================================================= */

  /* Lee título, autor y portada del EPUB en el navegador (JSZip).
     BACKEND: puedes hacer lo mismo en el servidor al recibir el
     archivo y guardarlo (S3, disco, etc.).                     */
  async function parseEpub(file) {
    if (typeof JSZip === 'undefined') throw new Error('No se pudo cargar el lector de EPUB');
    const zip = await JSZip.loadAsync(file);
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) throw new Error('No parece un EPUB válido');
    const parser = new DOMParser();
    const container = parser.parseFromString(await containerFile.async('string'), 'application/xml');
    const rootfile = container.getElementsByTagName('rootfile')[0];
    const opfPath = rootfile && rootfile.getAttribute('full-path');
    if (!opfPath || !zip.file(opfPath)) throw new Error('Falta el archivo OPF');
    const opf = parser.parseFromString(await zip.file(opfPath).async('string'), 'application/xml');

    const text = (tag) => {
      const el = opf.getElementsByTagNameNS('*', tag)[0];
      return el ? el.textContent.trim() : '';
    };
    const title = text('title');
    const authors = Array.from(opf.getElementsByTagNameNS('*', 'creator')).map((n) => n.textContent.trim()).filter(Boolean);

    // Buscar la portada
    const items = Array.from(opf.getElementsByTagNameNS('*', 'item'));
    let coverItem = items.find((i) => (i.getAttribute('properties') || '').split(/\s+/).includes('cover-image'));
    if (!coverItem) {
      const meta = Array.from(opf.getElementsByTagNameNS('*', 'meta')).find((m) => m.getAttribute('name') === 'cover');
      const coverId = meta && meta.getAttribute('content');
      if (coverId) coverItem = items.find((i) => i.getAttribute('id') === coverId);
    }
    if (!coverItem) {
      coverItem = items.find((i) => /cover/i.test(i.getAttribute('id') || '') && /^image\//.test(i.getAttribute('media-type') || ''));
    }

    let cover = null;
    if (coverItem) {
      const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
      const path = resolvePath(base, decodeURIComponent(coverItem.getAttribute('href') || ''));
      const imgFile = zip.file(path);
      if (imgFile) {
        const blob = await imgFile.async('blob');
        cover = await thumbnail(new Blob([blob], { type: coverItem.getAttribute('media-type') || 'image/jpeg' }));
      }
    }
    return { title, author: authors.join(', '), cover };
  }

  function resolvePath(base, href) {
    const parts = (base + href).split('/');
    const out = [];
    for (const p of parts) {
      if (p === '..') out.pop();
      else if (p !== '.' && p !== '') out.push(p);
    }
    return out.join('/');
  }

  /* Reduce la portada para guardarla liviana */
  function thumbnail(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const w = 240, h = Math.round(img.height * (w / img.width)) || 360;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        try { resolve(canvas.toDataURL('image/jpeg', 0.82)); } catch (e) { resolve(null); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  function initUpload() {
    load();
    const queue = []; // { key, file, status: 'parsing'|'ready'|'error', meta, state, error }
    const dz = $('#dropzone');
    const input = $('#files');

    const titleFromName = (name) => name.replace(/\.epub$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

    function addFiles(list) {
      const files = Array.from(list).filter((f) => /\.epub$/i.test(f.name));
      if (!files.length) { toast('Solo se aceptan archivos .epub'); return; }
      files.forEach((file) => {
        const item = { key: uid(), file, status: 'parsing', meta: { title: '', author: '', cover: null }, state: 'toread' };
        queue.push(item);
        parseEpub(file).then((meta) => {
          item.meta = { title: meta.title || titleFromName(file.name), author: meta.author || 'Autor desconocido', cover: meta.cover };
          item.generated = !meta.cover;
          item.status = 'ready';
        }).catch((err) => {
          item.meta = { title: titleFromName(file.name), author: 'Autor desconocido', cover: null };
          item.status = 'error';
          item.error = err.message || 'No se pudo leer el archivo';
        }).finally(render);
      });
      render();
    }

    function render() {
      const section = $('#queue');
      section.hidden = queue.length === 0;
      const ready = queue.filter((q) => q.status !== 'parsing').length;
      const parsing = queue.length - ready;
      $('#queue-title').textContent = `${queue.length} ${queue.length === 1 ? 'archivo' : 'archivos'}`;
      $('#queue-sub').textContent = parsing ? `${ready} listos · ${parsing} extrayendo metadata` : 'Metadata lista. Revisa y corrige si hace falta.';

      $('#queue-list').innerHTML = queue.map((q) => {
        const [bg, ink] = colorFor(q.meta.title || q.file.name);
        const fake = { title: q.meta.title || '?', author: q.meta.author, bg, ink, cover: q.meta.cover };
        const pill = q.status === 'parsing'
          ? '<span class="pill pill-warn">Extrayendo…</span>'
          : q.status === 'error'
            ? `<span class="pill err" title="${esc(q.error)}">Sin metadata</span>`
            : '<span class="pill pill-ok">Metadata lista</span>';
        const dis = q.status === 'parsing' ? 'disabled' : '';
        return `<div class="queue-row" data-key="${q.key}">
          ${coverHTML(fake, 'xs')}
          <div class="queue-fields">
            <label class="sr-only" for="t-${q.key}">Título</label>
            <input class="inline-input inline-title" id="t-${q.key}" data-field="title" value="${esc(q.meta.title)}" placeholder="Leyendo archivo…" ${dis}>
            <label class="sr-only" for="a-${q.key}">Autor</label>
            <input class="inline-input inline-author" id="a-${q.key}" data-field="author" value="${esc(q.meta.author)}" placeholder="Autor" ${dis}>
            <span class="file-meta">${esc(q.file.name)} · ${fmtSize(q.file.size)}${q.generated ? ' · portada generada' : ''}</span>
          </div>
          ${pill}
          <div class="queue-state">
            <label for="s-${q.key}">Estado inicial</label>
            <select class="select select-sm" id="s-${q.key}" data-field="state">
              ${STATES.map((s) => `<option value="${s.id}" ${s.id === q.state ? 'selected' : ''}>${s.name}</option>`).join('')}
            </select>
          </div>
        </div>`;
      }).join('');

      const btn = $('#save');
      btn.disabled = parsing > 0 || queue.length === 0;
      btn.textContent = queue.length ? `Agregar ${queue.length} ${queue.length === 1 ? 'libro' : 'libros'} a la biblioteca` : 'Agregar a la biblioteca';
      $('#reading-hint').hidden = !queue.some((q) => q.state === 'reading');
    }

    // Editar metadata y estado sin re-render (no perder el foco)
    $('#queue-list').addEventListener('input', (e) => {
      const row = e.target.closest('.queue-row');
      const q = row && queue.find((x) => x.key === row.dataset.key);
      if (!q) return;
      const f = e.target.dataset.field;
      if (f === 'title' || f === 'author') q.meta[f] = e.target.value;
    });
    $('#queue-list').addEventListener('change', (e) => {
      const row = e.target.closest('.queue-row');
      const q = row && queue.find((x) => x.key === row.dataset.key);
      if (q && e.target.dataset.field === 'state') {
        q.state = e.target.value;
        $('#reading-hint').hidden = !queue.some((x) => x.state === 'reading');
      }
    });

    input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('is-over'); }));
    dz.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

    // BACKEND: aquí subirías cada archivo (POST /books con FormData).
    $('#save').addEventListener('click', () => {
      const now = new Date().toISOString();
      const toSend = [];
      queue.forEach((q) => {
        const title = q.meta.title.trim() || titleFromName(q.file.name);
        const [bg, ink] = colorFor(title);
        const book = {
          id: uid(), title, author: q.meta.author.trim() || 'Autor desconocido',
          state: q.state, bg, ink, cover: q.meta.cover,
          file: { name: q.file.name, size: q.file.size },
          added: now, history: [{ at: now, text: 'Agregado a la biblioteca en ' + stateName(q.state) }],
          kindle: null
        };
        books.unshift(book);
        if (q.state === 'reading') toSend.push(book);
      });
      save();
      toSend.forEach(sendToKindle);
      setTimeout(() => { window.location.href = 'tablero.html'; }, toSend.length ? 900 : 0);
    });

    render();
  }

  /* =========================================================
     Página: Detalle del libro
     ========================================================= */
  function initDetail() {
    load();
    const id = new URLSearchParams(location.search).get('id');
    let book = getBook(id) || books.find((b) => b.state === 'reading') || books[0];
    if (!book) { location.href = 'tablero.html'; return; }

    function markdown(b) {
      return `---
title: ${b.title}
author: ${b.author}
status: ${b.state}
---

## Highlights

> [texto del highlight]
— Ubicación [###]`;
    }

    function render() {
      book = getBook(book.id) || book;
      document.title = book.title + ' — Readflow';
      $('#cover').outerHTML = coverHTML(book, 'lg').replace('class="cover', 'id="cover" class="cover');
      document.querySelectorAll('[data-bind="title"]').forEach((el) => { el.textContent = book.title; });
      document.querySelectorAll('[data-bind="author"]').forEach((el) => { el.textContent = book.author; });
      $('#file-name').textContent = book.file.name;
      $('#file-meta').textContent = `${fmtSize(book.file.size)} · subido el ${fmtDate(book.added)}`;

      $('#states').innerHTML = STATES.map((s) =>
        `<button type="button" class="state-btn" data-state="${s.id}" data-move="${s.id}" aria-pressed="${book.state === s.id}">${s.name}</button>`).join('');

      // Estado de envío
      const k = book.kindle;
      const pill = $('#kindle-pill');
      if (!k) { pill.textContent = 'Sin enviar'; pill.className = 'pill'; }
      else if (k.status === 'sending') { pill.textContent = 'Enviando…'; pill.className = 'pill pill-warn'; }
      else { pill.textContent = 'Entregado'; pill.className = 'pill pill-ok'; }

      const events = book.history.slice().reverse();
      $('#timeline').innerHTML = events.map((ev, i) => {
        const done = /Aceptado/.test(ev.text);
        const st = /Reading/.test(ev.text) ? 'reading' : /Email/.test(ev.text) ? 'upnext' : 'toread';
        return `<li>
          <span class="step" data-state="${done ? 'reading' : st}">${done ? ICONS.check : events.length - i}</span>
          <span class="step-text"><strong>${esc(ev.text)}</strong><span>${fmtDateTime(ev.at)}</span></span>
        </li>`;
      }).join('');

      $('#md').textContent = markdown(book);
    }

    $('#states').addEventListener('click', (e) => {
      const b = e.target.closest('[data-move]');
      if (b) moveBook(book.id, b.dataset.move);
    });
    $('#resend').addEventListener('click', () => { sendToKindle(book); render(); });
    $('#download').addEventListener('click', () => toast('La descarga estará disponible cuando conectes el servidor'));
    $('#copy-md').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(markdown(book)); toast('Markdown copiado', ICONS.check); }
      catch (e) { toast('No se pudo copiar'); }
    });

    listeners.add(render);
    render();
    resumePending();
  }

  /* ---------- Arranque ---------- */
  const pages = { login: initLogin, board: initBoard, upload: initUpload, detail: initDetail };
  document.addEventListener('DOMContentLoaded', () => {
    const fn = pages[document.body.dataset.page];
    if (fn) fn();
  });
})();

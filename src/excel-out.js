/*
 * Sonuç Excel'i (ExcelJS gerektirir). Satır düzeni elle yapılan örnek dosyayla aynı:
 *   sipariş no · müşteri · POZ · ADET · ÖLÇÜ · not; grubun altında toplam satırı; en sonda KALANLAR.
 *   Grup içinde satırlar ölçüye göre büyükten küçüğe sıralıdır. Birden fazla stok boyu varsa grubun
 *   hangi boydan kesileceği başlığında yazar ("GRUP 3 · 5000") ve sayfanın başında boy başına kaç
 *   çubuk kesileceği verilir ("Çubuk: 6500 × 536 · 5000 × 131 · 4700 × 84").
 *
 * Baskı düzeni: A4 dikey, sayfa başına İKİ SÜTUN (A–F ve G–L). Gruplar gazete sütunu gibi akar:
 * önce sayfanın sol sütunu, sonra sağ sütunu dolar, sonra yeni sayfaya geçilir; hiçbir grup
 * sayfa ya da sütun arasında bölünmez (uzun KALANLAR listesi bölünebilir). Sayfa sonları elle
 * konur; baskı ölçeği sütun genişliklerinden hesaplanıp sabit yazılır, böylece bir sayfaya kaç
 * satır sığacağı her bilgisayarda aynıdır.
 *
 * Gerçek yazıcı çıktısından öğrenilenler (Excel 16, ekran ölçeği %150):
 *   1) Sayfada <sheetViews> kaydı yoksa Excel, elle verilen satır yüksekliklerini ekran ölçeğine
 *      bölerek okur (21 punto → 14) ve 16 puntoluk başlığın üstü baskıda kesilir. Bu yüzden her
 *      sayfaya görünüm kaydı yazılır (ws.views) ve başlık satırının yüksekliği Excel'e bırakılır.
 *   2) Sütun genişliği birimi baskıda ekran ölçeğine göre değişir (%100'de 5,25, %150'de 5,5
 *      punto). "Genişliğe sığdır" kullanılsaydı ölçek ve sayfaya sığan satır sayısı bilgisayardan
 *      bilgisayara oynardı; sabit ölçek en geniş hale (5,75) göre seçilir.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('exceljs'));
  else root.PanjurExcel = factory(root.ExcelJS);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ExcelJS) {
  'use strict';

  const THIN = { style: 'thin', color: { argb: 'FF000000' } };
  const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  const FONT = 'Calibri';
  const GRAY = { name: FONT, size: 9, color: { argb: 'FF666666' } };

  // ---------------------------------------------------------------- sayfa ölçüleri
  const PAGE_W = 595.28, PAGE_H = 841.89;            // A4 (punto)
  const MARGIN = { left: 0.3, right: 0.3, top: 0.4, bottom: 0.45, header: 0.2, footer: 0.2 };   // inç
  const ROW_H = 18.75;      // içerik satırı yüksekliği (punto): 14 punto kalın ölçü rakamına göre
  const TITLE_H = 22;       // 1. satır (16 punto başlık; Excel kendisi ayarlar, ≈ 21)
  // Sütun genişliği birimi baskıda ekran ölçeğine göre 5,14–5,7 punto tutar. Baskı ölçeği en
  // geniş hale göre seçilir ki iki sütun her bilgisayarda kâğıt genişliğine sığsın.
  const PT_PER_CHAR_MAX = 5.75;
  const MIN_SCALE = 85;     // sayfa sayısını azaltmak için ölçek en çok buraya kadar küçültülür (%)
  const COLS = 6;           // bir sütun bloğu: A..F

  function joinUnique(arr) {
    const seen = [];
    for (const x of arr) if (!seen.includes(x)) seen.push(x);
    return seen.join(' + ');
  }

  function safeSheetName(s) {
    return s.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sayfa';
  }

  const numOr = v => (v !== '' && v != null && isFinite(Number(v)) ? Number(v) : v);

  // Bir adımı satır verisine çevirir
  function stepRow(step) {
    const orders = step.alloc.map(a => a.item.order || '');
    const customers = step.alloc.map(a => a.item.customer || '');
    const pozs = step.alloc.map(a => String(a.item.poz));
    const counts = step.alloc.map(a => a.count);
    const single = step.alloc.length === 1;
    const uo = joinUnique(orders), uc = joinUnique(customers);
    const numOrNull = v => v === '' ? null : (isFinite(Number(v)) ? Number(v) : v);
    // Aynı kesimde birden fazla projenin pozu varsa hangi pozun hangi projeye ait olduğu
    // karışmasın diye pozlar "proje/poz" biçiminde yazılır (21542/6 + 21999/105).
    const multiProject = new Set(orders.map(String)).size > 1;
    return {
      order: uo.includes(' + ') ? uo : numOrNull(uo),
      customer: uc,
      poz: single ? (isFinite(Number(pozs[0])) ? Number(pozs[0]) : pozs[0])
        : multiProject ? step.alloc.map(a => `${a.item.order}/${a.item.poz}`).join(' + ') : pozs.join(' + '),
      count: single ? counts[0] : counts.join(' + '),
      len: step.len,
      multiProject,
    };
  }

  // ---------------------------------------------------------------- bloklar
  // Blok = satır listesi; her blok kendi boş ayırıcı satırıyla biter.

  function groupBlock(g, opts) {
    opts = opts || {};
    const rows = [];
    // Başlık: grup no, (birden fazla stok boyu varsa) kesileceği boy; not sütununda demetteki çubuk sayısı
    const title = `GRUP ${g.no}` + (opts.multiLen ? ` · ${g.barLen}` : '') + (g.fallback ? ' (yeni çubuk)' : '');
    rows.push({ kind: 'header', A: title, F: `${g.bars} çubuk` });
    g.steps.forEach(s => {
      const r = stepRow(s);
      // adedi demetten az olan satır kesilirken aradaki fark kadar çubuk kenarda bekler
      rows.push({ kind: 'step', A: r.order, B: r.customer, C: r.poz, D: r.count, E: r.len, F: s.setAside > 0 ? `${s.setAside} kenarda` : '' });
    });
    const remnantNote = (g.remnants || []).filter(r => !r.final && r.count > 0).map(r => `${r.count}×${r.len}`).join(', ');
    const adetNote = g.spread ? `adet farkı ${g.spread}` : 'adetler eşit';
    rows.push({ kind: 'sum', value: g.sumLen, F: adetNote + (remnantNote && opts.showRemnants ? ` · artık ${remnantNote}` : '') });
    rows.push({ kind: 'blank' });
    return rows;
  }

  // KALANLAR: gruba girmeyen pozlar. Not sütunu, artık demetinden kesilebilenleri gösterir.
  function kalanBlock(kalan) {
    const rows = [];
    if (!kalan.parts.length) return rows;
    // kural açıkken KALANLAR yalnızca listedir; gereken yeni çubuk tahmini başlığın yanında yazar
    rows.push({ kind: 'header', A: 'KALANLAR', big: true, F: kalan.listOnly && kalan.newBars ? `≈ ${kalan.newBars} çubuk` + (kalan.shortBars ? ' (stok yetmiyor)' : '') : '' });
    const src = new Map();
    for (const e of kalan.plan) for (const s of e.steps) {
      const m = src.get(s.part.id) || new Map();
      m.set(e.groupNo, (m.get(e.groupNo) || 0) + s.n);
      src.set(s.part.id, m);
    }
    for (const k of kalan.parts) {
      const m = src.get(k.part.id);
      // kısa tutulur (not sütunu dar): en çok iki kaynak; tamamı ARTIK PLANI sayfasında
      const srcs = m ? [...m.entries()] : [];
      const note = srcs.length ? 'artık ' + srcs.slice(0, 2).map(([g, n]) => `G${g}×${n}`).join(' ') + (srcs.length > 2 ? ' …' : '') : '';
      const it = k.item;
      rows.push({ kind: 'step', A: numOr(it.order), B: it.customer, C: numOr(it.poz), D: k.count, E: it.len, F: note });
    }
    rows.push({ kind: 'blank' });
    return rows;
  }

  // Çubuk boyundan uzun olduğu için plana alınamayan pozlar (varsa) en sonda listelenir
  function oversizeBlock(res) {
    const list = res.oversize || [];
    if (!list.length) return [];
    const rows = [{ kind: 'header', A: `ÇUBUKTAN UZUN (${res.P.L} mm)`, red: true }];
    for (const it of list) rows.push({ kind: 'step', A: numOr(it.order), B: it.customer, C: numOr(it.poz), D: it.count, E: it.len, F: 'plana alınmadı' });
    rows.push({ kind: 'blank' });
    return rows;
  }

  function buildBlocks(res, opts) {
    const blocks = [];
    opts = Object.assign({}, opts, { multiLen: ((res.P && res.P.lengths) || []).length > 1 });
    for (const g of res.groups) blocks.push({ rows: groupBlock(g, opts) });
    for (const g of res.kalan.fallbackGroups || []) blocks.push({ rows: groupBlock(g, opts) });
    const kb = kalanBlock(res.kalan);
    if (kb.length) blocks.push({ rows: kb, list: true, title: 'KALANLAR' });
    const ob = oversizeBlock(res);
    if (ob.length) blocks.push({ rows: ob, list: true, title: 'ÇUBUKTAN UZUN', red: true });
    return blocks;
  }

  // ---------------------------------------------------------------- sütun genişlikleri
  // En uzun içeriğe göre A–D ve F genişlikleri (Excel "karakter" birimi); E (ölçü) sabit.
  function measure(blocks, orders) {
    const m = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    let title = 0;                          // en uzun grup başlığı (A ve B sütunlarına yayılır)
    for (const b of blocks) for (const row of b.rows) {
      if (row.kind === 'header') {
        if (row.F) m.F = Math.max(m.F, String(row.F).length);
        if (row.A) title = Math.max(title, String(row.A).length * (row.big ? 1.2 : 1));
        continue;
      }
      if (row.kind !== 'step' && row.kind !== 'sum') continue;
      for (const k of Object.keys(m)) if (row[k] != null) m[k] = Math.max(m[k], String(row[k]).length);
    }
    m.T = title;
    for (const o of orders || []) {
      m.A = Math.max(m.A, String(o.orderNo == null ? '' : o.orderNo).length);
      m.B = Math.max(m.B, String(o.customer || '').length);
      m.F = Math.max(m.F, String(o.note || '').length);
    }
    return m;
  }
  function widthsFor(m) {
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const w = [
      cl(m.A + 1.6, 6.5, 22),            // sipariş no
      cl(m.B + 2, 5, 30),                // müşteri
      cl(m.C + 2.5, 5.5, 44),            // POZ
      cl(m.D + 3, 6.5, 24),              // ADET
      8,                                 // ÖLÇÜ (14 punto kalın, 4 hane + binlik ayırıcı)
      cl(m.F * 0.84 + 1.5, 11, 26),      // not (9 punto)
    ];
    // grup başlığı ("GRUP 12 · 5000") A + B sütunlarına sığmalı; yoksa POZ başlığında kesilir
    const need = (m.T || 0) * 0.98 + 1;
    if (w[0] + w[1] < need) w[1] = Math.min(30, need - w[0]);
    return w;
  }

  // Baskı ölçeği (%, tam sayı): bütün sütunlar kâğıt genişliğine sığacak en büyük ölçek, en çok 100
  function printScale(totalChars) {
    const wPrint = PAGE_W - (MARGIN.left + MARGIN.right) * 72;
    return Math.max(40, Math.min(100, Math.floor(100 * wPrint / (totalChars * PT_PER_CHAR_MAX))));
  }
  // Bu ölçekte bir sayfaya (yinelenen başlık satırı hariç) kaç içerik satırı sığar?
  // Satır yüksekliği ekran pikseline yuvarlandığı için 0,25 punto ve %1,5 pay bırakılır.
  function rowsPerPage(scale) {
    const hPrint = PAGE_H - (MARGIN.top + MARGIN.bottom) * 72;
    return Math.max(12, Math.floor((hPrint / (scale / 100) * 0.985 - TITLE_H) / (ROW_H + 0.25)));
  }

  // ---------------------------------------------------------------- sayfalama
  const isBlank = r => r.kind === 'blank';
  function trimmed(rows) {
    let n = rows.length;
    while (n > 0 && isBlank(rows[n - 1])) n--;
    return n;
  }
  function colLen(blocks) {
    let n = 0;
    for (const b of blocks) n += b.rows.length;
    if (blocks.length) n -= blocks[blocks.length - 1].rows.length - trimmed(blocks[blocks.length - 1].rows);
    return n;
  }

  /**
   * Blokları sayfalara ve sütunlara dağıtır.
   * cap: sayfa başına içerik satırı; off1L / off1R: ilk sayfada sol / sağ sütunun başındaki dolu satır
   * sayısı (sağda sipariş bloğu). cols: 1 ya da 2.
   * Dönüş: [{ left: [satır], right: [satır], offL, offR, rows }]
   */
  function paginate(blocks, cap, off1L, off1R, cols) {
    const pages = [];
    let queue = blocks.map(b => ({ rows: b.rows.slice(), list: !!b.list, title: b.title, red: !!b.red }));
    let guard = 0;
    while (queue.length && guard++ < 10000) {
      const first = pages.length === 0;
      const offL = first ? off1L : 0, offR = first ? off1R : 0;
      const capL = cap - offL, capR = cols === 2 ? cap - offR : 0;
      const page = { left: [], right: [], offL, offR, rows: 0 };
      // Kalan blokların hepsi bu sayfaya sığıyorsa iki sütunun boyu dengelenir
      let split = null;
      if (cols === 2) {
        let bestH = Infinity;
        for (let k = 0; k <= queue.length; k++) {
          const hL = colLen(queue.slice(0, k)), hR = colLen(queue.slice(k));
          if (hL > capL || hR > capR) continue;
          const H = Math.max(offL + hL, offR + hR);
          if (H <= bestH) { bestH = H; split = k; }   // eşitlikte uzun sütun solda kalır
        }
      }
      if (split != null) {
        for (const b of queue.slice(0, split)) for (const r of b.rows) page.left.push(r);
        for (const b of queue.slice(split)) for (const r of b.rows) page.right.push(r);
        queue = [];
      } else {
        const fill = (col, capacity) => {
          let used = 0;
          while (queue.length) {
            const b = queue[0], need = trimmed(b.rows);
            if (used + need <= capacity) { for (const r of b.rows) col.push(r); used += b.rows.length; queue.shift(); continue; }
            // Sığmıyor. Liste bloğu (KALANLAR) ya da boş sütuna bile sığmayan blok bölünür;
            // grup blokları bölünmez, sonraki sütuna / sayfaya geçer.
            const room = capacity - used;
            if ((b.list || need > capacity) && room >= 4) {
              for (const r of b.rows.slice(0, room)) col.push(r);
              used += room;
              queue[0] = { rows: [{ kind: 'header', A: (b.title || 'GRUP') + ' (devam)', big: !!b.list, red: b.red }].concat(b.rows.slice(room)), list: b.list, title: b.title, red: b.red };
            }
            break;
          }
        };
        fill(page.left, capL);
        if (cols === 2) fill(page.right, capR);
        if (!page.left.length && !page.right.length) {
          // güvenlik: hiçbir şey yerleşmediyse (çok küçük kapasite) ilk bloğu zorla yerleştir
          for (const r of queue.shift().rows) page.left.push(r);
        }
      }
      page.left.length = trimmed(page.left);
      page.right.length = trimmed(page.right);
      page.rows = Math.max(page.left.length ? offL + page.left.length : 0, page.right.length ? offR + page.right.length : 0, first ? Math.max(off1L, off1R - 1) : 0);
      pages.push(page);
    }
    return pages;
  }

  // ---------------------------------------------------------------- hücre yazımı
  function writeRows(ws, rows, colOffset, startRow) {
    const col = i => colOffset + i; // 1 tabanlı; colOffset 0 → A..F, 6 → G..L
    let r = startRow;
    let blockStart = null;
    for (const row of rows) {
      if (row.kind === 'header') {
        blockStart = r + 1;
        if (row.A) {
          const c = ws.getCell(r, col(1));
          c.value = row.A;
          c.font = { name: FONT, size: row.big ? 12 : 10, bold: true, color: row.red ? { argb: 'FFC00000' } : undefined };
        }
        for (const [i, t] of [[3, 'POZ'], [4, 'ADET'], [5, 'ÖLÇÜ']]) {
          const c = ws.getCell(r, col(i)); c.value = t; c.font = { name: FONT, size: 11, bold: true }; c.alignment = { horizontal: 'right' };
        }
        if (row.F) { const c = ws.getCell(r, col(6)); c.value = row.F; c.font = GRAY; }
      } else if (row.kind === 'step') {
        const vals = [row.A, row.B, row.C, row.D, row.E];
        vals.forEach((v, i) => {
          const c = ws.getCell(r, col(i + 1));
          c.value = v == null ? null : v;
          c.border = BORDER;
          c.font = i === 4 ? { name: FONT, size: 14, bold: true } : { name: FONT, size: 11 };
          if (i === 4) c.numFmt = '#,##0';
          if (i >= 2) c.alignment = { horizontal: 'right' };
        });
        if (row.F) { const c = ws.getCell(r, col(6)); c.value = row.F; c.font = GRAY; }
      } else if (row.kind === 'sum') {
        const c = ws.getCell(r, col(5));
        const colLetter = ws.getColumn(col(5)).letter;
        // Toplam satırı elle yapılan örnekteki gibi formüldür (grup bölünmeden yazıldıysa)
        c.value = blockStart != null && blockStart <= r - 1 ? { formula: `SUM(${colLetter}${blockStart}:${colLetter}${r - 1})`, result: row.value } : row.value;
        c.numFmt = '#,##0'; c.border = BORDER; c.font = { name: FONT, size: 11, bold: true };
        if (row.F) { const f = ws.getCell(r, col(6)); f.value = row.F; f.font = GRAY; }
        blockStart = null;
      }
      r++;
    }
    return r;
  }

  function materialSheet(wb, res, meta, opts) {
    opts = opts || {};
    const cols = opts.columns === 1 ? 1 : 2;
    const name = safeSheetName(meta.sheetName);
    const ws = wb.addWorksheet(name, {
      pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: false, scale: 100, horizontalCentered: true, margins: MARGIN },
      views: [{ state: 'normal', zoomScale: 100 }],
    });
    const orders = meta.orders || [];
    const blocks = buildBlocks(res, opts);
    const w = widthsFor(measure(blocks, orders));
    for (let i = 0; i < COLS; i++) { ws.getColumn(i + 1).width = w[i]; ws.getColumn(i + 1 + COLS).width = w[i]; }
    const blockChars = w.reduce((a, b) => a + b, 0);

    // 1. satır: parça adı (solda) ve renk (sağ sütunun başında). Her sayfanın başında yinelenir.
    // Satır yüksekliği verilmez: Excel yazı boyuna göre kendisi ayarlar (baskıda kesilmez).
    const titleFit = [[16, 1.62], [14, 1.42], [12, 1.22], [11, 1.12]].find(([, k]) => String(meta.desc || '').length * k <= blockChars) || [11, 1.12];
    ws.getCell('A1').value = meta.desc; ws.getCell('A1').font = { name: FONT, size: titleFit[0], bold: true };
    ws.getCell(1, COLS + 1).value = meta.color || ''; ws.getCell(1, COLS + 1).font = { name: FONT, size: 12, bold: true };

    // Sipariş bloğu: sağ sütunun başında (no · müşteri · poz sayısı · tarih · not)
    let hr = 2;
    for (const o of orders) {
      ws.getCell(hr, COLS + 1).value = numOr(o.orderNo);
      ws.getCell(hr, COLS + 2).value = o.customer || '';
      ws.getCell(hr, COLS + 3).value = o.pozCount;
      if (o.date) {
        ws.mergeCells(hr, COLS + 4, hr, COLS + 5);
        const d = ws.getCell(hr, COLS + 4); d.value = o.date; d.numFmt = 'dd.mm.yyyy'; d.alignment = { horizontal: 'right' };
      }
      if (o.note) { const c = ws.getCell(hr, COLS + 6); c.value = o.note; c.font = GRAY; }
      for (let i = 1; i <= 3; i++) ws.getCell(hr, COLS + i).font = { name: FONT, size: 11 };
      hr++;
    }

    const off1L = 1;                                   // ilk sayfada sol sütun 3. satırdan başlar
    const off1R = orders.length ? orders.length + 1 : 1;   // sağ sütun sipariş bloğunun altından
    // Ölçek: önce kâğıt genişliğine sığan en büyük ölçek. Biraz küçültmek (en çok MIN_SCALE'e kadar)
    // sayfa sayısını azaltıyorsa, o sayfa sayısını veren en büyük ölçek seçilir.
    let scale = printScale(blockChars * 2);
    let pages = paginate(blocks, rowsPerPage(scale), off1L, off1R, cols);
    for (let sc = scale - 1; sc >= MIN_SCALE; sc--) {
      const alt = paginate(blocks, rowsPerPage(sc), off1L, off1R, cols);
      if (alt.length < pages.length) { pages = alt; scale = sc; }
    }
    ws.pageSetup.scale = scale;
    const cap = rowsPerPage(scale);
    // 2. satır (sol): stok boyu başına kaç çubuk kesilecek — yazılan grupların toplamı
    const byLen = (res.stats && res.stats.barsByLen) || {};
    const lens = Object.keys(byLen).map(Number).sort((a, b) => b - a);
    if (lens.length) {
      const c = ws.getCell(2, 1);
      c.value = 'Çubuk: ' + lens.map(L => `${L} × ${byLen[L]}`).join(' · ');
      c.font = { name: FONT, size: 11, bold: true };
    }
    let r0 = 2;                                        // sayfanın ilk içerik satırı
    pages.forEach((pg, i) => {
      if (pg.left.length) writeRows(ws, pg.left, 0, r0 + pg.offL);
      if (pg.right.length) writeRows(ws, pg.right, COLS, r0 + pg.offR);
      const last = r0 + Math.max(pg.rows, 1) - 1;
      if (i < pages.length - 1) ws.getRow(last).addPageBreak(1, 16384);
      r0 = last + 1;
    });
    const lastRow = Math.max(r0 - 1, hr - 1, 2);
    for (let r = 2; r <= lastRow; r++) ws.getRow(r).height = ROW_H;
    ws.pageSetup.printTitlesRow = '1:1';
    // "A$1:L$n" → ExcelJS başa birer $ ekler: $A$1:$L$n (mutlak başvuru)
    ws.pageSetup.printArea = `A$1:L$${lastRow}`;
    const foot = String(meta.desc || '') + (meta.color ? ' · ' + meta.color : '');
    ws.headerFooter.oddFooter = `&L&8&"${FONT},Regular"${foot.replace(/&/g, '&&')}&R&8&"${FONT},Regular"&P / &N`;
    return { ws, pages: pages.length, rowsPerPage: cap, lastRow, scale, widths: w };
  }

  // ---------------------------------------------------------------- özet ve liste sayfaları
  function plainView(ws, frozen) {
    ws.views = [frozen ? { state: 'frozen', ySplit: 1 } : { state: 'normal' }];
  }

  function summarySheet(wb, results, meta) {
    const ws = wb.addWorksheet('ÖZET');
    plainView(ws, false);
    ws.getColumn(1).width = 26; ws.getColumn(2).width = 12;
    for (let c = 3; c <= 27; c++) ws.getColumn(c).width = 12;
    ws.getColumn(3).width = 30; ws.getColumn(12).width = 34; ws.getColumn(20).width = 28;
    ws.getCell('A1').value = 'KESİM OPTİMİZASYONU – ÖZET'; ws.getCell('A1').font = { name: FONT, size: 14, bold: true };
    ws.getCell('A2').value = 'Oluşturma: ' + new Date().toLocaleString('tr-TR');
    let r = 4;
    const hdr = ['Parça', 'Renk', 'Çubuk boyları', 'Demet', 'En az grup toplamı', 'Poz', 'Parça adedi', 'Toplam (m)',
      'Grup', 'Gruplardaki poz', 'Grup çubuğu', 'Boya göre çubuk', 'Grup firesi %', 'Eşit adetli grup', 'En çok adet farkı', 'Demet bozma',
      'KALANLAR poz', 'KALANLAR parça', 'KALANLAR çubuğu', 'KALANLAR boya göre', 'Stok dışı çubuk', 'Toplam çubuk', 'Malzeme (m)', 'Toplam fire %', 'Maliyet'];
    const byLenText = o => Object.keys(o || {}).map(Number).sort((a, b) => b - a).map(L => `${L} × ${o[L]}`).join(' · ');
    hdr.forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; c.font = { name: FONT, bold: true }; c.border = BORDER; c.alignment = { wrapText: true, vertical: 'middle' }; });
    ws.getRow(r).height = 30;
    r++;
    for (const x of results) {
      const st = x.result.stats, P = x.result.P;
      const Ls = P.lengths && P.lengths.length ? P.lengths : [P.L];
      const writtenBars = Object.values(st.barsByLen || {}).reduce((a, b) => a + b, 0);   // yazılan bütün grupların çubuğu
      const stock = P.stock || {};
      const limited = Object.keys(stock).length > 0;
      // çubuk boyları: seçili boylar; stok adedi girilmişse yanında
      const lensText = Ls.length > 1 || limited ? Ls.map(L => L + (stock[L] != null ? ` (${stock[L]} adet)` : '')).join(' / ') : P.L;
      const vals = [x.meta.desc, x.meta.color, lensText, P.maxBundle,
        P.minSum > 0 ? (Ls.length > 1 ? Ls.map(L => L - (P.L - P.minSum)).join(' / ') : P.minSum) : '–',
        x.result.items.length, st.pieces, +(st.pieceMm / 1000).toFixed(1),
        st.groupCount + (st.listOnly ? 0 : (x.result.kalan.fallbackGroups || []).length), st.groupPozCount, writtenBars, byLenText(st.barsByLen),
        +(st.groupWastePct * 100).toFixed(2), st.equalGroups, st.spreadMax, st.groupChanges,
        st.kalanCount, st.kalanPieces, st.listOnly ? st.kalanNewBars : 0, st.listOnly ? byLenText(st.kalanBarsByLen) : '', st.stockShort || 0,
        st.bars, +(st.materialMm / 1000).toFixed(1), +(st.wastePct * 100).toFixed(2), Math.round(st.cost)];
      vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.border = BORDER; });
      r++;
    }
    r++;
    const notes = [
      'Grup çubuğu ve grup firesi yalnızca yazılan grupları kapsar. Birden fazla çubuk boyu varsa her grup sığdığı en kısa boydan kesilir ("Boya göre çubuk": boy × adet).',
      'KALANLAR çubuğu: artık demetlerinden çıkmayan KALANLAR pozları için gereken yeni çubuk. KALANLAR yalnızca listeyken (en az grup toplamı kuralı ya da stok adedi sınırı) tahminidir: parçalar tek tek, çubuklara sığdığı kadar yerleştirilirse.',
      'Stok adedi girilmiş boyda o adet aşılmaz: grup bir uzun boya geçer, hiçbir boyda yer kalmazsa pozları KALANLAR\'a yazılır. "Stok dışı çubuk": KALANLAR için gereken ama stokta karşılığı olmayan çubuk.',
      'Toplam çubuk = grup çubuğu + KALANLAR çubuğu. Malzeme = çubuk adedi × çubuk boyu toplamı; fire buna göredir.',
    ];
    for (const t of notes) { ws.getCell(r, 1).value = t; ws.getCell(r, 1).font = GRAY; r++; }
    r++;
    ws.getCell(r, 1).value = 'Parametreler'; ws.getCell(r, 1).font = { name: FONT, bold: true }; r++;
    const P = results.length ? results[0].result.P : {};
    const plist = [['Grup içi en çok adet farkı', P.maxSpread >= 9999 ? 'sınırsız' : P.maxSpread], ['Adet farkı ağırlığı', P.wSpread], ['Testere payı (mm)', P.kerf], ['Emniyet payı (mm)', P.safety], ['Kesim ağırlığı', P.wCut], ['Çubuk ağırlığı', P.wBar], ['Demet bozma ağırlığı', P.wChange], ['KALANLAR poz cezası', P.wKalan], ['Satır düzeni', P.mergeSameLength ? 'aynı ölçüler birleşik' : 'her satır tek poz'], ['Poz aynı grupta bölünebilir', P.multiStep ? 'açık' : 'kapalı'], ['Poz bölme (gruplar arası)', P.allowSplit ? 'açık' : 'kapalı']];
    for (const [k, v] of plist) { ws.getCell(r, 1).value = k; ws.getCell(r, 2).value = v; r++; }
    ws.getCell(r, 1).value = 'En az grup toplamı';
    ws.getCell(r, 2).value = 'parçaya göre (yukarıdaki tablo): ölçüleri toplamı bu değerin altında kalan grup yazılmaz, pozları KALANLAR\'a bırakılır; kısa çubuk boylarında aynı pay geçerlidir';
    r += 2;
    ws.getCell(r, 1).value = 'Siparişler'; ws.getCell(r, 1).font = { name: FONT, bold: true }; r++;
    for (const o of meta.orders) { ws.getCell(r, 1).value = o.orderNo; ws.getCell(r, 2).value = o.customer; if (o.date) { ws.getCell(r, 3).value = o.date; ws.getCell(r, 3).numFmt = 'dd.mm.yyyy'; } ws.getCell(r, 4).value = o.note || ''; r++; }
    return ws;
  }

  function pozListSheet(wb, results) {
    const ws = wb.addWorksheet('POZ LİSTESİ');
    // Müşteri pozu (ERP'nin B sütunu) dosyalardan en az birinde doluysa ayrı sütun olarak yazılır
    const hasRef = results.some(x => (x.result.items || []).concat(x.result.oversize || []).some(it => it.ref != null && it.ref !== ''));
    const hdr = ['Sipariş', 'Müşteri', 'Poz', 'Parça', 'Adet', 'Ölçü', 'Grup'].concat(hasRef ? ['Müşteri pozu'] : []);
    const widths = [9, 14, 7, 26, 7, 8, 30].concat(hasRef ? [13] : []);
    hdr.forEach((h, i) => { const c = ws.getCell(1, i + 1); c.value = h; c.font = { name: FONT, bold: true }; c.border = BORDER; ws.getColumn(i + 1).width = widths[i]; });
    const rows = [];
    for (const x of results) {
      const res = x.result;
      const where = new Map(); // item → [{label, count}]
      const push = (item, label, count) => { const a = where.get(item) || []; a.push({ label, count }); where.set(item, a); };
      for (const g of res.groups.concat(res.kalan.fallbackGroups || [])) for (const s of g.steps) for (const a of s.alloc) push(a.item, `G${g.no}`, a.count);
      if (res.kalan.listOnly) {
        // En az grup toplamı kuralı: KALANLAR yalnızca listedir (artıktan kesilebilenler ARTIK PLANI sayfasında)
        for (const k of res.kalan.parts) push(k.item, 'KALANLAR', k.count);
      } else {
        for (const e of res.kalan.plan) for (const s of e.steps) push(s.item, `KALANLAR (artık G${e.groupNo})`, s.n);
      }
      for (const it of res.items) {
        const w = where.get(it) || [];
        // aynı etiketleri birleştir
        const agg = new Map();
        for (const e of w) agg.set(e.label, (agg.get(e.label) || 0) + e.count);
        const label = [...agg.entries()].map(([l, c]) => agg.size > 1 || c !== it.count ? `${l} (${c})` : l).join(' + ');
        rows.push([it.order, it.customer, it.poz, x.meta.desc + (x.meta.color ? ' ' + x.meta.color : ''), it.count, it.len, label].concat(hasRef ? [it.ref == null ? '' : it.ref] : []));
      }
      for (const it of res.oversize || []) {
        rows.push([it.order, it.customer, it.poz, x.meta.desc + (x.meta.color ? ' ' + x.meta.color : ''), it.count, it.len, 'ÇUBUKTAN UZUN – plana alınmadı'].concat(hasRef ? [it.ref == null ? '' : it.ref] : []));
      }
    }
    rows.sort((a, b) => String(a[3]).localeCompare(String(b[3]), 'tr') || String(a[0]).localeCompare(String(b[0]), 'tr') || (Number(a[2]) - Number(b[2])) || String(a[2]).localeCompare(String(b[2]), 'tr'));
    rows.forEach((row, i) => row.forEach((v, j) => {
      const c = ws.getCell(i + 2, j + 1);
      c.value = (j === 0 || j === 2) && isFinite(Number(v)) ? Number(v) : v; c.border = BORDER;
      if (j === 5) c.numFmt = '#,##0';
    }));
    plainView(ws, true);
    ws.autoFilter = { from: 'A1', to: hasRef ? 'H1' : 'G1' };
    return ws;
  }

  function remnantSheet(wb, results) {
    const ws = wb.addWorksheet('ARTIK PLANI');
    const hdr = ['Parça', 'Kaynak grup', 'Artık', 'Artık adet', 'Artık boy', 'Kesim ölçü', 'Adet', 'Poz', 'Sipariş', 'Müşteri'];
    const widths = [26, 11, 17, 10, 10, 10, 7, 7, 9, 14];
    hdr.forEach((h, i) => { const c = ws.getCell(1, i + 1); c.value = h; c.font = { name: FONT, bold: true }; c.border = BORDER; ws.getColumn(i + 1).width = widths[i]; });
    let r = 2;
    for (const x of results) {
      for (const e of x.result.kalan.plan) {
        for (const s of e.steps) {
          // artık türü: demetin son kalanı mı, yoksa az adetli satırlarda kenarda bekleyen çubuklar mı
          const src = x.result.groups.find(g => g.no === e.groupNo);
          const kind = src && e.step === src.steps.length ? 'son kalan' : 'kenarda bekleyen';
          const vals = [x.meta.desc + (x.meta.color ? ' ' + x.meta.color : ''), `G${e.groupNo}`, kind, e.count, e.len, s.len, s.n, s.item.poz, s.item.order, s.item.customer];
          vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = (i === 7 || i === 8) && isFinite(Number(v)) ? Number(v) : v; c.border = BORDER; });
          r++;
        }
      }
      if (x.result.kalan.listOnly) continue;   // kural açıkken artıktan çıkmayanlar KALANLAR listesinde kalır
      for (const d of x.result.kalan.deficit || []) {
        const vals = [x.meta.desc, 'EKSİK', '', '', '', d.item.len, d.count, d.item.poz, d.item.order, d.item.customer];
        vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.border = BORDER; c.font = { name: FONT, color: { argb: 'FFC00000' } }; });
        r++;
      }
    }
    if (r === 2) ws.getCell(2, 1).value = 'Artıktan kesim yok.';
    plainView(ws, true);
    return ws;
  }

  /**
   * results: [{ result, meta: { desc, color, sheetName, orders: [{orderNo, customer, date, pozCount, note}] }, opts: { columns, showRemnants } }]
   * meta: { orders }
   * info (isteğe bağlı, doldurulur): sayfa adı → { pages, rowsPerPage, lastRow }
   */
  async function buildWorkbook(results, meta, info) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Panjur Kesim Optimizasyonu';
    wb.created = new Date();
    wb.views = [{ x: 0, y: 0, width: 28000, height: 16000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
    const used = new Set(['ÖZET', 'POZ LİSTESİ', 'ARTIK PLANI']);
    for (const x of results) {
      let name = safeSheetName(x.meta.sheetName || x.meta.desc);
      if (used.has(name)) { let i = 2; while (used.has(`${name} ${i}`.slice(0, 31))) i++; name = `${name} ${i}`.slice(0, 31); }
      used.add(name);
      x.meta = Object.assign({}, x.meta, { sheetName: name });
      const lay = materialSheet(wb, x.result, x.meta, x.opts || {});
      if (info) info[name] = { pages: lay.pages, rowsPerPage: lay.rowsPerPage, lastRow: lay.lastRow, scale: lay.scale, widths: lay.widths };
    }
    summarySheet(wb, results, meta);
    pozListSheet(wb, results);
    remnantSheet(wb, results);
    return wb.xlsx.writeBuffer();
  }

  return { buildWorkbook, groupBlock, kalanBlock, stepRow, paginate, rowsPerPage, printScale, ROW_H };
});

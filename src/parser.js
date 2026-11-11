/*
 * İmalat listesi ayrıştırıcı — SheetJS (XLSX) gerektirir.
 *
 * Desteklenen girdiler:
 *   A) ERP ham çıktısı — CSV (.csv, noktalı virgül, Windows-1254) ya da aynı yapıdaki .xlsx.
 *      Başlık satırı yoktur ve sütun düzeni dışa aktarıma göre değişir; bilinen iki düzen:
 *        poz; stok kodu; açıklama; renk; adet; ölçü; ağırlık
 *        poz; müşteri pozu; stok kodu; açıklama; renk; adet; ölçü
 *      Bu yüzden sütunlar sabit konumdan değil **içerikten** bulunur (bkz. inferRawColumns).
 *      Ölçüde "." binlik ayırıcıdır: 1.274 → 1274 mm.
 *   B) Düzenlenmiş İMALAT LİSTESİ (.xls/.xlsx): başlık satırı (Poz no / Adet / Ölçü) ve
 *      bölüm başlıkları (Lamel, Alt parça, Yan dikme, Tambur borusu, …).
 *
 * Parça türü (lamel, dikme…) açıklamadan belirlenir. Projeler arası birleştirme anahtarı
 * **stok kodu + renk**tir; stok kodu noktalama farklarına karşı sadeleştirilir
 * (3224.24 = 322424), böylece aynı profil tek havuzda toplanır, adı aynı ama stok kodu
 * farklı profiller (P-1301/2072 ile P-1301/3072) karışmaz.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('xlsx'));
  else root.PanjurParse = factory(root.XLSX);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (XLSX) {
  'use strict';

  // Tanınan parça türleri. bundle: varsayılan demet (tek seferde kesilen adet),
  // on: varsayılan olarak optimize edilsin mi.
  const TYPES = [
    { type: 'lamel', label: 'LAMEL', bundle: 50, on: true, match: s => /lamel/.test(s) && !/kapa|tapa/.test(s) },
    { type: 'dikme', label: 'DİKME', bundle: 2, on: true, match: s => /dikme/.test(s) },
    { type: 'altparca', label: 'ALT PARÇA', bundle: 1, on: true, match: s => /alt\s*par/.test(s) },
    { type: 'tambur', label: 'TAMBUR', bundle: 1, on: true, match: s => /tambur|(^|[^a-z])m\.\s*borusu|motor\s*borusu/.test(s) },
    // Kutu profilleri: "SK-165/ÖN 45 KUTU" ve "SK-165/AR 90 KUTU" (kutunun ön ve arka parçası; poz başına
    // birer adet, tek tek kesilir). Her stok kodu ayrı profildir, ayrı optimize edilir.
    { type: 'kutu', label: 'KUTU', bundle: 1, on: true, match: s => /kutu/.test(s) && !/kapa/.test(s) },
    { type: 'kutukapak', label: 'KUTU KAPAK', bundle: 1, on: true, match: s => /kutu/.test(s) && /kapa/.test(s) },
    { type: 'kosebent', label: 'KÖŞEBENT', bundle: 1, on: true, match: s => /kosebent/.test(s) },
    { type: 'pano', label: 'PANO U', bundle: 1, on: true, match: s => /(^|[^a-z])pano(\s|$)/.test(s) },
    { type: 'fitil', label: 'FİTİL', bundle: 1, on: false, match: s => /fitil/.test(s) },
    { type: 'strafor', label: 'STRAFOR', bundle: 1, on: false, match: s => /strafor/.test(s) },
  ];
  const OTHER = { type: 'diger', label: 'DİĞER', bundle: 1, on: false };

  // Aksan temizliği (kaynakta kaçış dizisi kullanmamak için karakter kodlarından kurulur)
  const RE_COMBINING = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
  const RE_DOTLESS_I = new RegExp(String.fromCharCode(0x131), 'g');

  function norm(s) {
    return String(s == null ? '' : s).trim().toLocaleLowerCase('tr')
      .normalize('NFD').replace(RE_COMBINING, '').replace(RE_DOTLESS_I, 'i');
  }

  /** Anahtar parçası: yalnız harf ve rakam ("3224.24" → "322424", "ANT.GRİ" → "antgri") */
  function keyPart(s) { return norm(s).replace(/[^a-z0-9]/g, ''); }

  /** "74" → 74, "A-3" → "A-3" (sayısal pozlar sayı olarak tutulur) */
  function normPoz(v) {
    if (typeof v === 'number') return v;
    const t = String(v == null ? '' : v).trim();
    return /^\d+$/.test(t) ? Number(t) : t;
  }

  function typeOf(desc) {
    const s = norm(desc);
    return TYPES.find(t => t.match(s)) || OTHER;
  }

  /** Türkçe biçimli sayı: "1.274" → 1274, "3,68" → 3.68, "1.274,5" → 1274.5 */
  function parseTrNumber(t) {
    const s = String(t).trim().replace(/\s/g, '');
    if (!s || !/[\d]/.test(s)) return null;
    if (!/^[-+]?[\d.,]+$/.test(s)) return null;
    const dot = s.lastIndexOf('.'), com = s.lastIndexOf(',');
    let v;
    if (dot >= 0 && com >= 0) {
      v = com > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (com >= 0) {
      v = s.replace(/,/g, '.');
    } else if (dot >= 0) {
      // yalnız nokta: "1.274" binlik, "0.6" ondalık
      v = /^[-+]?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
    } else v = s;
    const n = Number(v);
    return isFinite(n) ? n : null;
  }

  /** Hücre/metinden ölçü (mm). Bozulmuş Excel tarihlerini düzeltir. */
  function decodeLen(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) {
      return { len: v.getDate() * 1000 + (v.getMonth() + 1), fixed: true, raw: v.toISOString().slice(0, 10) };
    }
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) return null;
      const m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(t);
      if (m) return { len: Number(m[1]) * 1000 + Number(m[2]), fixed: true, raw: t };
      const n = parseTrNumber(t);
      return n == null ? null : { len: Math.round(n) };
    }
    if (typeof v === 'number') {
      if (!isFinite(v)) return null;
      if (Number.isInteger(v) && v >= 36526 && v <= 73050) {
        // Excel tarih seri numarası: "1.005" → 1 Mayıs → 1005
        const date = new Date(Math.round((v - 25569) * 86400000));
        return { len: date.getUTCDate() * 1000 + (date.getUTCMonth() + 1), fixed: true, raw: v };
      }
      if (v > 0 && v < 100 && !Number.isInteger(v)) return { len: Math.round(v * 1000), fixed: true, raw: v };
      return { len: Math.round(v) };
    }
    return null;
  }

  // ---------------------------------------------------------------- metin / CSV

  function decodeText(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder('utf-8').decode(bytes.subarray(3));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { return new TextDecoder('windows-1254').decode(bytes); }
  }

  function sniffDelimiter(text) {
    const line = text.split(/\r?\n/).find(l => l.trim()) || '';
    const counts = [[';', 0], ['\t', 0], [',', 0], ['|', 0]].map(([d]) => [d, line.split(d).length - 1]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ';';
  }

  function parseCsv(text, delim) {
    const rows = [];
    let row = [], field = '', i = 0, quoted = false;
    const push = () => { row.push(field); field = ''; };
    const eol = () => { push(); if (row.length > 1 || row[0] !== '') rows.push(row); row = []; };
    while (i < text.length) {
      const c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"' && field === '') { quoted = true; i++; continue; }
      if (c === delim) { push(); i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { eol(); i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) eol();
    return rows;
  }

  // ---------------------------------------------------------------- sütunları bulma

  const HEADER_ALIASES = {
    poz: ['poz no', 'poz', 'pozno', 'poz numarasi'],
    ref: ['referans no', 'referans', 'musteri pozu', 'musteri poz', 'musteri poz no', 'musteri pozu no'],
    stok: ['stok kodu', 'stok', 'stokkodu', 'malzeme kodu'],
    acik: ['aciklama', 'malzeme', 'malzeme adi', 'tanim'],
    renk: ['renk'],
    adet: ['adet', 'miktar'],
    olcu: ['olcu', 'olcu (mm)', 'boy', 'uzunluk'],
  };
  const COLUMN_NAMES = { poz: 'poz', ref: 'müşteri pozu', stok: 'stok kodu', acik: 'açıklama', renk: 'renk', adet: 'adet', olcu: 'ölçü' };

  function findHeader(rows) {
    for (let r = 0; r < Math.min(rows.length, 30); r++) {
      const cells = (rows[r] || []).map(norm);
      const col = {};
      for (const [key, names] of Object.entries(HEADER_ALIASES)) {
        col[key] = cells.findIndex(c => names.includes(c));
      }
      if (col.poz >= 0 && col.adet >= 0 && col.olcu >= 0) return { row: r, col };
    }
    return null;
  }

  /**
   * Başlıksız ERP çıktısında sütunları içerikten bulur.
   * Çapa **açıklama** sütunudur (en uzun, içinde boşluk geçen metin). Solundaki sütun stok
   * kodu, sağındaki renk; açıklamadan sonraki "her satırda tam sayı" olan ilk sütun adet,
   * onun sağı ölçüdür. Poz ilk sütundur; poz ile stok kodu arasında sütun varsa müşteri pozudur.
   * Dönüş: { poz, ref, stok, acik, renk, adet, olcu } (olmayan sütun −1) ya da null.
   */
  function inferRawColumns(rows) {
    const sample = [];
    for (const r of rows) {
      if (r && r.length >= 4) sample.push(r);
      if (sample.length >= 600) break;
    }
    if (!sample.length) return null;
    let ncol = 0;
    for (const r of sample) if (r.length > ncol) ncol = r.length;
    const N = sample.length;
    const stat = [];
    for (let c = 0; c < ncol; c++) {
      let fill = 0, ints = 0, texts = 0, lenSum = 0, spaced = 0;
      for (const r of sample) {
        const v = r[c];
        if (v == null) continue;
        const t = String(v).trim();
        if (!t) continue;
        fill++;
        const n = typeof v === 'number' ? v : parseTrNumber(t);
        if (n != null) { if (Number.isInteger(n) && n >= 0) ints++; }
        else { texts++; lenSum += t.length; if (/\s/.test(t)) spaced++; }
      }
      stat.push({ fill: fill / N, int: ints / N, text: texts / N, avgLen: texts ? lenSum / texts : 0, spaced: texts ? spaced / texts : 0 });
    }
    // açıklama: çoğu satırda metin olan sütunlar içinde en uzun ve en "cümle gibi" olanı
    let acik = -1, best = 0;
    for (let c = 0; c < ncol; c++) {
      const s = stat[c];
      if (s.text < 0.7) continue;
      const score = s.avgLen * (0.5 + s.spaced);
      if (score > best) { best = score; acik = c; }
    }
    if (acik < 1) return null;                       // en az poz + açıklama olmalı
    // adet: açıklamadan sonraki, (neredeyse) her satırda tam sayı olan ilk sütun
    let adet = -1;
    for (let c = acik + 1; c < ncol; c++) if (stat[c].int >= 0.9) { adet = c; break; }
    if (adet < 0) return null;
    if (stat[0].fill < 0.9) return null;             // poz her satırda dolu olmalı
    const stok = acik - 1 >= 1 ? acik - 1 : -1;
    return {
      poz: 0,
      ref: stok >= 2 ? 1 : -1,
      stok,
      acik,
      renk: adet - acik >= 2 ? acik + 1 : -1,
      adet,
      olcu: adet + 1 < ncol ? adet + 1 : -1,
    };
  }

  function describeColumns(col, ncol) {
    const byIndex = [];
    for (const [k, i] of Object.entries(col)) if (i >= 0) byIndex[i] = COLUMN_NAMES[k] || k;
    const out = [];
    for (let i = 0; i < Math.max(ncol || 0, byIndex.length); i++) out.push(byIndex[i] || '–');
    return out;
  }

  function orderNoFrom(sheetName, fileName) {
    for (const s of [fileName || '', sheetName || '']) {
      const m = /(\d{3,})/.exec(String(s));
      if (m) return String(Number(m[1]));          // baştaki sıfırlar atılır
    }
    const m2 = /(\d+)/.exec(String(sheetName || ''));
    return m2 ? String(Number(m2[1])) : '';
  }

  // ---------------------------------------------------------------- malzemeleri toplama

  /**
   * records: [{poz, ref, stok, desc, color, count, lenCell, section}]
   * Ölçülü satırları stok kodu + renk bazında malzemelere toplar.
   */
  function buildMaterials(records, ctx) {
    const materials = new Map();
    const warnings = [];
    const skipped = new Map();   // açıklama → ölçüsüz satır sayısı
    let hasRef = false;
    for (const rec of records) {
      const desc = String(rec.desc == null ? '' : rec.desc).trim();
      const d = decodeLen(rec.lenCell);
      const count = typeof rec.count === 'number' ? rec.count : parseTrNumber(rec.count);
      if (!d || !d.len || d.len <= 0 || count == null || count <= 0) {
        const k = desc || '(adsız)';
        skipped.set(k, (skipped.get(k) || 0) + 1);
        continue;
      }
      const where = rec.section ? ` (${rec.section})` : '';
      if (d.fixed) warnings.push({ poz: normPoz(rec.poz), raw: d.raw, fixed: d.len, message: `Poz ${rec.poz}${where} ${desc}: ölçü "${d.raw}" tarih/biçim bozulması → ${d.len} mm olarak düzeltildi` });
      if (d.len < 50) warnings.push({ poz: normPoz(rec.poz), raw: rec.lenCell, fixed: d.len, message: `Poz ${rec.poz}${where} ${desc}: şüpheli ölçü ${d.len} mm` });
      const t = typeOf(desc);
      const color = String(rec.color == null ? '' : rec.color).trim();
      const stok = String(rec.stok == null ? '' : rec.stok).trim();
      // Anahtar: stok kodu (noktalamasız) + renk. Stok kodu yoksa açıklama kullanılır.
      const key = `${t.type}|${keyPart(stok) || 'ad:' + norm(desc)}|${keyPart(color)}`;
      let mat = materials.get(key);
      if (!mat) {
        mat = { key, type: t.type, typeLabel: t.label, defaultBundle: t.bundle, defaultOn: t.on, known: t !== OTHER, desc: desc || t.label, color, stokCodes: [], items: [], section: rec.section || '' };
        materials.set(key, mat);
      }
      if (stok && !mat.stokCodes.includes(stok)) mat.stokCodes.push(stok);
      const refT = rec.ref == null ? '' : String(rec.ref).trim();
      const ref = refT === '' ? null : normPoz(refT);
      if (ref != null) hasRef = true;
      mat.items.push({ poz: normPoz(rec.poz), ref, count: Math.round(count), len: d.len, stok, color, desc, section: rec.section || '' });
    }
    const list = [...materials.values()];
    for (const m of list) {
      m.pieces = m.items.reduce((s, i) => s + i.count, 0);
      m.totalMm = m.items.reduce((s, i) => s + i.count * i.len, 0);
      m.maxLen = m.items.reduce((s, i) => Math.max(s, i.len), 0);
      m.pozCount = new Set(m.items.map(i => String(i.poz))).size;
    }
    const pozCount = new Set(records.map(r => String(r.poz).trim())).size;
    list.sort((a, b) => {
      const ia = TYPES.findIndex(t => t.type === a.type), ib = TYPES.findIndex(t => t.type === b.type);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.desc.localeCompare(b.desc, 'tr') || a.color.localeCompare(b.color, 'tr');
    });
    assignLabels(list);
    return {
      orderNo: ctx.orderNo, sheetName: ctx.sheetName, fileName: ctx.fileName, layout: ctx.layout,
      columns: ctx.columns || [], hasRef, pozCount,
      materials: list, warnings, sections: ctx.sections || [],
      skipped: [...skipped.entries()].map(([desc, count]) => ({ desc, count })),
      rowCount: records.length,
    };
  }

  /** Başlıklı tablo (bölümlü olabilir) → kayıtlar */
  function recordsFromHeader(rows, hdr) {
    const col = hdr.col, out = [], sections = [];
    let section = null;
    for (let r = hdr.row + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const poz = row[col.poz];
      const stok = col.stok >= 0 ? row[col.stok] : null;
      const acik = col.acik >= 0 ? row[col.acik] : null;
      const isSection = (poz == null || poz === '') && (stok == null || stok === '') && acik != null && String(acik).trim() !== '';
      if (isSection) {
        const name = String(acik).trim();
        if (/^toplam/.test(norm(name))) break;
        section = name;
        sections.push({ name, count: 0 });
        continue;
      }
      if (poz == null || poz === '') continue;
      if (sections.length) sections[sections.length - 1].count++;
      out.push({
        poz: typeof poz === 'number' ? poz : String(poz).trim(),
        ref: col.ref >= 0 ? row[col.ref] : null,
        stok, desc: acik, color: col.renk >= 0 ? row[col.renk] : '',
        count: row[col.adet], lenCell: row[col.olcu], section,
      });
    }
    return { records: out, sections };
  }

  /** Başlıksız ERP düzeni → kayıtlar (sütunlar inferRawColumns ile bulunmuş) */
  function recordsFromRaw(rows, col) {
    const out = [];
    for (const row of rows) {
      if (!row || row.length <= col.adet) continue;
      const poz = row[col.poz];
      if (poz == null || String(poz).trim() === '') continue;
      const adet = row[col.adet];
      if (typeof adet !== 'number' && parseTrNumber(adet == null ? '' : adet) == null) continue;   // başlık / ara satır
      out.push({
        poz: typeof poz === 'number' ? poz : String(poz).trim(),
        ref: col.ref >= 0 ? row[col.ref] : null,
        stok: col.stok >= 0 ? row[col.stok] : null,
        desc: row[col.acik],
        color: col.renk >= 0 ? row[col.renk] : '',
        count: adet,
        lenCell: col.olcu >= 0 ? row[col.olcu] : null,
        section: null,
      });
    }
    return { records: out, sections: [] };
  }

  function fromRows(rows, ctx) {
    const hdr = findHeader(rows);
    let parsed, layout, columns;
    if (hdr) {
      parsed = recordsFromHeader(rows, hdr); layout = 'başlıklı';
      columns = describeColumns(hdr.col, 0);
    } else {
      const col = inferRawColumns(rows);
      if (!col) throw new Error('Tanınmayan dosya düzeni: başlık satırı (Poz no / Adet / Ölçü) bulunamadı ve sütunlar içerikten de çıkarılamadı (poz, açıklama ve adet sütunları gerekli).');
      parsed = recordsFromRaw(rows, col); layout = 'ERP ham';
      let ncol = 0;
      for (const r of rows.slice(0, 50)) if (r && r.length > ncol) ncol = r.length;
      columns = describeColumns(col, ncol);
    }
    if (!parsed.records.length) throw new Error('Dosyada satır bulunamadı.');
    return buildMaterials(parsed.records, Object.assign({ layout, columns, sections: parsed.sections }, ctx));
  }

  function parseWorkbook(wb, fileName) {
    const sheetName = wb.SheetNames.find(n => /maliyet|imalat/i.test(n)) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    return fromRows(rows, { sheetName, fileName: fileName || '', orderNo: orderNoFrom(sheetName, fileName) });
  }

  function parseCsvText(text, fileName) {
    const rows = parseCsv(text, sniffDelimiter(text));
    return fromRows(rows, { sheetName: '', fileName: fileName || '', orderNo: orderNoFrom('', fileName) });
  }

  /**
   * Birden fazla projeyi tek havuzda birleştirir.
   * files: [{ orderNo, customer, date, note, parsed }]  (parsed = parseBuffer çıktısı)
   * Dönüş: stok kodu + renk bazında malzemeler. Her poz kendi proje no / müşteri bilgisini
   * taşır; aynı stok kodu ve renkteki pozlar hangi projeden gelirse gelsin aynı havuza girer.
   */
  function mergeProjects(files) {
    const map = new Map();
    for (const f of files) {
      for (const m of f.parsed.materials) {
        let e = map.get(m.key);
        if (!e) {
          e = { key: m.key, type: m.type, typeLabel: m.typeLabel, desc: m.desc, color: m.color, known: m.known,
                defaultBundle: m.defaultBundle, defaultOn: m.defaultOn, stokCodes: [], items: [], orders: [], pieces: 0, totalMm: 0, maxLen: 0 };
          map.set(m.key, e);
        }
        for (const c of m.stokCodes) if (!e.stokCodes.includes(c)) e.stokCodes.push(c);
        for (const it of m.items) {
          e.items.push({ order: f.orderNo, customer: f.customer, poz: it.poz, ref: it.ref == null ? null : it.ref, len: it.len, count: it.count, stok: it.stok, color: it.color });
          e.pieces += it.count; e.totalMm += it.count * it.len;
          if (it.len > e.maxLen) e.maxLen = it.len;
        }
        e.orders.push({ orderNo: f.orderNo, customer: f.customer, date: f.date, note: f.note, pozCount: m.items.length });
      }
    }
    const rank = t => { const i = TYPES.findIndex(x => x.type === t); return i < 0 ? 99 : i; };
    const arr = [...map.values()].sort((a, b) => rank(a.type) - rank(b.type) || a.desc.localeCompare(b.desc, 'tr') || a.color.localeCompare(b.color, 'tr'));
    for (const m of arr) m.pozCount = new Set(m.items.map(i => i.order + '/' + i.poz)).size;
    assignLabels(arr);
    return arr;
  }

  /**
   * Her malzemeye kısa ve ayırt edici bir ad verir (sekme / Excel sayfa adı):
   * tür etiketi (LAMEL, DİKME…); aynı türden birden fazla malzeme varsa açıklamadaki ayırt edici
   * sözcük (EKO / STANDART) ve renkler farklıysa renk eklenir; yine aynıysa stok kodu eklenir.
   */
  function assignLabels(mats) {
    const groups = new Map();
    for (const m of mats) {
      const base = m.known ? m.typeLabel : m.desc.split(/\s+/).slice(0, 2).join(' ').toLocaleUpperCase('tr');
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base).push(m);
    }
    for (const [base, list] of groups) {
      if (list.length === 1) { list[0].label = base; continue; }
      const colorsDiffer = new Set(list.map(m => keyPart(m.color))).size > 1;
      const words = list.map(m => m.desc.split(/\s+/).filter(Boolean));
      const common = words[0].filter(w => words.every(ws => ws.includes(w)));
      list.forEach((m, i) => {
        const distinct = words[i].filter(w => !common.includes(w)).slice(0, 2).join(' ');
        m.label = [base, distinct, colorsDiffer ? m.color : ''].filter(Boolean).join(' ');
      });
      const count = new Map();
      for (const m of list) count.set(m.label, (count.get(m.label) || 0) + 1);
      for (const m of list) if (count.get(m.label) > 1) m.label += ' ' + (m.stokCodes[0] || '');
    }
  }

  function isZipOrOle(bytes) {
    return (bytes[0] === 0x50 && bytes[1] === 0x4B) || (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0);
  }

  /** Dosya içeriğinden (ArrayBuffer/Uint8Array) ayrıştırır; .csv ve .xls/.xlsx. */
  function parseBuffer(buf, fileName) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const isText = /\.(csv|txt)$/i.test(fileName || '') || !isZipOrOle(bytes);
    if (isText) return parseCsvText(decodeText(bytes), fileName);
    const wb = XLSX.read(bytes, { type: 'array', cellDates: false });
    return parseWorkbook(wb, fileName);
  }

  return { parseBuffer, parseWorkbook, parseCsvText, parseCsv, decodeText, decodeLen, parseTrNumber, normPoz, keyPart, typeOf, norm, inferRawColumns, mergeProjects, assignLabels, TYPES, OTHER };
});

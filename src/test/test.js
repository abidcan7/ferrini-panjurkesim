/* Testler. Tarayıcıda: bash run.sh "iters=60000&xlsx=1" (headless Chrome, test.html)
 *           Node'da:    node run-node.js "iters=60000&xlsx=1"  (aynı dosya, tarayıcısız) */
(async function () {
  const out = [];
  const el = document.getElementById('out');
  const log = (...a) => { out.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); el.textContent = out.join('\n'); };
  const q = new URLSearchParams(location.search);
  const ITERS = Number(q.get('iters') || 60000);
  const ONLY = q.get('only') || '';
  const SEED = Number(q.get('seed') || 12345);
  let fails = 0;
  const check = (cond, msg) => { if (!cond) { fails++; log('FAIL:', msg); } else log('ok:', msg); };

  async function fetchBuf(rel) {
    const r = await fetch(encodeURI(rel));
    if (!r.ok) throw new Error('fetch failed ' + rel + ' ' + r.status);
    return new Uint8Array(await r.arrayBuffer());
  }

  try {
    // ---------------------------------------------------------------- parser
    const buf = await fetchBuf('../../İMALAT LİSTESİ.xls');
    const parsed = PanjurParse.parseBuffer(buf, 'İMALAT LİSTESİ.xls');
    log('order', parsed.orderNo, 'sheet', parsed.sheetName, 'sections', parsed.sections);
    check(parsed.orderNo === '19757', 'sipariş no 19757');
    const byType = Object.fromEntries(parsed.materials.map(m => [m.type, m]));
    check(byType.lamel && byType.lamel.items.length === 122, 'lamel 122 poz');
    check(byType.altparca && byType.altparca.items.length === 122, 'alt parça 122 poz');
    check(byType.dikme && byType.dikme.items.length === 122, 'dikme 122 poz');
    check(byType.tambur && byType.tambur.items.length === 122, 'tambur 122 poz');
    check(byType.lamel.color === 'ANT.GRİ' && byType.lamel.desc === 'AS 55 EKO ALÜMINYUM LAMEL', 'lamel renk/açıklama: ' + byType.lamel.color + ' / ' + byType.lamel.desc);
    const d53 = byType.dikme.items.find(i => i.poz === 53), d11 = byType.dikme.items.find(i => i.poz === 11);
    check(d53 && d53.len === 1005, 'dikme poz 53 → 1005 (tarih düzeltme)');
    check(d11 && d11.len === 1010, 'dikme poz 11 → 1010 (tarih düzeltme)');
    check(parsed.warnings.length === 12, 'uyarı sayısı 12 (6 dikme + 6 fitil, aynı bozuk ölçüler): ' + parsed.warnings.length);
    check(parsed.warnings.filter(w => /DİKMELİ/.test(w.message)).length === 6, 'dikme uyarısı 6');
    const l26 = byType.lamel.items.find(i => i.poz === 26);
    check(l26 && l26.count === 22 && l26.len === 929, 'lamel poz 26: 22×929');
    const lamelLenSum = byType.lamel.items.reduce((s, i) => s + i.len, 0);
    check(lamelLenSum === 178468, 'lamel Σölçü 178468 (ERP başlığı) → ' + lamelLenSum);
    check(PanjurParse.typeOf('TAPA SL-56').type === 'diger' && PanjurParse.typeOf('AS 55 EKO ALÜMINYUM LAMEL').type === 'lamel', 'TAPA lamel sayılmadı');
    check(byType.fitil && byType.fitil.defaultOn === false, 'fitil tanındı ve varsayılan kapalı');
    // decodeLen ek testleri
    check(PanjurParse.decodeLen(46143).len === 1005 && PanjurParse.decodeLen(46296).len === 1010, 'decodeLen seri');
    check(PanjurParse.decodeLen('1.005').len === 1005 && PanjurParse.decodeLen(1.012).len === 1012, 'decodeLen string/float');

    // ---------------------------------------------------------------- ERP ham CSV (yeni biçim)
    const csvBuf = await fetchBuf('../../000000000021542_İmalat.csv');
    const csv = PanjurParse.parseBuffer(csvBuf, '000000000021542_İmalat.csv');
    log('CSV:', { order: csv.orderNo, layout: csv.layout, rows: csv.rowCount, mats: csv.materials.map(m => `${m.typeLabel}/${m.desc.slice(0, 18)}/${m.color}: ${m.items.length} poz ${m.pieces} parça`), skipped: csv.skipped });
    check(csv.orderNo === '21542', 'CSV sipariş no 21542 → ' + csv.orderNo);
    check(csv.layout === 'ERP ham', 'CSV düzeni ERP ham → ' + csv.layout);
    check(csv.rowCount === 1875, 'CSV 1875 satır → ' + csv.rowCount);
    const cT = Object.fromEntries(csv.materials.map(m => [m.type, m]));
    check(cT.lamel && cT.lamel.items.length === 156, 'CSV lamel 156 poz');
    check(cT.altparca && cT.altparca.items.length === 156, 'CSV alt parça 156 poz');
    check(cT.dikme && cT.dikme.items.length === 156, 'CSV dikme 156 poz');
    check(cT.tambur && cT.tambur.items.length === 156, 'CSV tambur 156 poz');
    check(cT.lamel.color === 'BEJ GRİ' && cT.lamel.desc === 'AS 55 EKO ALÜMINYUM LAMEL', 'CSV renk/açıklama: ' + cT.lamel.color + ' / ' + cT.lamel.desc);
    check(cT.lamel.stokCodes.join() === 'TAP.P.SD.B06.55E', 'CSV lamel stok kodu: ' + cT.lamel.stokCodes.join());
    const c74 = cT.lamel.items.find(i => i.poz === 74), c73 = cT.lamel.items.find(i => i.poz === 73);
    check(c74 && c74.count === 39 && c74.len === 674, 'CSV poz 74: 39×674');
    check(c73 && c73.len === 1274, 'CSV poz 73: "1.274" → 1274 (binlik ayırıcı) → ' + (c73 && c73.len));
    check(cT.dikme.items.every(i => i.count === 2), 'CSV dikme hepsi 2 adet');
    check(cT.dikme.items.find(i => i.poz === 48).len === 1950 && cT.dikme.items.find(i => i.poz === 74).len === 2135, 'CSV dikme poz 48 → 1950, poz 74 → 2135');
    check(typeof cT.lamel.items[0].poz === 'number', 'CSV poz sayı tipinde');
    check(csv.warnings.length === 0, 'CSV uyarı yok → ' + csv.warnings.map(w => w.message).join(' | '));
    const skipMotor = csv.skipped.find(s => /MOTOR/i.test(s.desc));
    check(skipMotor && skipMotor.count === 156, 'CSV motor satırları atlandı (ölçüsüz)');
    check(cT.lamel.pieces === csv.materials.find(m => m.type === 'lamel').items.reduce((a, b) => a + b.count, 0), 'CSV parça sayısı tutarlı');
    // parseTrNumber birim testleri
    const tn = PanjurParse.parseTrNumber;
    check(tn('1.274') === 1274 && tn('674') === 674 && tn('3,68004') === 3.68004 && tn('1.274,5') === 1274.5 && tn('') === null, 'parseTrNumber');
    // aynı verinin xlsx ikizi aynı sonucu vermeli
    const xBuf = await fetchBuf('../../000000000021542_İmalat.xlsx');
    const xls = PanjurParse.parseBuffer(xBuf, '000000000021542_İmalat.xlsx');
    const sig = p => p.materials.map(m => `${m.key}:${m.items.length}:${m.pieces}:${m.totalMm}`).join('|');
    check(sig(csv) === sig(xls), 'CSV ile xlsx ikizi aynı: ' + (sig(csv) === sig(xls) ? 'evet' : sig(csv) + ' ≠ ' + sig(xls)));
    check(xls.orderNo === '21542', 'xlsx ikizi sipariş no 21542 → ' + xls.orderNo);

    // ---------------------------------------------------------------- müşteri pozu sütunlu ERP çıktıları (örnek projeler/)
    // Düzen: poz; müşteri pozu; stok; açıklama; renk; adet; ölçü  (ağırlık sütunu yok)
    const real = {};
    for (const no of ['24714', '23876', '24221', '24543']) {
      const name = `0000000000${no}_İmalat.csv`;
      real[no] = PanjurParse.parseBuffer(await fetchBuf('../../örnek projeler/' + name), name);
    }
    const colsA2 = 'poz|müşteri pozu|stok kodu|açıklama|renk|adet|ölçü';
    for (const no of Object.keys(real)) {
      check(real[no].orderNo === no && real[no].layout === 'ERP ham' && real[no].columns.join('|') === colsA2, `${no}: okundu, sütunlar ${real[no].columns.join(' · ')}`);
    }
    check(csv.columns.join('|') === 'poz|stok kodu|açıklama|renk|adet|ölçü|–', '21542 (müşteri pozsuz, ağırlıklı düzen) sütunları: ' + csv.columns.join(' · '));
    const rT = (no, type) => real[no].materials.filter(m => m.type === type);
    // 24714 — 6 poz, müşteri pozu boş
    const l24714 = rT('24714', 'lamel')[0];
    check(rT('24714', 'lamel').length === 1 && l24714.items.length === 6 && l24714.color === 'ANT.GRİ' && l24714.stokCodes.join() === 'TAP.P.SD.V16.55E', '24714 lamel: 6 poz, ANT.GRİ, TAP.P.SD.V16.55E');
    check(l24714.items.map(i => i.count).sort().join() === '35,35,35,35,35,37' && l24714.items.find(i => i.poz === 4).len === 2254 && l24714.items.find(i => i.poz === 4).count === 37, '24714 lamel: adetler 35×5 + 37, poz 4 → 37×2254');
    check(real['24714'].hasRef === false && l24714.items.every(i => i.ref === null), '24714: müşteri pozu boş');
    check(rT('24714', 'dikme')[0].items.every(i => i.count === 2) && rT('24714', 'tambur')[0].items.find(i => i.poz === 6).len === 2750, '24714: dikme 2 adet, tambur poz 6 → 2750');
    // 23876 — 15 poz, müşteri pozu dolu
    const l23876 = rT('23876', 'lamel')[0];
    check(l23876.items.length === 15 && real['23876'].hasRef === true, '23876 lamel: 15 poz, müşteri pozu var');
    const p15 = l23876.items.find(i => i.poz === 15), p5 = l23876.items.find(i => i.poz === 5);
    check(p15 && p15.ref === 8 && p15.count === 28 && p15.len === 1314, '23876 poz 15: müşteri pozu 8, 28×1314');
    check(p5 && p5.ref === 5 && p5.count === 42 && p5.len === 1884, '23876 poz 5: müşteri pozu 5, 42×1884');
    const kutu185 = real['23876'].materials.find(m => /KUTU KAPAK 185/.test(m.desc));
    check(kutu185 && kutu185.type === 'diger' && kutu185.known === false && kutu185.defaultOn === false && kutu185.items[0].len === 25000, '23876: "PANJUR KUTU KAPAK 185 MM" tanınmayan parça, 25.000 mm, varsayılan kapalı');
    check(real['23876'].skipped.some(x => /YAN KAPAK 45/.test(x.desc)) && real['23876'].skipped.some(x => /MOTOR/.test(x.desc)), '23876: ölçüsüz satırlar (yan kapak, motor) atlandı');
    // 24221 — 72 poz, iki ayrı lamel ve iki ayrı alt parça
    const lam24221 = rT('24221', 'lamel');
    check(lam24221.length === 2 && lam24221.map(m => m.items.length).sort((a, b) => a - b).join() === '6,66', '24221: iki ayrı lamel (EKO 66 poz, STANDART 6 poz) → ' + lam24221.map(m => m.desc + ' ' + m.items.length).join(' | '));
    const alt24221 = rT('24221', 'altparca');
    check(alt24221.length === 2 && alt24221.some(m => m.color === 'RALL BOYA' && m.items.length === 6) && alt24221.some(m => m.color === 'ANT.GRİ' && m.items.length === 66), '24221: iki ayrı alt parça (K.SİZ ANT.GRİ 66, K.Lİ RALL BOYA 6)');
    check(rT('24221', 'dikme')[0].items.length === 72 && rT('24221', 'tambur')[0].items.length === 72, '24221: dikme 72, tambur 72 poz');
    const eko24221 = lam24221.find(m => /EKO/.test(m.desc));
    const adetHist = {}; for (const i of eko24221.items) adetHist[i.count] = (adetHist[i.count] || 0) + 1;
    check(JSON.stringify(adetHist) === JSON.stringify({ 12: 1, 13: 5, 21: 4, 22: 2, 28: 6, 45: 1, 46: 47 }), '24221 EKO lamel adet dağılımı: ' + JSON.stringify(adetHist));
    check(eko24221.items.every(i => Number.isInteger(i.len) && i.len >= 500 && i.len <= 3000), '24221 EKO lamel ölçüleri 544–2774 arası tam sayı');
    // 24543 — tek poz; aynı adlı ama stok kodu farklı kutu kapakları ayrı kalmalı
    const l24543 = rT('24543', 'lamel')[0];
    check(l24543.items.length === 1 && l24543.items[0].count === 40 && l24543.items[0].len === 2998, '24543 lamel: 1 poz, 40×2998');
    const kk220 = real['24543'].materials.filter(m => m.desc === 'PANJUR KUTU KAPAK 220 MM');
    check(kk220.length === 2 && kk220.map(m => m.stokCodes.join()).sort().join(' | ') === 'P-1301/2072 | P-1301/3072', '24543: aynı adlı iki kutu kapağı stok koduna göre ayrı: ' + kk220.map(m => m.stokCodes.join()).join(' | '));
    const fit67 = real['24543'].materials.find(m => /67\*700/.test(m.desc));
    check(fit67 && fit67.items.length === 2 && fit67.items.every(i => i.poz === 1), '24543: aynı pozun iki fitil satırı ayrı kalemler olarak okundu');
    // sütun çıkarımı birim testleri
    const inf = rows => { const c = PanjurParse.inferRawColumns(rows); return c ? [c.poz, c.ref, c.stok, c.acik, c.renk, c.adet, c.olcu].join() : 'null'; };
    const A1 = [['74', 'TAP.P.SD.B06.55E', 'AS 55 EKO ALÜMINYUM LAMEL', 'BEJ GRİ', '39', '674', '3,68004'], ['1', 'WSS50-10/17', 'FERRİNİ-10/17  DÜZ MOTOR', '', '1', '', '2,5'], ['2', '3224.7006', 'ALT PARÇA-55D  K.SİZ', 'BEJ GRİ', '1', '1.274', '0,9']];
    const A2 = [['1', '', 'TAP.P.SD.V16.55E', 'AS 55 EKO ALÜMINYUM LAMEL', 'ANT.GRİ', '35', '1.664'], ['1', '', 'WSS50-20/17', 'FERRİNİ-20/17  DÜZ MOTOR', '', '1', ''], ['2', '7', '3224.24', 'ALT PARÇA-55D  K.SİZ', 'ANT.GRİ', '1', '1.684']];
    check(inf(A1) === '0,-1,1,2,3,4,5', 'sütun çıkarımı — poz;stok;açıklama;renk;adet;ölçü;ağırlık → ' + inf(A1));
    check(inf(A2) === '0,1,2,3,4,5,6', 'sütun çıkarımı — poz;müşteri pozu;stok;açıklama;renk;adet;ölçü → ' + inf(A2));
    check(inf([['a', 'b'], ['c', 'd']]) === 'null', 'sütun çıkarımı — anlamsız tablo reddedilir');
    check(PanjurParse.keyPart('3224.24') === PanjurParse.keyPart('322424') && PanjurParse.keyPart('ANT.GRİ') === 'antgri', 'anahtar: 3224.24 = 322424, ANT.GRİ → antgri');
    // dört gerçek proje + eski 19757 tek havuzda
    const realFiles = [
      { orderNo: '24714', customer: q.get('nocust') ? '' : 'A MÜŞTERİ', date: q.get('nocust') ? '' : '2026-11-12', note: '', parsed: real['24714'] },
      { orderNo: '23876', customer: q.get('nocust') ? '' : 'B MÜŞTERİ', date: q.get('nocust') ? '' : '2026-11-13', note: '', parsed: real['23876'] },
      { orderNo: '24221', customer: q.get('nocust') ? '' : 'C MÜŞTERİ', date: q.get('nocust') ? '' : '2026-11-14', note: '', parsed: real['24221'] },
      { orderNo: '24543', customer: q.get('nocust') ? '' : 'D MÜŞTERİ', date: q.get('nocust') ? '' : '2026-11-15', note: '', parsed: real['24543'] },
    ];
    const merged4 = PanjurParse.mergeProjects(realFiles);
    const eko4 = merged4.find(m => m.type === 'lamel' && /EKO/.test(m.desc));
    check(eko4 && eko4.items.length === 6 + 15 + 66 + 1 && eko4.orders.length === 4, 'dört proje: EKO lamel tek havuz, ' + (eko4 && eko4.items.length) + ' poz, 4 proje');
    check(merged4.filter(m => m.type === 'lamel').length === 2, 'dört proje: STANDART lamel ayrı malzeme');
    // ayırt edici kısa adlar (sekme / sayfa adı)
    const lab = k => merged4.filter(m => m.type === k).map(m => m.label).sort().join(' | ');
    check(lab('lamel') === 'LAMEL EKO | LAMEL STANDART', 'etiketler — lamel: ' + lab('lamel'));
    check(lab('altparca') === 'ALT PARÇA K.Lİ RALL BOYA | ALT PARÇA K.SİZ ANT.GRİ', 'etiketler — alt parça: ' + lab('altparca'));
    check(lab('dikme') === 'DİKME' && lab('tambur') === 'TAMBUR', 'etiketler — tek malzemeli türler yalın: ' + lab('dikme') + ', ' + lab('tambur'));
    check(new Set(merged4.map(m => m.label)).size === merged4.length, 'etiketler benzersiz (' + merged4.length + ' malzeme): ' + merged4.filter(m => !m.known).map(m => m.label).join(' | '));
    // çubuk boyundan uzun poz: plana alınmaz, hata vermez
    const kk185 = merged4.find(m => /KUTU KAPAK 185/.test(m.desc));
    const ro = await PanjurOpt.optimize(kk185.items, Object.assign({}, PanjurOpt.DEFAULTS, { maxBundle: 1 }), { iters: 1000, yield: false });
    check(ro.oversize.length === 1 && ro.groups.length === 0 && ro.items.length === 0 && ro.validation.ok && ro.stats.bars === 0, 'çubuktan uzun tek poz (25.000 mm): plana alınmadı, hata yok');
    const mkO = (poz, count, len) => ({ order: '1', customer: 'T', poz, count, len });
    const mixO = await PanjurOpt.optimize([mkO(1, 2, 3000), mkO(2, 1, 25000), mkO(3, 2, 3100)], Object.assign({}, PanjurOpt.DEFAULTS, { maxBundle: 2 }), { iters: 2000, yield: false });
    check(mixO.oversize.length === 1 && mixO.oversize[0].poz === 2 && mixO.items.length === 2 && mixO.validation.ok && mixO.stats.bars === 2, 'karışık listede uzun poz ayrıldı, kalanlar çözüldü (2 çubuk)');
    const merged5 = PanjurParse.mergeProjects(realFiles.concat([{ orderNo: parsed.orderNo, customer: 'ÖRNEK PEN', date: '', note: '', parsed }]));
    const alt5 = merged5.find(m => m.type === 'altparca' && m.color === 'ANT.GRİ');
    check(alt5 && alt5.orders.length === 5 && alt5.stokCodes.slice().sort().join() === '3224.24,322424', 'eski xls ile birlikte: alt parça 3224.24 ve 322424 aynı havuzda (5 proje)');
    check(merged5.find(m => m.type === 'lamel' && /EKO/.test(m.desc)).items.length === 88 + 122, 'eski xls ile birlikte: EKO ANT.GRİ lamel 210 poz');

    // ---------------------------------------------------------------- çok proje birleştirme
    const csv2 = PanjurParse.parseBuffer(await fetchBuf('000000000021999_İmalat.csv'), '000000000021999_İmalat.csv');
    check(csv2.orderNo === '21999', 'ikinci proje no 21999 → ' + csv2.orderNo);
    const merged = PanjurParse.mergeProjects([
      { orderNo: csv.orderNo, customer: 'BİRİNCİ PEN', date: '2026-10-20', note: '', parsed: csv },
      { orderNo: csv2.orderNo, customer: 'İKİNCİ PEN', date: '2026-10-22', note: 'NOT', parsed: csv2 },
      { orderNo: parsed.orderNo, customer: 'ÖRNEK PEN', date: '2026-09-24', note: '', parsed },
    ]);
    const mT = k => merged.filter(m => m.type === k);
    check(mT('lamel').length === 2, 'birleşik: lamel 2 ayrı malzeme (BEJ GRİ + ANT.GRİ) → ' + mT('lamel').map(m => m.color).join(', '));
    const mLamBej = mT('lamel').find(m => m.color === 'BEJ GRİ'), mLamAnt = mT('lamel').find(m => m.color === 'ANT.GRİ');
    check(mLamBej.items.length === 156 + csv2.materials.find(m => m.type === 'lamel').items.length, 'birleşik: BEJ GRİ lamel iki projenin pozlarını içeriyor → ' + mLamBej.items.length);
    check(mLamBej.orders.length === 2 && mLamBej.orders.map(o => o.orderNo).join() === '21542,21999', 'birleşik: BEJ GRİ lamelde 2 proje');
    check(mLamAnt.items.length === 122 && mLamAnt.orders.length === 1, 'birleşik: ANT.GRİ lamel ayrı kaldı (122 poz, 1 proje)');
    check(mT('tambur').length === 1 && mT('tambur')[0].orders.length === 3, 'birleşik: renksiz tambur 3 projede tek havuz → ' + mT('tambur')[0].items.length + ' poz');
    check(mLamBej.items.every(i => i.order && i.customer), 'birleşik: her poz proje no ve müşteri taşıyor');
    check(mLamBej.pieces === mLamBej.items.reduce((a, b) => a + b.count, 0), 'birleşik: parça sayısı tutarlı');
    // aynı poz no iki projede de var mı? (karışmaması gereken durum)
    const pozKey = new Set(mLamBej.items.map(i => i.order + '/' + i.poz));
    check(pozKey.size === mLamBej.items.length, 'birleşik: proje/poz çiftleri benzersiz (aynı poz no iki projede olabilir)');

    // ---------------------------------------------------------------- insan çözümü (3 sipariş)
    // Elle yapılmış örnek dosya müşteri adları içerdiği için depoda yoktur. Yerelde
    // src/test/yerel/elle-ornek.xlsx olarak duruyorsa insan çözümüyle karşılaştırma da koşar;
    // yoksa lamel ve dikme denemeleri 19757 projesinin (İMALAT LİSTESİ.xls) pozlarıyla yapılır.
    let hbuf = null;
    try { hbuf = await fetchBuf('yerel/elle-ornek.xlsx'); } catch (e) { log('not: yerel/elle-ornek.xlsx yok — insan çözümü karşılaştırması atlandı'); }
    const hwb = hbuf ? XLSX.read(hbuf, { type: 'array', cellDates: false }) : null;
    function readCols(ws, cols) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      const items = []; const groups = []; let cur = []; let kalan = false;
      for (let r = range.s.r; r <= range.e.r; r++) {
        const cell = ci => ws[XLSX.utils.encode_cell({ r, c: ci })];
        const val = ci => { const x = cell(ci); return x ? x.v : null; };
        const [a, b, c, d, e] = cols.map(val);
        const ecell = cell(cols[4]);
        if (ecell && ecell.f && /SUM/i.test(ecell.f)) { groups.push(cur); cur = []; continue; }
        if (b === 'KALANLAR') { kalan = true; continue; }
        if (typeof a === 'number' && typeof e === 'number' && typeof c === 'number') {
          const it = { order: String(a), customer: String(b).trim(), poz: c, count: d, len: e };
          items.push(it); if (!kalan) cur.push(it);
        }
      }
      return { items, groups };
    }
    const asItems = m => m.items.map(i => ({ order: '19757', customer: 'ÖRNEK PEN', poz: i.poz, len: i.len, count: i.count }));
    const hl = hwb ? readCols(hwb.Sheets['Sayfa1'], [0, 1, 2, 3, 4]) : null;
    const hd1 = hwb ? readCols(hwb.Sheets['Sayfa2'], [0, 1, 2, 3, 4]) : null;
    const hd2 = hwb ? readCols(hwb.Sheets['Sayfa2'], [6, 7, 8, 9, 10]) : null;
    const hd3 = hwb ? readCols(hwb.Sheets['Sayfa2'], [15, 16, 17, 18, 19]) : null;
    const lamelItems = hwb ? hl.items : asItems(byType.lamel), dikmeItems = hwb ? hd1.items.concat(hd2.items, hd3.items) : asItems(byType.dikme);
    if (hwb) {
      check(lamelItems.length === 158, 'insan dosyası lamel 158 poz → ' + lamelItems.length);
      check(dikmeItems.length === 144, 'insan dosyası dikme 144 poz → ' + dikmeItems.length);
    }

    const P = Object.assign({}, PanjurOpt.DEFAULTS, { seed: SEED });
    for (const k of ['T0', 'T1', 'wKalan', 'wCut', 'wBar', 'wChange', 'wSpread', 'maxSpread', 'pLNS', 'wFill', 'pElim', 'pFill', 'minSum', 'debug', 'allowSplit', 'mergeSameLength', 'multiStep']) if (q.get(k) != null) P[k] = Number(q.get(k));
    // Adet farkı sınırı olmayan eski model (insan çözümüyle karşılaştırma ve eski birim testleri için)
    // Birim testleri URL ile verilen seçeneklerden etkilenmesin diye kuralları açıkça sabitler.
    const PL = Object.assign({}, P, { maxSpread: 9999, wSpread: 0, minSum: 0, mergeSameLength: false, multiStep: false, allowSplit: false });
    // Eski davranış (aynı ölçü birleştirme + çok adım) yalnızca birim testlerinde açıkça istenir
    const PLm = Object.assign({}, PL, { mergeSameLength: true, multiStep: true });
    check(PanjurOpt.DEFAULTS.mergeSameLength === false && PanjurOpt.DEFAULTS.multiStep === false, 'varsayılan: poz birleştirme ve çok adım kapalı');

    // Her satır tek poz ve (çok adım / bölme kapalıyken) her poz tam adediyle tek satır mı?
    function singlePozCheck(res, Pm, label) {
      const all = res.groups.concat(res.kalan.fallbackGroups || []);
      const steps = all.flatMap(g => g.steps);
      check(steps.every(st => st.alloc.length === 1), label + ': her satır tek poz (birleşik satır yok)');
      if (!Pm.multiStep && !Pm.allowSplit) {
        const seen = new Map();
        for (const st of steps) seen.set(st.alloc[0].item, (seen.get(st.alloc[0].item) || 0) + 1);
        const whole = steps.every(st => st.n === st.alloc[0].item.count || st.alloc[0].item.count > Pm.maxBundle);
        const once = [...seen.entries()].every(([it, c]) => c === 1 || it.count > Pm.maxBundle);
        check(whole && once, label + ': her poz tam adediyle tek satırda (satır ' + steps.length + ', poz ' + seen.size + ')');
      }
      check(res.stats.groupStrokes === steps.length - (res.kalan.fallbackGroups || []).flatMap(g => g.steps).length, label + ': grup kesim sayısı = satır sayısı');
    }

    // ---------------------------------------------------------------- compileGroup birim testi
    const mk = (poz, count, len) => ({ order: '19757', customer: 'T', poz, count, len });
    const g1 = PanjurOpt.makeParts([mk(114, 34, 1844), mk(115, 33, 1844), mk(41, 18, 1394), mk(74, 18, 1384)]);
    const c1 = PanjurOpt.compileGroup(g1, PL, null);
    log('compile g1', { n: c1.n, bars: c1.bars, strokes: c1.strokes, changes: c1.changes, perBar: c1.perBar, steps: c1.steps.map(s => [s.len, s.n, s.alloc.map(a => a.part.item.poz + ':' + a.count).join('+')]), remnants: c1.remnants });
    check(c1.feasible && c1.bars === 34 && c1.strokes === 4 && c1.changes === 2 && c1.perBar === 6482, 'g1 = insan grubu (34 çubuk, 4 kesim, 2 bozma)');
    const g2 = PanjurOpt.makeParts([mk(114, 34, 1844), mk(41, 18, 1394), mk(74, 18, 1384)]);
    const c2 = PanjurOpt.compileGroup(g2, PLm, null);
    log('compile g2', { n: c2.n, bars: c2.bars, strokes: c2.strokes, changes: c2.changes, steps: c2.steps.map(s => [s.len, s.n]) });
    check(c2.feasible && c2.bars === 18 && c2.strokes === 4, 'g2 (çok adım açık): 34→17+17 ile 18 çubuk 4 kesim');
    const c2n = PanjurOpt.compileGroup(g2, PL, null);
    check(c2n.feasible && c2n.bars === 34 && c2n.strokes === 3 && c2n.steps.every(st => st.alloc.length === 1 && st.n === st.alloc[0].part.item.count), 'g2 (varsayılan): 34/18/18 üç satır, her poz tam adediyle');
    const g3 = PanjurOpt.makeParts([mk(68, 19, 1349), mk(94, 19, 1349), mk(58, 19, 1344), mk(63, 19, 1344), mk(13, 19, 1084)]);
    const c3 = PanjurOpt.compileGroup(g3, PLm, null);
    log('compile g3', { n: c3.n, bars: c3.bars, strokes: c3.strokes, changes: c3.changes, steps: c3.steps.map(s => [s.len, s.n, s.alloc.map(a => a.part.item.poz + ':' + a.count).join('+')]) });
    const gm = PanjurOpt.makeParts([mk(1, 10, 2000), mk(2, 10, 2000), mk(3, 20, 2400)]);
    const cm = PanjurOpt.compileGroup(gm, PLm, null), cn = PanjurOpt.compileGroup(gm, PL, null);
    check(cm.strokes === 2 && cm.steps.some(st => st.alloc.length === 2), 'birleştirme açıkken (eski yol) 10+10 tek kesimde birleşir');
    check(cn.strokes === 3 && cn.steps.every(st => st.alloc.length === 1), 'varsayılanda aynı ölçülü iki poz ayrı satır kalır (3 satır)');
    const c3b = PanjurOpt.compileGroup(g3, PL, null);
    check(c3b.strokes === 5 && c3b.bars === 19 && c3b.steps.every(st => st.alloc.length === 1), 'g3 (varsayılan): 5 poz = 5 satır = 5 kesim, 19 çubuk');
    // birleşik satır etiketi (eski yol) hâlâ doğru çalışıyor mu?
    const mixStep = { len: 1000, n: 30, alloc: [{ item: { order: '21542', customer: 'A', poz: 6 }, count: 10 }, { item: { order: '21999', customer: 'B', poz: 105 }, count: 20 }] };
    check(PanjurExcel.stepRow(mixStep).poz === '21542/6 + 21999/105', 'birleşik satır etiketi: proje/poz');
    // demet sınırını aşan adet ön bölünür
    const pre = PanjurOpt.makeParts([mk(1, 60, 1000), mk(2, 50, 1000), mk(3, 101, 900)], { maxBundle: 50 });
    check(pre.map(x => x.count).join() === '30,30,50,34,34,33' && pre.map(x => x.id).join() === '1,2,3,4,5,6', 'makeParts: 60→30+30, 50→50, 101→34+34+33');
    const cInf = PanjurOpt.compileGroup(PanjurOpt.makeParts([mk(1, 10, 3300), mk(2, 10, 3200)]), PL, null);
    check(!cInf.feasible, 'sığmayan grup → infeasible');

    // ---------------------------------------------------------------- küçük projeler takılmadan bitmeli
    // (2 gruplu projede yık-yeniden-kur hamlesi sonsuz döngüye giriyordu)
    for (const n of [1, 2, 3, 4, 6, 8]) {
      const small = [];
      for (let i = 1; i <= n; i++) small.push(mk(i, 35 + (i % 3), 1600 + i * 190));
      const rs = await PanjurOpt.optimize(small, Object.assign({}, PanjurOpt.DEFAULTS, { seed: 7, pLNS: 0.2, pElim: 0.2 }), { iters: 6000, yield: false });
      check(rs.validation.ok && rs.items.length === n, `küçük proje (${n} poz): bitti, ${rs.stats.groupCount} grup, ${rs.stats.bars} çubuk`);
    }
    // aynı adetli iki poz tek grupta
    const two = await PanjurOpt.optimize([mk(1, 40, 2998), mk(2, 40, 2990)], PanjurOpt.DEFAULTS, { iters: 3000, yield: false });
    check(two.validation.ok && two.stats.groupCount === 1 && two.stats.bars === 40, 'iki poz (40×2998 + 40×2990) tek grupta, 40 çubuk');

    // ---------------------------------------------------------------- adet farkı (spread) birim testleri
    const S4 = Object.assign({}, PL, { maxSpread: 4, wSpread: 2 }), S0 = Object.assign({}, PL, { maxSpread: 0, wSpread: 2 });
    check(c1.spread === 16, 'g1 adet farkı 16 (34 − 18) → ' + c1.spread);
    check(!PanjurOpt.compileGroup(g1, S4, null).feasible, 'g1 (34/33/18/18) fark sınırı 4 iken kurulamaz');
    const c2s = PanjurOpt.compileGroup(g2, Object.assign({}, S4, { multiStep: true }), null);
    check(c2s.feasible && c2s.bars === 18 && c2s.spread === 1, 'g2 fark sınırı 4, çok adım açık: 18/18/17/17 → fark 1 (bulunan ' + c2s.spread + ')');
    check(!PanjurOpt.compileGroup(g2, S4, null).feasible, 'g2 varsayılan: 34 ile 18 aynı gruba giremez (fark 16 > 4)');
    check(!PanjurOpt.compileGroup(g2, Object.assign({}, S0, { multiStep: true }), null).feasible, 'g2 fark sınırı 0 iken kurulamaz (18 ≠ 17)');
    const c3s = PanjurOpt.compileGroup(g3, S0, null);
    check(c3s.feasible && c3s.spread === 0, 'g3 (hepsi 19) fark sınırı 0 ile kurulur');
    const g4 = PanjurOpt.makeParts([mk(1, 43, 1500), mk(2, 41, 1500), mk(3, 39, 1500), mk(4, 43, 1400)]);
    const c4 = PanjurOpt.compileGroup(g4, S4, null);
    check(c4.feasible && c4.spread === 4 && c4.bars === 43, '43/43/41/39 → fark 4, sınırda kabul (bulunan fark ' + c4.spread + ')');
    const g5 = PanjurOpt.makeParts([mk(1, 43, 1500), mk(2, 38, 1500), mk(4, 43, 1400)]);
    check(!PanjurOpt.compileGroup(g5, S4, null).feasible, '43/43/38 → fark 5, sınır 4 iken reddedilir');
    const eq = PanjurOpt.compileGroup(PanjurOpt.makeParts([mk(1, 43, 1500), mk(2, 43, 1600), mk(3, 43, 1700), mk(4, 43, 1650)]), S4, null);
    const ne = PanjurOpt.compileGroup(PanjurOpt.makeParts([mk(1, 43, 1500), mk(2, 42, 1600), mk(3, 41, 1700), mk(4, 39, 1650)]), S4, null);
    check(eq.feasible && ne.feasible && eq.spread === 0 && ne.spread === 4 && eq.cost < ne.cost + 4 * (43 - 43), 'eşit adetli grup daha ucuz: ' + eq.cost + ' < ' + ne.cost);

    // insan çözümünün maliyeti (gruplar aynen, KALANLAR)
    function humanStats(hgroups, items, Pm) {
      let bars = 0, strokes = 0, changes = 0; const pool = []; const inGroups = new Set();
      hgroups.forEach((g, gi) => {
        const parts = PanjurOpt.makeParts(g);
        const c = PanjurOpt.compileGroup(parts, Object.assign({}, Pm, { mergeSameLength: false, safety: 0 }), null);
        if (!c.feasible) { log('insan grubu sığmadı', gi, g.map(x => x.len + 'x' + x.count)); return; }
        bars += c.bars; strokes += c.strokes; changes += c.changes;
        for (const r of c.remnants) pool.push({ count: r.count, len: r.len, group: gi, step: r.afterStep });
        for (const it of g) inGroups.add(it);
      });
      const kal = PanjurOpt.makeParts(items.filter(it => !inGroups.has(it)));
      const kp = PanjurOpt.planKalan(kal, pool, Pm);
      return { bars, strokes, changes, kalan: kal.length, kalanStrokes: kp.strokes, kalanChanges: kp.changes, deficit: kp.deficit.reduce((s, d) => s + d.count, 0), fbBars: kp.fallback ? kp.fallback.bars : 0, totalStrokes: strokes + kp.strokes + (kp.fallback ? kp.fallback.strokes : 0), totalBars: bars + (kp.fallback ? kp.fallback.bars : 0) };
    }
    if (hwb) {
      const hs = humanStats(hl.groups, lamelItems, PL);
      log('İNSAN lamel:', hs);
      const hsd = humanStats(hd1.groups.concat(hd2.groups), dikmeItems, Object.assign({}, PL, { maxBundle: 2 }));
      log('İNSAN dikme:', hsd);
    }

    // ---------------------------------------------------------------- en az grup toplamı (minSum)
    // Lamelde toplamı 6250'nin (6500'lük çubuk) altında kalan grup yazılmaz; pozları KALANLAR'a bırakılır.
    {
      const MS = Object.assign({}, PanjurOpt.DEFAULTS, { seed: 11, minSum: 6250 });
      check(PanjurOpt.DEFAULTS.minSum === 0, 'varsayılan motor ayarında kural kapalı (parça tablosu lamelde 6250 verir)');
      const cs = PanjurOpt.compileGroup(PanjurOpt.makeParts([mk(1, 40, 2100), mk(2, 40, 2100), mk(3, 40, 2050)]), MS, null);
      check(cs.feasible && cs.sumLen === 6250 && cs.perBar === 6262, 'grup toplamı satırların ölçü toplamıdır (testere payı hariç): ' + cs.sumLen);
      const at = await PanjurOpt.optimize([mk(1, 40, 2100), mk(2, 40, 2100), mk(3, 40, 2050)], MS, { iters: 3000, yield: false });
      check(at.validation.ok && at.groups.length === 1 && at.groups[0].sumLen === 6250 && at.kalan.parts.length === 0, 'toplamı tam 6250 olan grup yazılır');
      const below = await PanjurOpt.optimize([mk(1, 40, 2100), mk(2, 40, 2100), mk(3, 40, 2049)], MS, { iters: 3000, yield: false });
      check(below.validation.ok && below.groups.length === 0 && below.kalan.parts.length === 3 && below.kalan.listOnly === true && (below.kalan.fallbackGroups || []).length === 0,
        'toplamı 6249 olan grup yazılmaz: 3 poz KALANLAR\'da, onlar için yeni çubuk grubu da yazılmaz');
      // çubuk tahmini: her poz kendi başına, çubuğa sığdığı kadar (2100 ve 2049 mm → çubuktan 3; 40 adet → 14 çubuk)
      check(below.stats.kalanCount === 3 && below.stats.kalanPieces === 120 && below.stats.groupBars === 0 && below.stats.kalanNewBars === 42 && below.stats.bars === 42 && below.stats.listOnly === true,
        'KALANLAR özeti: 3 poz, 120 parça, tahmini 3 × 14 = 42 çubuk → ' + JSON.stringify({ poz: below.stats.kalanCount, parca: below.stats.kalanPieces, cubuk: below.stats.kalanNewBars }));
      const off = await PanjurOpt.optimize([mk(1, 40, 2100), mk(2, 40, 2100), mk(3, 40, 2049)], Object.assign({}, MS, { minSum: 0 }), { iters: 3000, yield: false });
      check(off.validation.ok && off.groups.length === 1 && off.kalan.parts.length === 0 && off.kalan.listOnly === false, 'kural kapalıyken (0) aynı pozlar tek grup olur');
      // pencere araması: çekirdek poza uyan, toplamı 6250–6495 arasına oturan pozlar
      const fp = PanjurOpt.makeParts([mk(1, 40, 2000), mk(2, 40, 1500), mk(3, 40, 1450), mk(4, 40, 1400), mk(5, 30, 1380), mk(6, 40, 900)]);
      const bf = PanjurOpt.bestFill(MS, [fp[0]], fp.slice(1), 5000, null);
      check(bf && bf.parts.map(x => x.item.poz).sort().join() === '1,2,3,4' && bf.gain > 0, 'bestFill: 2000 + 1500 + 1450 + 1400 = 6350 bulundu → ' + (bf && bf.parts.map(x => x.item.poz).join('+')));
      check(PanjurOpt.bestFill(MS, [fp[4]], fp.filter(x => x !== fp[4]), 5000, null) === null, 'bestFill: adedi uymayan (30) çekirdek için grup yok');
      check(PanjurOpt.bestFill(Object.assign({}, MS, { maxSpread: 9999, wSpread: 0 }), [fp[4]], fp.filter(x => x !== fp[4]), 5000, null) !== null, 'bestFill: adet sınırı kalkınca aynı çekirdek gruba girer');
      // sentetik 60 poz: yazılan her grup kurala uyar, her poz tam bir yerde
      const syn = []; let sd = 99;
      const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
      for (let i = 1; i <= 60; i++) syn.push(mk(i, 36 + Math.floor(rnd() * 5), 600 + Math.floor(rnd() * 2000)));
      const rs = await PanjurOpt.optimize(syn, MS, { iters: 20000, yield: false });
      check(rs.validation.ok, 'kurallı sentetik (60 poz) doğrulama: ' + (rs.validation.errors.slice(0, 3).join(' | ') || 'temiz'));
      check(rs.groups.length > 0 && rs.groups.every(g => g.sumLen >= 6250 && g.perBar <= MS.L - MS.safety && g.spread <= MS.maxSpread), 'kurallı sentetik: her grubun toplamı ≥ 6250, çubuğa sığıyor, adet farkı ≤ 4 (en küçük toplam ' + Math.min(...rs.groups.map(g => g.sumLen)) + ')');
      const where = new Map();
      for (const g of rs.groups) for (const st of g.steps) for (const a of st.alloc) where.set(a.item, (where.get(a.item) || 0) + 1);
      for (const k of rs.kalan.parts) where.set(k.item, (where.get(k.item) || 0) + 1);
      check(where.size === 60 && [...where.values()].every(v => v === 1) && rs.stats.groupPozCount + rs.stats.kalanCount === 60, 'kurallı sentetik: 60 pozun her biri ya bir grupta ya KALANLAR\'da (' + rs.stats.groupPozCount + ' + ' + rs.stats.kalanCount + ')');
      check((rs.kalan.fallbackGroups || []).length === 0 && rs.kalan.listOnly === true, 'kurallı sentetik: KALANLAR için grup yazılmadı');
      singlePozCheck(rs, MS, 'kurallı sentetik');
      const cpm = rs.stats.costParts;
      check(Math.abs(cpm.cut + cpm.bar + cpm.change + cpm.spread + cpm.kalan + cpm.waste + cpm.other - rs.stats.cost) < 1e-6, 'kurallı sentetik: maliyet dökümü toplamı maliyete eşit');
      check(rs.stats.groupPozCount >= 40, 'kurallı sentetik: pozların çoğu gruplarda (' + rs.stats.groupPozCount + '/60)');
      // hiçbir geçerli grup kurulamayan küçük projeler de takılmadan biter
      for (const n of [1, 2, 3, 5]) {
        const small = [];
        for (let i = 1; i <= n; i++) small.push(mk(i, 20 + i * 6, 900 + i * 100));
        const r1 = await PanjurOpt.optimize(small, Object.assign({}, MS, { pFill: 0.3 }), { iters: 4000, yield: false });
        check(r1.validation.ok && r1.groups.length === 0 && r1.kalan.parts.length === n, `kurallı küçük proje (${n} poz, grup kurulamaz): hepsi KALANLAR'da`);
      }
      // gerçek veri: 21542 lamel (156 poz) ve dört proje (88 poz)
      const it21 = cT.lamel.items.map(i => ({ order: csv.orderNo, customer: 'BİRİNCİ PEN', poz: i.poz, len: i.len, count: i.count }));
      const r21 = await PanjurOpt.optimize(it21, Object.assign({}, MS, { maxBundle: 50 }), { iters: Math.min(ITERS, 60000), yield: false });
      log('  kurallı 21542 lamel:', { grup: r21.stats.groupCount, grupPoz: r21.stats.groupPozCount, grupCubuk: r21.stats.groupBars, grupFire: +(r21.stats.groupWastePct * 100).toFixed(2), kalan: r21.stats.kalanCount, kalanCubuk: r21.stats.kalanNewBars, enKucukToplam: Math.min(...r21.groups.map(g => g.sumLen)) });
      check(r21.validation.ok && r21.groups.every(g => g.sumLen >= 6250), 'kurallı 21542: doğrulama temiz, her grubun toplamı ≥ 6250');
      check(r21.stats.groupPozCount + r21.stats.kalanCount === 156 && r21.stats.groupPozCount >= 148, 'kurallı 21542: 156 pozun en az 148\'i gruplarda (' + r21.stats.groupPozCount + ')');
      singlePozCheck(r21, Object.assign({}, MS, { maxBundle: 50 }), 'kurallı 21542');
      const r4 = await PanjurOpt.optimize(eko4.items, Object.assign({}, MS, { maxBundle: 50 }), { iters: Math.min(ITERS, 60000), yield: false });
      log('  kurallı dört proje EKO lamel:', { grup: r4.stats.groupCount, grupPoz: r4.stats.groupPozCount, grupCubuk: r4.stats.groupBars, grupFire: +(r4.stats.groupWastePct * 100).toFixed(2), kalan: r4.stats.kalanCount, kalanCubuk: r4.stats.kalanNewBars });
      check(r4.validation.ok && r4.groups.every(g => g.sumLen >= 6250 && g.spread <= 4), 'kurallı dört proje: doğrulama temiz, her grubun toplamı ≥ 6250');
      check(r4.stats.groupPozCount + r4.stats.kalanCount === 88 && r4.stats.groupPozCount >= 66, 'kurallı dört proje: 88 pozun en az 66\'sı gruplarda (' + r4.stats.groupPozCount + ')');
      const std4 = merged4.find(m => m.type === 'lamel' && /STANDART/.test(m.desc));
      const rStd = await PanjurOpt.optimize(std4.items, Object.assign({}, MS, { maxBundle: 50 }), { iters: 3000, yield: false });
      check(rStd.validation.ok && rStd.groups.length === 0 && rStd.kalan.parts.length === 6, 'kurallı STANDART lamel (~3250 mm, çubuğa tek sığar): grup yok, 6 poz KALANLAR\'da');

      // ---------------------------------------------------------------- baskı düzeni (iki sütun, sayfalama)
      const blk = (k, extra) => Object.assign({ rows: [{ kind: 'header', A: 'G' }].concat(Array.from({ length: k }, () => ({ kind: 'step' })), [{ kind: 'sum' }, { kind: 'blank' }]) }, extra || {});
      const count = (rows, kind) => rows.filter(r => r.kind === kind).length;
      const pg = PanjurExcel.paginate([blk(3), blk(3), blk(3), blk(3), blk(3), blk(3)], 12, 1, 3, 2);
      check(pg.length === 2 && pg.every(x => count(x.left, 'header') === count(x.left, 'sum') && count(x.right, 'header') === count(x.right, 'sum')), 'sayfalama: 6 grup 2 sayfa, hiçbir grup sütunlar arasında bölünmedi');
      check(pg[0].left.length <= 11 && pg[0].right.length <= 9 && pg.every(x => x.rows <= 12), 'sayfalama: sütun kapasitesi aşılmadı (ilk sayfada sipariş bloğu payı düşülür)');
      check(count(pg[0].left, 'header') === 2 && count(pg[0].right, 'header') === 1 && count(pg[1].left, 'header') === 2 && count(pg[1].right, 'header') === 1, 'sayfalama: sıra sol sütun → sağ sütun → yeni sayfa; son sayfada sütunlar dengeli');
      const one = PanjurExcel.paginate([blk(2), blk(2)], 40, 1, 5, 2);
      check(one.length === 1 && count(one[0].left, 'header') === 1 && count(one[0].right, 'header') === 1, 'sayfalama: tek sayfalık iki grup iki sütuna yayılır (sağ taraf boş kalmaz)');
      const longList = { rows: [{ kind: 'header', A: 'KALANLAR', big: true }].concat(Array.from({ length: 30 }, () => ({ kind: 'step' })), [{ kind: 'blank' }]), list: true, title: 'KALANLAR' };
      const pl = PanjurExcel.paginate([longList], 12, 1, 1, 2);
      const allRows = pl.flatMap(x => x.left.concat(x.right));
      check(count(allRows, 'step') === 30 && allRows.filter(r => r.kind === 'header' && /devam/.test(r.A)).length === allRows.filter(r => r.kind === 'header').length - 1 && pl.every(x => x.rows <= 12),
        'sayfalama: uzun KALANLAR listesi sütunlara bölünür, devam başlığı alır (30 satır, ' + pl.length + ' sayfa)');
      check(PanjurExcel.printScale(90) === 100 && PanjurExcel.printScale(130) < 80 && PanjurExcel.rowsPerPage(100) < PanjurExcel.rowsPerPage(80), 'baskı ölçeği: dar içerik %100, geniş içerik küçülür ve sayfaya daha çok satır sığar');
      // Excel dosyasının sayfa ayarları (yazıcı çıktısında başlığın kesilmesine yol açan eksikler)
      const info = {};
      const xbuf = await PanjurExcel.buildWorkbook([{ result: r4, meta: { desc: eko4.desc, color: eko4.color, sheetName: 'LAMEL EKO', orders: eko4.orders.map(o => ({ orderNo: Number(o.orderNo), customer: o.customer, date: null, pozCount: o.pozCount, note: '' })) }, opts: {} }], { orders: [] }, info);
      const zip = XLSX.read(new Uint8Array(xbuf), { type: 'array', bookFiles: true });
      const xml = name => { const f = zip.files[name]; return f ? new TextDecoder().decode(new Uint8Array(f.content)) : ''; };
      const sh = xml('xl/worksheets/sheet1.xml'), wbx = xml('xl/workbook.xml');
      const lay = info['LAMEL EKO'];
      check(/<sheetViews>/.test(sh) && /<bookViews>/.test(wbx), 'Excel: sayfada ve kitapta görünüm kaydı var (yoksa Excel satır yüksekliklerini ekran ölçeğine böler)');
      const row1 = (sh.match(/<row r="1"[^>]*>/) || [''])[0], row3 = (sh.match(/<row r="3"[^>]*>/) || [''])[0];
      check(row1 && !/ ht=/.test(row1), 'Excel: başlık satırına yükseklik yazılmadı (Excel yazı boyuna göre ayarlar) → ' + row1);
      check(/ ht="18\.75"/.test(row3) && /customHeight="1"/.test(row3), 'Excel: içerik satırları 18,75 punto → ' + row3);
      const brk = sh.match(/<brk /g) || [];
      check(lay && lay.pages >= 1 && brk.length === lay.pages - 1 && (lay.pages === 1 || /manualBreakCount="\d+"/.test(sh)), 'Excel: elle sayfa sonu sayısı = sayfa − 1 (' + brk.length + ' / ' + (lay && lay.pages) + ' sayfa)');
      check(new RegExp('<pageSetup[^>]* scale="' + lay.scale + '"').test(sh) && !/fitToPage="1"/.test(sh), 'Excel: sabit baskı ölçeği %' + lay.scale + ', sığdırma kapalı');
      check(new RegExp('_xlnm.Print_Area[^<]*>[^<]*\\$A\\$1:\\$L\\$' + lay.lastRow + '<').test(wbx) && /_xlnm.Print_Titles[^<]*>[^<]*\$1:\$1</.test(wbx), 'Excel: yazdırma alanı mutlak ($A$1:$L$' + lay.lastRow + '), 1. satır her sayfada yinelenir');
      check(/<c r="K\d+"/.test(sh) && /<c r="E\d+"/.test(sh), 'Excel: iki sütun da dolu (E ve K sütunlarında ölçüler)');
      check(/<oddFooter>/.test(sh), 'Excel: altbilgide sayfa numarası');
      check(lay.rowsPerPage >= 30 && lay.lastRow <= lay.pages * lay.rowsPerPage + 1, 'Excel: ' + lay.pages + ' sayfa × ' + lay.rowsPerPage + ' satır kapasite, son satır ' + lay.lastRow);
    }

    // ---------------------------------------------------------------- optimize lamel
    if (!ONLY || ONLY === 'lamel') {
      const t0 = performance.now();
      let lastProg = null;
      const res = await PanjurOpt.optimize(lamelItems, P, { iters: ITERS, yield: false, onProgress: p => { lastProg = p; } });
      if (lastProg) log('  kabul oranı', (lastProg.accepted / lastProg.iter).toFixed(3));
      const t1 = performance.now();
      const st = res.stats;
      log('OPT lamel:', { iters: res.iterations, ms: Math.round(t1 - t0), init: Math.round(res.initialCost), cost: Math.round(st.cost), bars: st.bars, strokes: st.strokes, changes: st.changes, groupBars: st.groupBars, groupStrokes: st.groupStrokes, kalan: st.kalanCount, kalanStrokes: st.kalanStrokes, fallbackBars: st.fallbackBars, wastePct: +(st.wastePct * 100).toFixed(2), lb: st.lowerBoundBars, groups: st.groupCount, spreadMax: st.spreadMax, spreadAvg: +st.spreadAvg.toFixed(2), equalGroups: st.equalGroups, remnantMm: st.remnantMm, remnantUsed: st.remnantUsedMm });
      check(res.groups.every(g => g.spread <= P.maxSpread), 'lamel: her grupta adet farkı ≤ ' + P.maxSpread + ' (en çok ' + st.spreadMax + ')');
      if (!P.mergeSameLength) singlePozCheck(res, P, 'lamel');
      check(res.validation.ok, 'lamel doğrulama: ' + (res.validation.errors.slice(0, 5).join(' | ') || 'temiz'));
      const cp = st.costParts;
      const sum = cp.cut + cp.bar + cp.change + cp.spread + cp.kalan + cp.waste + cp.other;
      check(Math.abs(sum - st.cost) < 1e-6, 'maliyet dökümü toplamı maliyete eşit: ' + sum.toFixed(3) + ' vs ' + st.cost.toFixed(3));
      check(Math.abs(cp.cut - P.wCut * st.strokes) < 1e-9 && Math.abs(cp.bar - P.wBar * st.bars) < 1e-9, 'döküm kalemleri doğru');
      log('  maliyet dökümü', { cut: Math.round(cp.cut), bar: Math.round(cp.bar), change: Math.round(cp.change), spread: Math.round(cp.spread), kalan: Math.round(cp.kalan), waste: Math.round(cp.waste), other: Math.round(cp.other) });
      log('  parça sayısı', res.parts.length, '(poz', lamelItems.length + ')');
      for (const g of (q.get('full') ? res.groups : res.groups.slice(0, 6))) log('  G' + g.no, 'çubuk', g.bars, 'kesim', g.strokes, 'Σ', g.sumLen, 'kalan', g.leftover, 'artık', g.remnants.filter(r => !r.final).map(r => r.count + '×' + r.len).join(','), g.steps.map(s => s.len + '×' + s.n + '[' + s.alloc.map(a => a.item.poz + ':' + a.count).join('+') + ']').join(' | '));
      log('  KALANLAR', res.kalan.parts.map(k => k.item.poz + ':' + k.count + 'x' + k.item.len).join(', '));
      log('  artık planı', (q.get('full') ? res.kalan.plan : res.kalan.plan.slice(0, 5)).map(e => `G${e.groupNo}/${e.step} ${e.count}×${e.len}: ` + e.steps.map(s => s.len + '×' + s.n + '→' + s.item.poz).join(', ')));
      window.__lamel = res;
      window.__lamelMeta = { desc: 'AS 55 EKO ALÜMINYUM LAMEL', color: 'ANT.GRİ', sheetName: 'LAMEL' };
    }
    // ---------------------------------------------------------------- optimize dikme
    if (!ONLY || ONLY === 'dikme') {
      const Pd = Object.assign({}, P, { maxBundle: 2 });
      const t0 = performance.now();
      const res = await PanjurOpt.optimize(dikmeItems, Pd, { iters: Number(q.get('diters') || Math.min(ITERS, 40000)), yield: false });
      const st = res.stats;
      log('OPT dikme:', { iters: res.iterations, ms: Math.round(performance.now() - t0), cost: Math.round(st.cost), bars: st.bars, strokes: st.strokes, changes: st.changes, kalan: st.kalanCount, wastePct: +(st.wastePct * 100).toFixed(2), lb: st.lowerBoundBars, groups: st.groupCount });
      check(res.validation.ok, 'dikme doğrulama: ' + (res.validation.errors.slice(0, 5).join(' | ') || 'temiz'));
      if (!Pd.mergeSameLength) singlePozCheck(res, Pd, 'dikme');
      window.__dikme = res;
      for (const g of res.groups.slice(0, 4)) log('  G' + g.no, 'çubuk', g.bars, 'Σ', g.sumLen, g.steps.map(s => s.len + '×' + s.n + '[' + s.alloc.map(a => a.item.poz + ':' + a.count).join('+') + ']').join(' | '));
      log('  dikme kalanlar:', res.groups.map(g => g.leftover).sort((a, b) => b - a).join(' '));
    }
    // ---------------------------------------------------------------- alt parça / tambur (tek sipariş, demet 1)
    if (ONLY === 'alt' || ONLY === 'tambur') {
      const src = ONLY === 'alt' ? byType.altparca : byType.tambur;
      const items = src.items.map(i => ({ order: '19757', customer: 'ÖRNEK PEN', poz: i.poz, len: i.len, count: i.count }));
      const Pa = Object.assign({}, P, { maxBundle: Number(q.get('bundle') || 1) });
      const t0 = performance.now();
      const res = await PanjurOpt.optimize(items, Pa, { iters: ITERS, yield: false });
      const st = res.stats;
      log('OPT ' + ONLY + ':', { iters: res.iterations, cost: Math.round(st.cost), bars: st.bars, strokes: st.strokes, changes: st.changes, kalan: st.kalanCount, wastePct: +(st.wastePct * 100).toFixed(2), lb: st.lowerBoundBars, groups: st.groupCount, pieces: st.pieces, mm: st.pieceMm });
      check(res.validation.ok, ONLY + ' doğrulama: ' + (res.validation.errors.slice(0, 5).join(' | ') || 'temiz'));
      log('  kalanlar:', res.groups.map(g => g.leftover).sort((a, b) => b - a).join(' '));
    }
    if (ONLY === 'csv') {
      const m = cT[q.get('mat') || 'lamel'];
      const items = m.items.map(i => ({ order: csv.orderNo, customer: 'CSV', poz: i.poz, len: i.len, count: i.count }));
      const Pc = Object.assign({}, P, { maxBundle: Number(q.get('bundle') || m.defaultBundle) });
      const t0 = performance.now();
      const res = await PanjurOpt.optimize(items, Pc, { iters: ITERS, yield: false });
      const st = res.stats;
      log('OPT csv/' + m.type + ':', { ms: Math.round(performance.now() - t0), iters: res.iterations, cost: Math.round(st.cost), bars: st.bars, lb: st.lowerBoundBars, strokes: st.strokes, changes: st.changes, kalan: st.kalanCount, wastePct: +(st.wastePct * 100).toFixed(2), groups: st.groupCount, spreadMax: st.spreadMax, spreadAvg: +st.spreadAvg.toFixed(2), equalGroups: st.equalGroups, pieces: st.pieces });
      check(res.groups.every(g => g.spread <= Pc.maxSpread), 'csv/' + m.type + ': her grupta adet farkı ≤ ' + Pc.maxSpread);
      if (!Pc.mergeSameLength) singlePozCheck(res, Pc, 'csv/' + m.type);
      check(res.validation.ok, 'csv/' + m.type + ' doğrulama: ' + (res.validation.errors.slice(0, 5).join(' | ') || 'temiz'));
      for (const g of res.groups.slice(0, 4)) log('  G' + g.no, 'çubuk', g.bars, 'Σ', g.sumLen, g.steps.map(s => s.len + '×' + s.n + '[' + s.alloc.map(a => a.item.poz + ':' + a.count).join('+') + ']').join(' | '));
    }
    // Gerçek ERP projesinden (CSV) örnek Excel: run.sh "csvxlsx=1&iters=300000"
    if (q.get('csvxlsx')) {
      const orders = [{ orderNo: Number(csv.orderNo), customer: q.get('cust') || 'BİRİNCİ PEN', date: new Date(Date.UTC(2026, 9, 20)), pozCount: cT.lamel.items.length, note: '' }];
      const results = [];
      for (const type of ['lamel', 'dikme', 'altparca', 'tambur']) {
        const m = cT[type];
        if (!m) continue;
        const items = m.items.map(i => ({ order: Number(csv.orderNo), customer: orders[0].customer, poz: i.poz, len: i.len, count: i.count }));
        const Pm = Object.assign({}, P, { maxBundle: m.defaultBundle, minSum: q.get('minSum') != null ? P.minSum : (type === 'lamel' ? P.L - 250 : 0) });
        const res = await PanjurOpt.optimize(items, Pm, { iters: ITERS, yield: false });
        check(res.validation.ok, type + ' doğrulama: ' + (res.validation.errors.slice(0, 3).join(' | ') || 'temiz'));
        log('  ' + m.typeLabel + ':', { cost: Math.round(res.stats.cost), bars: res.stats.bars, lb: res.stats.lowerBoundBars, strokes: res.stats.strokes, changes: res.stats.changes, equal: res.stats.equalGroups + '/' + res.stats.groupCount, spreadMax: res.stats.spreadMax, kalan: res.stats.kalanCount, fire: +(res.stats.wastePct * 100).toFixed(2) });
        results.push({ result: res, meta: { desc: m.desc, color: m.color, sheetName: m.typeLabel, orders }, opts: { showRemnants: false } });
      }
      const buf = await PanjurExcel.buildWorkbook(results, { orders });
      const bytes = new Uint8Array(buf); let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      document.getElementById('xlsx').textContent = btoa(bin);
      log('csv xlsx bytes', bytes.length);
    }
    // Dört gerçek projenin tek bir malzemesini çözer: run.sh "only=realmat&type=dikme&iters=300000"
    if (ONLY === 'realmat') {
      const want = q.get('type') || 'dikme', nameRe = new RegExp(q.get('desc') || '.', 'i');
      const m = merged4.find(x => x.type === want && nameRe.test(x.desc));
      const Pm = Object.assign({}, P, { maxBundle: Number(q.get('bundle') || m.defaultBundle) });
      const res = await PanjurOpt.optimize(m.items, Pm, { iters: ITERS, yield: false });
      const st = res.stats;
      log('OPT realmat/' + m.label + ':', { poz: m.items.length, iters: res.iterations, bars: st.bars, lb: st.lowerBoundBars, strokes: st.strokes, groups: st.groupCount, fire: +(st.wastePct * 100).toFixed(2), kalan: st.kalanCount });
      check(res.validation.ok, 'realmat doğrulama');
      const lens = m.items.map(i => i.len).sort((a, b) => a - b);
      log('  ölçüler:', lens.join(' '));
      log('  grup kalanları:', res.groups.map(g => g.leftover).sort((a, b) => b - a).join(' '));
    }
    // Dört gerçek projenin varsayılan açık bütün parçaları tek Excel'de: run.sh "only=real4all&iters=200000&nocust=1"
    if (ONLY === 'real4all') {
      const results = [];
      const allOrders = realFiles.map(f => ({ orderNo: Number(f.orderNo), customer: f.customer, date: f.date ? new Date(f.date + 'T00:00:00Z') : null, pozCount: f.parsed.pozCount, note: f.note }));
      for (const m of merged4.filter(x => x.defaultOn)) {
        // arayüzün varsayılanı: lamelde en az grup toplamı = çubuk boyu − 250 (6250)
        const Pm = Object.assign({}, P, { maxBundle: m.defaultBundle, minSum: q.get('minSum') != null ? P.minSum : (m.type === 'lamel' ? P.L - 250 : 0) });
        const itN = Math.max(8000, Math.round(ITERS * Math.max(0.15, Math.min(m.defaultBundle <= 2 ? 1 : 4, m.items.length / 150))));
        const res = await PanjurOpt.optimize(m.items, Pm, { iters: itN, yield: false });
        const st = res.stats;
        check(res.validation.ok, m.label + ' doğrulama: ' + (res.validation.errors.slice(0, 2).join(' | ') || 'temiz'));
        singlePozCheck(res, Pm, m.label);
        log('  ' + m.label + ':', { poz: m.pozCount, proje: m.orders.length, grup: st.groupCount, grupPoz: st.groupPozCount, grupCubuk: st.groupBars, grupFire: +(st.groupWastePct * 100).toFixed(1), equal: st.equalGroups + '/' + st.groupCount, spreadMax: st.spreadMax, kalan: st.kalanCount, kalanCubuk: st.listOnly ? st.kalanNewBars : st.fallbackBars, bars: st.bars, lb: st.lowerBoundBars, fire: +(st.wastePct * 100).toFixed(1) });
        const orders = m.orders.map(o => ({ orderNo: Number(o.orderNo), customer: o.customer, date: o.date ? new Date(o.date + 'T00:00:00Z') : null, pozCount: o.pozCount, note: o.note }));
        results.push({ result: res, meta: { desc: m.desc, color: m.color, sheetName: m.label, orders }, opts: {} });
      }
      const buf = await PanjurExcel.buildWorkbook(results, { orders: allOrders });
      const bytes = new Uint8Array(buf); let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      document.getElementById('xlsx').textContent = btoa(bin);
      log('real4all xlsx bytes', bytes.length, 'sayfa', results.map(r => r.meta.sheetName).join(' | '));
    }
    if (ONLY === 'real4') {
      const Pm = Object.assign({}, P, { maxBundle: 50 });
      let sepBars = 0, sepRows = 0;
      for (const f of realFiles) {
        const m = f.parsed.materials.find(x => x.type === 'lamel' && /EKO/.test(x.desc));
        const its = m.items.map(i => ({ order: f.orderNo, customer: f.customer, poz: i.poz, ref: i.ref, len: i.len, count: i.count }));
        const r = await PanjurOpt.optimize(its, Pm, { iters: ITERS, yield: false });
        check(r.validation.ok, 'ayrı ' + f.orderNo + ' doğrulama: ' + (r.validation.errors.slice(0, 2).join(' | ') || 'temiz'));
        sepBars += r.stats.bars; sepRows += r.stats.strokes;
        log('  AYRI ' + f.orderNo + ':', { poz: its.length, bars: r.stats.bars, lb: r.stats.lowerBoundBars, strokes: r.stats.strokes, equal: r.stats.equalGroups + '/' + r.stats.groupCount, spreadMax: r.stats.spreadMax, fire: +(r.stats.wastePct * 100).toFixed(2), kalan: r.stats.kalanCount });
      }
      const res = await PanjurOpt.optimize(eko4.items, Pm, { iters: ITERS * 2, yield: false });
      const st = res.stats;
      log('  BİRLİKTE (4 proje):', { poz: eko4.items.length, bars: st.bars, lb: st.lowerBoundBars, strokes: st.strokes, equal: st.equalGroups + '/' + st.groupCount, spreadMax: st.spreadMax, fire: +(st.wastePct * 100).toFixed(2), kalan: st.kalanCount, kalanStrokes: st.kalanStrokes });
      log('  AYRI TOPLAM:', { bars: sepBars, strokes: sepRows });
      check(res.validation.ok, 'dört proje birlikte doğrulama: ' + (res.validation.errors.slice(0, 3).join(' | ') || 'temiz'));
      check(res.groups.every(g => g.spread <= Pm.maxSpread), 'dört proje: her grupta adet farkı ≤ ' + Pm.maxSpread);
      singlePozCheck(res, Pm, 'dört proje');
      check(res.items.filter(i => i.order === '23876').every(i => i.ref != null) && res.items.filter(i => i.order === '24714').every(i => i.ref == null), 'dört proje: müşteri pozu 23876 pozlarında taşınıyor, diğerlerinde boş');
      for (const g of res.groups.slice(0, q.get('full') ? 999 : 8)) log('  G' + g.no, 'çubuk', g.bars, 'kalan', g.leftover, g.steps.map(s => s.alloc[0].item.order + '/' + s.alloc[0].item.poz + ' ' + s.n + '×' + s.len).join(' | '));
      log('  KALANLAR', res.kalan.parts.map(k => k.item.order + '/' + k.item.poz + ' ' + k.count + '×' + k.item.len).join(', ') || '(yok)');
      if (q.get('real4xlsx')) {
        const orders = eko4.orders.map(o => ({ orderNo: Number(o.orderNo), customer: o.customer, date: o.date ? new Date(o.date + 'T00:00:00Z') : null, pozCount: o.pozCount, note: o.note }));
        const buf = await PanjurExcel.buildWorkbook([{ result: res, meta: { desc: eko4.desc, color: eko4.color, sheetName: 'LAMEL', orders }, opts: {} }], { orders });
        const bytes = new Uint8Array(buf); let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        document.getElementById('xlsx').textContent = btoa(bin);
        log('real4 xlsx bytes', bytes.length);
      }
    }
    // Çok projeli optimizasyon: run.sh "only=multi&iters=200000"  (multixlsx=1 ile Excel de yazar)
    if (ONLY === 'multi') {
      const Pm = Object.assign({}, P, { maxBundle: 50 });
      const sep = [];
      for (const [name, its] of [['21542', mLamBej.items.filter(i => i.order === '21542')], ['21999', mLamBej.items.filter(i => i.order === '21999')]]) {
        const r = await PanjurOpt.optimize(its, Pm, { iters: ITERS, yield: false });
        check(r.validation.ok, 'ayrı ' + name + ' doğrulama');
        sep.push(r.stats);
        log('  AYRI ' + name + ':', { poz: its.length, bars: r.stats.bars, strokes: r.stats.strokes, equal: r.stats.equalGroups + '/' + r.stats.groupCount, spreadMax: r.stats.spreadMax, fire: +(r.stats.wastePct * 100).toFixed(2), kalan: r.stats.kalanCount });
      }
      const res = await PanjurOpt.optimize(mLamBej.items, Pm, { iters: ITERS * 2, yield: false });
      const st = res.stats;
      log('  BİRLİKTE:', { poz: mLamBej.items.length, bars: st.bars, strokes: st.strokes, equal: st.equalGroups + '/' + st.groupCount, spreadMax: st.spreadMax, fire: +(st.wastePct * 100).toFixed(2), kalan: st.kalanCount });
      log('  AYRI TOPLAM:', { bars: sep[0].bars + sep[1].bars, strokes: sep[0].strokes + sep[1].strokes });
      check(res.validation.ok, 'birlikte doğrulama: ' + (res.validation.errors.slice(0, 3).join(' | ') || 'temiz'));
      check(res.groups.every(g => g.spread <= Pm.maxSpread), 'birlikte: her grupta adet farkı ≤ ' + Pm.maxSpread);
      const mixed = res.groups.filter(g => new Set(g.steps.flatMap(s => s.alloc.map(a => a.item.order))).size > 1);
      check(mixed.length > 0, 'birlikte: projeleri karıştıran grup var → ' + mixed.length + '/' + res.groups.length);
      singlePozCheck(res, Pm, 'birlikte');
      const rows = res.groups.flatMap(g => g.steps).map(st => PanjurExcel.stepRow(st));
      check(rows.every(r => typeof r.poz === 'number' && (r.order === 21542 || r.order === 21999) && (r.customer === 'BİRİNCİ PEN' || r.customer === 'İKİNCİ PEN')), 'birlikte: her satırda tek poz, proje no ve müşteri yazıyor');
      const g0 = mixed[0];
      if (g0) log('  karışık grup örneği G' + g0.no + ':', g0.steps.map(st => { const r = PanjurExcel.stepRow(st); return r.order + '/' + r.poz + ' ' + r.count + '×' + r.len; }).join(' | '));
      if (q.get('multixlsx')) {
        const orders = mLamBej.orders.map(o => ({ orderNo: Number(o.orderNo), customer: o.customer, date: new Date(o.date + 'T00:00:00Z'), pozCount: o.pozCount, note: o.note }));
        const buf = await PanjurExcel.buildWorkbook([{ result: res, meta: { desc: mLamBej.desc, color: mLamBej.color, sheetName: 'LAMEL', orders }, opts: {} }], { orders });
        const bytes = new Uint8Array(buf); let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        document.getElementById('xlsx').textContent = btoa(bin);
        log('multi xlsx bytes', bytes.length);
      }
    }
    if (q.get('xlsx')) {
      const orders = [{ orderNo: 19757, customer: 'ÖRNEK PEN', date: new Date(Date.UTC(2026, 8, 24)), pozCount: 122, note: 'NOT A' }, { orderNo: 20139, customer: 'DENEME PEN', date: new Date(Date.UTC(2026, 8, 24)), pozCount: 14, note: 'NOT A' }, { orderNo: 20256, customer: 'ÜÇÜNCÜ PEN', date: new Date(Date.UTC(2026, 8, 30)), pozCount: 22, note: 'NOT B' }];
      const results = [];
      if (window.__lamel) results.push({ result: window.__lamel, meta: Object.assign({ orders }, window.__lamelMeta), opts: { showRemnants: true } });
      if (window.__dikme) results.push({ result: window.__dikme, meta: { desc: 'DİKMELİ U 62 LIK', color: 'ANT.GRİ', sheetName: 'DİKME', orders }, opts: {} });
      // CSV projesinden bir malzeme: aynı sayfa adı ('LAMEL') → çakışma giderme testi
      const csvItems = cT.lamel.items.slice(0, 40).map(i => ({ order: csv.orderNo, customer: 'BİRİNCİ PEN', poz: i.poz, len: i.len, count: i.count }));
      const csvRes = await PanjurOpt.optimize(csvItems, Object.assign({}, P, { maxBundle: 50 }), { iters: 20000, yield: false });
      check(csvRes.validation.ok, 'CSV malzemesi doğrulama: ' + (csvRes.validation.errors.slice(0, 3).join(' | ') || 'temiz'));
      results.push({ result: csvRes, meta: { desc: cT.lamel.desc, color: cT.lamel.color, sheetName: 'LAMEL', orders: [{ orderNo: 21542, customer: 'BİRİNCİ PEN', date: new Date(Date.UTC(2026, 9, 20)), pozCount: 156, note: '' }] }, opts: {} });
      const buf = await PanjurExcel.buildWorkbook(results, { orders });
      const bytes = new Uint8Array(buf); let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      document.getElementById('xlsx').textContent = btoa(bin);
      log('xlsx bytes', bytes.length);
    }
    log(fails ? `SONUÇ: ${fails} HATA` : 'SONUÇ: TÜM TESTLER GEÇTİ');
  } catch (e) {
    log('EXCEPTION', String(e), e && e.stack);
  }
  document.body.setAttribute('data-done', '1');
})();

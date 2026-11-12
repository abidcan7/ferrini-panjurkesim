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
    check(kutu185 && kutu185.type === 'kutukapak' && kutu185.items[0].len === 25000 && kutu185.label === 'KUTU KAPAK 185', '23876: "PANJUR KUTU KAPAK 185 MM" kutu kapağı türünde (25.000 mm: çubuktan uzun)');
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
    check(new Set(merged4.map(m => m.label)).size === merged4.length, 'etiketler benzersiz (' + merged4.length + ' malzeme): ' + merged4.filter(m => m.type === 'diger').map(m => m.label).join(' | '));
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
    if (q.get('lengths')) P.lengths = q.get('lengths').split(',').map(Number);
    // Arayüzün varsayılan stok boyları (örnek Excel üretiminde kullanılır)
    const UI_LENGTHS = q.get('lengths') ? P.lengths : [6500, 5000, 4700];
    // Adet farkı sınırı olmayan eski model (insan çözümüyle karşılaştırma ve eski birim testleri için)
    // Birim testleri URL ile verilen seçeneklerden etkilenmesin diye kuralları açıkça sabitler.
    const PL = Object.assign({}, P, { maxSpread: 9999, wSpread: 0, minSum: 0, lengths: null, L: 6500, mergeSameLength: false, multiStep: false, allowSplit: false });
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
      // çubuk tahmini: parçalar tek tek, çubuğa sığdığı kadar (2100 ve 2049 mm → çubuktan 3; 120 parça → 40 çubuk)
      check(below.stats.kalanCount === 3 && below.stats.kalanPieces === 120 && below.stats.groupBars === 0 && below.stats.kalanNewBars === 40 && below.stats.bars === 40 && below.stats.listOnly === true,
        'KALANLAR özeti: 3 poz, 120 parça, tahmini 40 çubuk (çubuğa 3 parça) → ' + JSON.stringify({ poz: below.stats.kalanCount, parca: below.stats.kalanPieces, cubuk: below.stats.kalanNewBars }));
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

    // ---------------------------------------------------------------- grup içi sıra: ölçü büyükten küçüğe
    {
      const PO = Object.assign({}, PanjurOpt.DEFAULTS, { maxSpread: 4, seed: 3 });
      const its = [mk(1, 46, 1849), mk(2, 43, 2429), mk(3, 46, 859), mk(4, 46, 669), mk(5, 46, 659)];
      const co = PanjurOpt.compileGroup(PanjurOpt.makeParts(its), PO, null);
      check(co.feasible && co.steps.map(st => st.len).join() === '2429,1849,859,669,659', 'grup içi sıra ölçüye göre büyükten küçüğe (adedi az olan 2.429 en üstte) → ' + co.steps.map(st => st.len + '×' + st.n).join(' '));
      check(co.bars === 46 && co.spread === 3 && co.changes === 1 && co.sumLen === 6465 && co.perBar === 6485, 'demet 46 çubuk, adet farkı 3, tek demet bozma, toplam 6465');
      const fin = co.remnants.find(r => r.final), wait = co.remnants.find(r => !r.final);
      check(fin.count === 43 && fin.len === 6500 - 6485 && wait.count === 3 && wait.len === fin.len + 2429 + 4, 'kenarda bekleyen 3 çubuk 2.429 kesimini almaz: artık boyu ' + wait.len + ' mm');
      // satır sırası çubuk kullanımını değiştirmez: adetleri aynı, ölçüleri ters sıralı grup aynı sonucu verir
      const co2 = PanjurOpt.compileGroup(PanjurOpt.makeParts([mk(1, 43, 659), mk(2, 46, 2429), mk(3, 46, 859), mk(4, 46, 669), mk(5, 46, 1849)]), PO, null);
      check(co2.bars === 46 && co2.perBar === co.perBar && co2.changes === 1 && co2.steps[co2.steps.length - 1].n === 43, 'adedi az olan en kısa parçaysa en altta kalır, çubuk sayısı aynı');
      const ro = await PanjurOpt.optimize(its, PO, { iters: 2000, yield: false });
      check(ro.validation.ok && ro.groups.length === 1 && ro.groups[0].steps.map(st => st.setAside).join() === '3,0,0,0,0', 'sonuç: ilk satır kesilirken 3 çubuk kenarda → ' + ro.groups[0].steps.map(st => st.setAside).join());
      const blkO = PanjurExcel.groupBlock(ro.groups[0], {});
      check(blkO[0].A === 'GRUP 1' && blkO[0].F === '46 çubuk' && blkO[1].E === 2429 && blkO[1].F === '3 kenarda' && blkO[2].F === '', 'Excel bloğu: başlıkta "46 çubuk", ilk satır 2.429 ve "3 kenarda"');
      // büyük gerçek veride de her grup ölçüye göre sıralı (doğrulayıcı bunu ayrıca denetler)
      const rAll = await PanjurOpt.optimize(eko4.items, Object.assign({}, PO, { maxBundle: 50, minSum: 6250 }), { iters: 20000, yield: false });
      check(rAll.validation.ok && rAll.groups.every(g => g.steps.every((st, i) => i === 0 || st.len <= g.steps[i - 1].len)), 'dört proje: bütün gruplarda satırlar ölçüye göre büyükten küçüğe');
    }

    // ---------------------------------------------------------------- birden fazla çubuk boyu (6500 / 5000 / 4700)
    {
      const PM = Object.assign({}, PanjurOpt.DEFAULTS, { lengths: [6500, 5000, 4700], L: 6500, seed: 5 });
      const cg = lens => PanjurOpt.compileGroup(PanjurOpt.makeParts(lens.map((l, i) => mk(i + 1, 40, l))), PM, null);
      const c47 = cg([1500, 1500, 1600]), c50 = cg([1600, 1600, 1700]), c65 = cg([1700, 1700, 1700]);
      check(c47.barLen === 4700 && c50.barLen === 5000 && c65.barLen === 6500, 'grup sığdığı en kısa boydan kesilir: 4.612 → 4700, 4.912 → 5000, 5.112 → 6500');
      check(c47.leftover === 4700 - 4612 && c47.remnants[0].len === 88, 'kalan boy seçilen çubuğa göre: 4700 − 4612 = ' + c47.leftover);
      check(Math.abs(c47.barUnits - 40 * 4700 / 6500) < 1e-9 && c47.cost < c50.cost && c50.cost < c65.cost, 'çubuk maliyeti boyuyla orantılı (4700 < 5000 < 6500)');
      check(PanjurOpt.pickBar(PM, 4695) === 4700 && PanjurOpt.pickBar(PM, 4696) === 5000 && PanjurOpt.pickBar(PM, 4996) === 6500 && PanjurOpt.pickBar(Object.assign({}, PM, { lengths: null }), 100) === 6500, 'pickBar sınırları (emniyet payı 5)');
      // en az grup toplamı: en uzun boyda 6250, kısa boylarda aynı pay (4750 / 4450)
      const PMs = Object.assign({}, PM, { minSum: 6250 });
      const run3 = lens => PanjurOpt.optimize(lens.map((l, i) => mk(i + 1, 40, l)), PMs, { iters: 2500, yield: false });
      const ok47 = await run3([1500, 1500, 1600]), low47 = await run3([1500, 1500, 1300]), low65 = await run3([1700, 1700, 1700]), ok50 = await run3([1600, 1600, 1700]);
      check(ok47.validation.ok && ok47.groups.length === 1 && ok47.groups[0].barLen === 4700 && JSON.stringify(ok47.stats.barsByLen) === '{"4700":40}', '4.600 toplamlı grup 4700\'lük çubukta geçerli (sınır 4.450): 4700 × 40');
      check(ok50.validation.ok && ok50.groups.length === 1 && ok50.groups[0].barLen === 5000, '4.900 toplamlı grup 5000\'lik çubukta geçerli (sınır 4.750)');
      check(low47.validation.ok && low47.groups.length === 0 && low47.kalan.parts.length === 3, '4.300 toplamlı grup 4700\'lük çubukta sınırın (4.450) altında: KALANLAR');
      check(low65.validation.ok && low65.groups.length === 0 && low65.kalan.parts.length === 3, '5.100 toplamlı grup yalnızca 6500\'lüğe sığar, sınırın (6.250) altında: KALANLAR');
      // KALANLAR çubuk tahmini en az malzeme harcayan boydan: 1700 mm → 6500'lükten 3 (14 çubuk = 91 m),
      // 4700'lükten 2 (20 çubuk = 94 m) → 6500 seçilir; 1300 mm → 4700'lükten 3 (14 çubuk = 65,8 m)
      check(JSON.stringify(low65.stats.kalanBarsByLen) === JSON.stringify({ 6500: 40 }) && low65.stats.kalanNewBars === 40, 'KALANLAR tahmini (3 × 40 adet 1.700 mm): çubuğa 3 parça, 40 çubuk, 6500 boyundan → ' + JSON.stringify(low65.stats.kalanBarsByLen));
      check(JSON.stringify(low47.stats.kalanBarsByLen) === JSON.stringify({ 6500: 30 }) && low47.stats.kalanNewBars === 30, 'KALANLAR tahmini (1.500 ve 1.300 mm, 40 adet): 6500 boyundan 4 parça, 10 + 10 + 10 çubuk → ' + JSON.stringify(low47.stats.kalanBarsByLen));
      // gerçek veri: üç boyla daha çok poz gruba girer, sayım tutar
      const it21m = cT.lamel.items.map(i => ({ order: csv.orderNo, customer: 'BİRİNCİ PEN', poz: i.poz, len: i.len, count: i.count }));
      const r1 = await PanjurOpt.optimize(it21m, Object.assign({}, PanjurOpt.DEFAULTS, { seed: 11, maxBundle: 50, minSum: 6250 }), { iters: Math.min(ITERS, 40000), yield: false });
      const r3 = await PanjurOpt.optimize(it21m, Object.assign({}, PMs, { seed: 11, maxBundle: 50 }), { iters: Math.min(ITERS, 40000), yield: false });
      log('  21542 lamel tek boy / üç boy:', { tekBoyGrupPoz: r1.stats.groupPozCount, ucBoyGrupPoz: r3.stats.groupPozCount, boylar: r3.stats.barsByLen, kalan: r3.stats.kalanCount, fire: +(r3.stats.groupWastePct * 100).toFixed(2) });
      check(r3.validation.ok && r3.groups.every(g => [6500, 5000, 4700].includes(g.barLen) && g.sumLen >= g.barLen - 250 && g.perBar <= g.barLen - 5), 'üç boy 21542: doğrulama temiz, her grup kendi boyunun sınırında (boy − 250 ≤ toplam)');
      check(Object.values(r3.stats.barsByLen).reduce((a, b) => a + b, 0) === r3.stats.groupBars && r3.groups.reduce((a, g) => a + g.bars * g.barLen, 0) === r3.stats.groupMaterialMm, 'üç boy 21542: boy başına çubuk sayımı gruplarla tutuyor → ' + JSON.stringify(r3.stats.barsByLen));
      check(r3.stats.groupPozCount >= r1.stats.groupPozCount && r3.stats.groupPozCount >= 152, 'üç boy 21542: gruplardaki poz tek boydan az değil (' + r1.stats.groupPozCount + ' → ' + r3.stats.groupPozCount + ')');
      check(r3.groups.every((g, i) => i === 0 || g.barLen <= r3.groups[i - 1].barLen), 'üç boy 21542: gruplar çubuk boyuna göre uzundan kısaya sıralı');
      singlePozCheck(r3, Object.assign({}, PMs, { maxBundle: 50 }), 'üç boy 21542');
      // kuralsız parça (dikme, demet 2): boy seçimi malzemeyi azaltır
      const itD = cT.dikme.items.map(i => ({ order: csv.orderNo, customer: 'BİRİNCİ PEN', poz: i.poz, len: i.len, count: i.count }));
      const d1 = await PanjurOpt.optimize(itD, Object.assign({}, PanjurOpt.DEFAULTS, { seed: 11, maxBundle: 2 }), { iters: 20000, yield: false });
      const d3 = await PanjurOpt.optimize(itD, Object.assign({}, PM, { seed: 11, maxBundle: 2 }), { iters: 20000, yield: false });
      log('  21542 dikme tek boy / üç boy:', { tekBoyM: Math.round(d1.stats.materialMm / 1000), ucBoyM: Math.round(d3.stats.materialMm / 1000), boylar: d3.stats.barsByLen });
      check(d1.validation.ok && d3.validation.ok && d3.stats.kalanCount === 0 && d3.stats.materialMm <= d1.stats.materialMm, 'üç boy dikme: doğrulama temiz, malzeme tek boydan fazla değil (' + Math.round(d1.stats.materialMm / 1000) + ' → ' + Math.round(d3.stats.materialMm / 1000) + ' m)');
      // Excel: grup başlığında boy, sayfa başında boy başına çubuk
      const hb = PanjurExcel.groupBlock(r3.groups[0], { multiLen: true });
      check(hb[0].A === 'GRUP 1 · ' + r3.groups[0].barLen && hb[0].F === r3.groups[0].bars + ' çubuk', 'Excel bloğu: başlıkta stok boyu → "' + hb[0].A + '"');
      const xb = await PanjurExcel.buildWorkbook([{ result: r3, meta: { desc: cT.lamel.desc, color: cT.lamel.color, sheetName: 'LAMEL', orders: [] }, opts: {} }], { orders: [] });
      const z3 = XLSX.read(new Uint8Array(xb), { type: 'array', bookFiles: true });
      const ss = new TextDecoder().decode(new Uint8Array(z3.files['xl/sharedStrings.xml'].content));
      const want = 'Çubuk: ' + Object.keys(r3.stats.barsByLen).map(Number).sort((a, b) => b - a).map(L => L + ' × ' + r3.stats.barsByLen[L]).join(' · ');
      check(ss.includes(want) && ss.includes('GRUP 1 · ' + r3.groups[0].barLen), 'Excel: sayfa başında "' + want + '"');

      // ---- stok adedi: boy başına en çok kaç çubuk (isteğe bağlı)
      const one = k => Array.from({ length: k }, (_, i) => mk(i + 1, 1, 2000));      // 2000 mm: 6500'e 3, 4700'e 2 sığar
      const S1 = Object.assign({}, PanjurOpt.DEFAULTS, { maxBundle: 1, seed: 9 });
      const s3 = await PanjurOpt.optimize(one(12), Object.assign({}, S1, { lengths: [6500], stock: { 6500: 3 } }), { iters: 15000, yield: false });
      check(s3.validation.ok && JSON.stringify(s3.stats.barsByLen) === JSON.stringify({ 6500: 3 }) && s3.stats.groupPozCount === 9 && s3.stats.kalanCount === 3 && s3.kalan.listOnly === true,
        'stok: 12 × 2.000 için 4 çubuk gerekir, stokta 3 var → 9 parça kesilir, 3 parça KALANLAR');
      check(s3.stats.stockShort === 1 && s3.stats.kalanNewBars === 1 && (s3.kalan.fallbackGroups || []).length === 0, 'stok: KALANLAR için 1 çubuk daha gerekir (stok dışı), yeni çubuk grubu yazılmaz');
      const s22 = await PanjurOpt.optimize(one(12), Object.assign({}, S1, { lengths: [6500, 4700], stock: { 6500: 2, 4700: 2 } }), { iters: 15000, yield: false });
      check(s22.validation.ok && JSON.stringify(s22.stats.barsByLen) === JSON.stringify({ 4700: 2, 6500: 2 }) && s22.stats.groupPozCount === 10 && s22.stats.kalanCount === 2,
        'stok: 6500 × 2 ve 4700 × 2 ile 10 parça kesilir (3 + 3 + 2 + 2), 2 parça KALANLAR → ' + JSON.stringify(s22.stats.barsByLen));
      const sFree = await PanjurOpt.optimize(one(12), Object.assign({}, S1, { lengths: [6500, 4700], stock: { 4700: 2 } }), { iters: 15000, yield: false });
      check(sFree.validation.ok && sFree.stats.kalanCount === 0 && (sFree.stats.barsByLen[4700] || 0) <= 2 && sFree.stats.stockShort === 0, 'stok: 4700 sınırlı, 6500 sınırsız → hepsi kesilir, 4700 en çok 2 çubuk → ' + JSON.stringify(sFree.stats.barsByLen));
      const sZero = await PanjurOpt.optimize(one(4), Object.assign({}, S1, { lengths: [6500, 4700], stock: { 4700: 0 } }), { iters: 5000, yield: false });
      check(sZero.validation.ok && !sZero.stats.barsByLen[4700] && sZero.stats.kalanCount === 0, 'stok: adedi 0 girilen boy kullanılmaz');
      const sNone = await PanjurOpt.optimize(one(12), Object.assign({}, S1, { lengths: [6500, 4700], stock: { 4700: '' } }), { iters: 5000, yield: false });
      check(sNone.validation.ok && sNone.kalan.listOnly === false && Object.keys(sNone.stats.stock).length === 0, 'stok: boş adet sınır sayılmaz (eski davranış)');
      // kural açık lamel + stok: kısa boylar girilen adedi aşmaz, gruplar atandıkları boyda geçerli
      const rS = await PanjurOpt.optimize(it21m, Object.assign({}, PMs, { seed: 11, maxBundle: 50, stock: { 4700: 100, 5000: 40 } }), { iters: Math.min(ITERS, 30000), yield: false });
      log('  21542 lamel, 4700 stok 100 + 5000 stok 40:', { boylar: rS.stats.barsByLen, grupPoz: rS.stats.groupPozCount, kalan: rS.stats.kalanCount });
      check(rS.validation.ok && (rS.stats.barsByLen[4700] || 0) <= 100 && (rS.stats.barsByLen[5000] || 0) <= 40 && rS.groups.every(g => g.sumLen >= g.barLen - 250 && g.perBar <= g.barLen - 5),
        'stok + kural (21542): 4700 ≤ 100, 5000 ≤ 40, her grup atandığı boyda geçerli → ' + JSON.stringify(rS.stats.barsByLen));
      check(rS.stats.groupPozCount + rS.stats.kalanCount === 156 && rS.stats.groupPozCount >= 148, 'stok + kural (21542): pozların çoğu yine gruplarda (' + rS.stats.groupPozCount + '/156)');
      const rLim = await PanjurOpt.optimize(it21m, Object.assign({}, PanjurOpt.DEFAULTS, { seed: 11, maxBundle: 50, minSum: 6250, lengths: [6500], stock: { 6500: 500 } }), { iters: Math.min(ITERS, 30000), yield: false });
      check(rLim.validation.ok && rLim.stats.groupBars <= 500 && rLim.stats.kalanCount > 0 && rLim.stats.stockShort > 0, 'stok yetmezse (6500 × 500, gereken ≈ 1.400): gruplar ' + rLim.stats.groupBars + ' çubukta kalır, ' + rLim.stats.kalanCount + ' poz KALANLAR, stok dışı ≈ ' + rLim.stats.stockShort);
      // doğrulayıcı stok aşımını yakalar
      const tam = Object.assign({}, rS, { P: Object.assign({}, rS.P, { stock: { 6500: 1 } }) });
      check(!PanjurOpt.validate(tam).ok && PanjurOpt.validate(tam).errors.some(e => /Stok aşıldı/.test(e)), 'doğrulayıcı stok aşımını yakalar');
      // KALANLAR çubuk tahmini: parçalar tek tek yerleştirilir (3 × 2.000 tek 6500'lük çubuk)
      const est = PanjurOpt.estimateKalanBars([{ item: { len: 2000 }, count: 3 }, { item: { len: 3000 }, count: 2 }], Object.assign({}, PanjurOpt.DEFAULTS, { lengths: [6500, 4700], L: 6500 }), null);
      check(est.bars === 2 && est.short === 0 && JSON.stringify(est.byLen) === JSON.stringify({ 6500: 2 }), 'KALANLAR tahmini: 2 × 3.000 + 3 × 2.000 → iki 6500\'lük çubuk (3000 + 3000, 2000 × 3) → ' + JSON.stringify(est.byLen));
    }

    // ---------------------------------------------------------------- kutu profilleri ve diğer tanınan parçalar
    {
      const kp = PanjurParse.parseBuffer(await fetchBuf('../../örnek projeler/24576 OP.xls'), '24576 OP.xls');
      const kutular = kp.materials.filter(m => m.type === 'kutu');
      check(kp.orderNo === '24576' && kp.layout === 'başlıklı' && kp.columns.join('|') === 'poz|stok kodu|açıklama|renk|adet|ölçü', '24576 (kutulu örnek) okundu: ' + kp.columns.join(' · '));
      check(kutular.length === 4 && kutular.every(m => m.defaultOn && m.defaultBundle === 1 && m.items.length === 2 && m.color === 'ALTINMEŞE'), '24576: dört kutu profili (varsayılan açık, tek tek kesim)');
      check(kutular.map(m => m.label).sort().join(' | ') === 'KUTU SK-165/AR 90 | KUTU SK-165/ÖN 45 | KUTU SK-205/AR 90 | KUTU SK-205/ÖN 45', '24576 kutu etiketleri: ' + kutular.map(m => m.label).sort().join(' | '));
      const k165 = kutular.find(m => m.desc === 'SK-165/ÖN 45 KUTU');
      check(k165.stokCodes.join() === 'BAR.F.45.A40.165' && k165.items.map(i => i.len).sort((a, b) => a - b).join() === '1010,1930' && kp.warnings.length === 2, '24576 SK-165/ÖN 45: 1.010 (tarih bozulması düzeltildi) ve 1.930');
      check(kp.materials.filter(m => m.type === 'diger').length === 0, '24576: bütün ölçülü parçaların türü belli (genel profil yok) → ' + kp.materials.filter(m => m.type === 'diger').map(m => m.desc).join(', '));
      const ty = d => PanjurParse.typeOf(d).type;
      check(ty('SK-180/AR 90 KUTU') === 'kutu' && ty('KUTU BİTİŞ ALÜMİNYUM') === 'kutu' && ty('PANJUR KUTU KAPAK 220 MM') === 'kutukapak' && ty('PANJUR KUTU ALT KAPAK 220 MM') === 'kutukapak', 'tür: kutu ve kutu kapak');
      check(ty('KÖŞEBENT 20*40') === 'kosebent' && ty('PANO U 17*17') === 'pano' && ty("STRAFOR 220'LİK") === 'strafor' && PanjurParse.typeOf("STRAFOR 220'LİK").on === false, 'tür: köşebent, pano U (açık), strafor (kapalı)');
      check(ty('AS 55 EKO ALÜMINYUM LAMEL') === 'lamel' && ty('DİKMELİ U 62 LIK') === 'dikme' && ty('ALT PARÇA-55D  K.SİZ') === 'altparca' && ty('TAPA SL-56') === 'diger' && ty("165MM YAN KAPAK 45'") === 'diger', 'tür: eski türler bozulmadı');
      check(merged4.filter(m => m.type === 'diger').length === 0 && merged4.some(m => m.type === 'kutukapak') && merged4.some(m => m.type === 'strafor' && !m.defaultOn), 'dört proje: genel profil yok (kutu kapakları kendi türünde, strafor kapalı)');
      check(merged4.every(m => !('known' in m)) && merged4.map(m => m.type).join() === merged4.slice().sort((a, b) => (a.defaultOn ? 0 : 1) - (b.defaultOn ? 0 : 1)).map(m => m.type).join(), 'dört proje: "tanınma" alanı yok; işaretsiz gelenler (fitil, strafor) listenin sonunda');
      // kutu optimizasyonu: 1.010 + 1.930 tek çubukta, sığdığı en kısa boydan
      const mk165 = PanjurParse.mergeProjects([{ orderNo: kp.orderNo, customer: '', date: '', note: '', parsed: kp }]).find(m => m.desc === 'SK-165/ÖN 45 KUTU');
      const rk = await PanjurOpt.optimize(mk165.items, Object.assign({}, PanjurOpt.DEFAULTS, { lengths: [6500, 5000, 4700], maxBundle: 1 }), { iters: 2000, yield: false });
      check(rk.validation.ok && rk.groups.length === 1 && rk.groups[0].barLen === 4700 && rk.groups[0].steps.map(st => st.len).join() === '1930,1010' && JSON.stringify(rk.stats.barsByLen) === '{"4700":1}', 'kutu: 1.930 + 1.010 tek 4700\'lük çubuktan');
    }

    // ---------------------------------------------------------------- genel profiller: ölçüsü olan her kalem işaretli gelir
    // Tür yalnızca varsayılanları belirler. Türü bilinmeyen ölçülü kalem "genel profil"dir: işaretli gelir,
    // tek tek kesilir; yalnızca çubuktan kesilmeyenler (fitil, strafor) işaretsiz gelir.
    {
      const tr = n => n >= 1000 ? Math.floor(n / 1000) + '.' + String(n % 1000).padStart(3, '0') : String(n);
      const rows = [];
      for (let i = 1; i <= 5; i++) rows.push(
        `${i};;TAP.P.SD.V16.55E;AS 55 EKO ALÜMINYUM LAMEL;ANT.GRİ;40;${tr(1500 + i * 30)}`,
        `${i};;GC.462.24.NDU;DİKMELİ U 62 LIK;ANT.GRİ;2;${tr(1200 + i * 10)}`,
        `${i};;P-12442/3072;PVC SİNEKLİK ÖTELEME PROFİLİ;ANT.GRİ;${i % 2 ? 1 : 2};${tr(900 + i * 40)}`,
        `${i};;P-12450/3072;PVC YAN RAY 39'LUK;ANT.GRİ;2;${tr(1100 + i * 25)}`,
        `${i};;GC.080.48.INS;FİTİL 48*800 SİLİKONLU KIL FİTİL;;1;${tr(1500 + i * 30)}`,
        `${i};;STR.220.00.000;STRAFOR 220'LİK;;1;${tr(1500 + i * 30)}`,
        `${i};;WSS50-10/17;FERRİNİ-10/17  DÜZ MOTOR;;1;`);
      const gp = PanjurParse.parseCsvText(rows.join('\r\n'), '000000000099001_İmalat.csv');
      const gen = gp.materials.filter(m => m.type === 'diger');
      check(gp.orderNo === '99001' && gp.materials.map(m => m.type).join() === 'lamel,dikme,diger,diger,fitil,strafor', 'genel profil: sıra — türü belli olanlar, genel profiller, sonda işaretsiz gelenler → ' + gp.materials.map(m => m.type).join());
      check(gen.length === 2 && gen.every(m => m.defaultOn === true && m.defaultBundle === 1 && m.items.length === 5), 'genel profil: türü bilinmeyen ölçülü kalem işaretli gelir, tek tek kesilir');
      check(gen.map(m => m.label).join(' | ') === "PVC SİNEKLİK ÖTELEME | PVC YAN RAY 39'LUK", 'genel profil: kısa ad açıklamanın başından → ' + gen.map(m => m.label).join(' | '));
      check(gp.materials.filter(m => !m.defaultOn).map(m => m.type).join() === 'fitil,strafor', 'işaretsiz gelenler yalnızca fitil ve strafor → ' + gp.materials.filter(m => !m.defaultOn).map(m => m.type).join());
      check(gp.materials[0].defaultBundle === 50 && gp.materials[1].defaultBundle === 2 && PanjurParse.OTHER.on === true && PanjurParse.OTHER.bundle === 1, 'lamel demet 50 ve dikme demet 2 korunuyor; genel profil demet 1');
      check(gp.skipped.length === 1 && /MOTOR/.test(gp.skipped[0].desc) && gp.skipped[0].count === 5, 'ölçüsüz kalem (motor) yine atlanır');
      check(gp.materials.every(m => !('known' in m)), 'malzemelerde "tanınma" alanı yok');
      // aynı açıklama iki renkte: kısa ada renk eklenir; tek sözcüklü ve kısa açıklamalar olduğu gibi kalır
      const two = PanjurParse.parseCsvText([
        '1;;P-12442/3072;PVC SİNEKLİK ÖTELEME PROFİLİ;ANT.GRİ;1;950', '2;;P-12442/3072;PVC SİNEKLİK ÖTELEME PROFİLİ;ANT.GRİ;1;1.050',
        '1;;P-12442/9016;PVC SİNEKLİK ÖTELEME PROFİLİ;BEYAZ;1;950', '2;;P-12442/9016;PVC SİNEKLİK ÖTELEME PROFİLİ;BEYAZ;1;1.050',
        '1;;X-100;U PROFİL 20*20;ANT.GRİ;2;800', '2;;X-100;U PROFİL 20*20;ANT.GRİ;2;1.200'].join('\r\n'), '000000000099002_İmalat.csv');
      const labs2 = two.materials.map(m => m.label).sort().join(' | ');
      check(two.materials.length === 3 && labs2 === 'PVC SİNEKLİK ÖTELEME ANT.GRİ | PVC SİNEKLİK ÖTELEME BEYAZ | U PROFİL 20*20', 'genel profil: aynı ad iki renkte → renk eklenir → ' + labs2);
      // genel profil de tek tek kesilen diğer parçalar gibi çözülür (7 parça, toplam 7.140 mm → iki çubuk)
      const mergedG = PanjurParse.mergeProjects([{ orderNo: gp.orderNo, customer: '', date: '', note: '', parsed: gp }]);
      const mg = mergedG.find(m => /ÖTELEME/.test(m.desc));
      const rg = await PanjurOpt.optimize(mg.items, Object.assign({}, PanjurOpt.DEFAULTS, { maxBundle: mg.defaultBundle }), { iters: 3000, yield: false });
      log('  genel profil:', { poz: mg.items.length, parça: mg.pieces, çubuk: rg.stats.bars, grup: rg.stats.groupCount, kalan: rg.stats.kalanCount });
      check(mg.defaultOn === true && mg.pieces === 7 && rg.validation.ok && rg.oversize.length === 0 && rg.stats.bars === 2, 'genel profil çözüldü: 7 parça iki çubukta, doğrulama temiz → ' + rg.stats.bars + ' çubuk');

      // Excel sayfa adı. Düz kesme işareti dosyayı Excel'de açılmaz hale getiriyordu: yazdırma alanı başvurusu
      // 'ad'!$A$1 biçiminde yazılır ve addaki kesme işareti ikilenmez → eğik kesme işaretiyle değiştirilir.
      const SN = PanjurExcel.safeSheetName, Q = String.fromCharCode(0x2019);
      check(SN("PVC YAN RAY 39'LUK") === 'PVC YAN RAY 39' + Q + 'LUK' && SN("'TEK TIRNAK'") === Q + 'TEK TIRNAK' + Q && SN('KUTU SK-165/AR 90') === 'KUTU SK-165 AR 90'
        && SN('A[1]:B*C?') === 'A 1 B C' && SN('') === 'Sayfa' && SN('x'.repeat(40)).length === 31, 'Excel sayfa adı: yasak karakterler ayıklanır, düz kesme işareti kalmaz, en çok 31 karakter');
      const usedN = new Set(['ÖZET']);
      const long31 = 'ALÜMİNYUM SİNEKLİK KASA ANTRASİ';
      const u1 = PanjurExcel.uniqueSheetName(long31, usedN), u2 = PanjurExcel.uniqueSheetName(long31, usedN), u3 = PanjurExcel.uniqueSheetName(long31, usedN), u4 = PanjurExcel.uniqueSheetName('özet', usedN);
      check(long31.length === 31 && u1 === long31 && u2.length === 31 && / 2$/.test(u2) && / 3$/.test(u3) && new Set([u1, u2, u3]).size === 3 && u4 === 'özet 2',
        'Excel sayfa adı: 31 karakterlik aynı ad yinelenmez, sondan kısaltılıp numara alır (' + u2 + '); büyük/küçük harf ayrılmaz (' + u4 + ')');
      const resQ = [];
      for (const m of mergedG.filter(x => x.type === 'diger')) {
        resQ.push({ result: await PanjurOpt.optimize(m.items, Object.assign({}, PanjurOpt.DEFAULTS, { maxBundle: 1 }), { iters: 2000, yield: false }), meta: { desc: m.desc, color: m.color, sheetName: m.label, orders: [] }, opts: {} });
      }
      const qbuf = await PanjurExcel.buildWorkbook(resQ, { orders: [] });
      const qzip = XLSX.read(new Uint8Array(qbuf), { type: 'array', bookFiles: true });
      const qwb = new TextDecoder().decode(new Uint8Array(qzip.files['xl/workbook.xml'].content));
      const defs = (qwb.match(/<definedName [^>]*>[^<]*<\/definedName>/g) || []).map(d => d.replace(/<[^>]*>/g, '').replace(/&apos;/g, "'"));
      check(defs.length === 4 && defs.every(d => /^'[^']+'!\$/.test(d)) && qwb.includes('name="PVC YAN RAY 39' + Q + 'LUK"'), 'Excel: adında kesme işareti olan parça ("39\'LUK") geçerli sayfa adı ve yazdırma alanı başvurusu verir → ' + defs[2]);
      let reread = '';
      try { const w2 = new ExcelJS.Workbook(); await w2.xlsx.load(qbuf); reread = w2.worksheets.map(w => w.name).join(' | '); } catch (e) { reread = 'HATA ' + (e && e.message); }
      check(reread.indexOf('PVC SİNEKLİK ÖTELEME | PVC YAN RAY 39' + Q + 'LUK | ÖZET') === 0, 'Excel: adında kesme işareti olan parçanın dosyası geri okunabiliyor → ' + reread);
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
        const Pm = Object.assign({}, P, { maxBundle: m.defaultBundle, lengths: UI_LENGTHS, minSum: q.get('minSum') != null ? P.minSum : (type === 'lamel' ? P.L - 250 : 0) });
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
        const Pm = Object.assign({}, P, { maxBundle: m.defaultBundle, lengths: UI_LENGTHS, minSum: q.get('minSum') != null ? P.minSum : (m.type === 'lamel' ? P.L - 250 : 0) });
        const itN = Math.max(8000, Math.round(ITERS * Math.max(0.15, Math.min(m.defaultBundle <= 2 ? 1 : 4, m.items.length / 150))));
        const res = await PanjurOpt.optimize(m.items, Pm, { iters: itN, yield: false });
        const st = res.stats;
        check(res.validation.ok, m.label + ' doğrulama: ' + (res.validation.errors.slice(0, 2).join(' | ') || 'temiz'));
        singlePozCheck(res, Pm, m.label);
        log('  ' + m.label + ':', { poz: m.pozCount, proje: m.orders.length, grup: st.groupCount, grupPoz: st.groupPozCount, grupCubuk: st.groupBars, grupFire: +(st.groupWastePct * 100).toFixed(1), equal: st.equalGroups + '/' + st.groupCount, spreadMax: st.spreadMax, kalan: st.kalanCount, kalanCubuk: st.listOnly ? st.kalanNewBars : st.fallbackBars, bars: st.bars, boylar: st.barsByLen, fire: +(st.wastePct * 100).toFixed(1) });
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

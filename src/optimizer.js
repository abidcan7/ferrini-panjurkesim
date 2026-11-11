/*
 * Panjur kesim optimizasyonu — çekirdek motor
 * -------------------------------------------
 * Model:
 *   - Bir "grup" bir demetle yapılan sıralı kesimlerdir. Demet, gruptaki en büyük adet kadar
 *     çubukla açılır (≤ maxBundle). Satırlar ÖLÇÜYE göre büyükten küçüğe kesilir (usta uzun
 *     parçayı önce keser); adedi daha az olan satırda aradaki fark kadar çubuk kenarda bekler
 *     (hep aynı çubuklar). Bekleyen çubuklar o kesimi almadığı için boyları uzun kalır ve aynı
 *     boyda "artık demetleri" oluşturur. Satır sırası çubuk kullanımını değiştirmez.
 *   - Stok boyları (lengths): birden fazla çubuk boyu varsa (ör. 6500, 5000, 4700) her grup
 *     sığdığı EN KISA boydan kesilir; çubuk maliyeti boyuyla orantılıdır. P.L en uzun boydur.
 *   - Stok adedi (stock, isteğe bağlı): bir boydan en çok kaç çubuk kullanılabileceği. Sınır varsa
 *     gruplar boylara dağıtılır (assignStock): kısa boyun stoğu biterse grup bir uzun boya geçer;
 *     hiçbir boyda yer bulamayan grubun pozları KALANLAR'a kalır ve KALANLAR yalnızca listedir.
 *   - Adım = bir satır = TEK POZ (ölçü, adet). Varsayılan: her poz tam adediyle tek satır,
 *     tek kesim. İstenirse aynı poz aynı grupta birden çok satıra bölünebilir (multiStep);
 *     aynı ölçüdeki pozları tek kesimde birleştirme (mergeSameLength) iptal edildi, kapalı.
 *   - Bir çubuğa sığma şartı: Σ(ölçü + testere payı) ≤ boy − emniyet.
 *   - KALANLAR: gruba girmeyen pozlar; grupların artık demetlerinden kesilir.
 *     Artık yetmezse eksik yeni çubukla (fallback grupları) karşılanır.
 *   - Adet yakınlığı: bir gruptaki kesim adetleri birbirine yakın olmalıdır
 *     (en büyük − en küçük ≤ maxSpread; ideal 0, yani hepsi eşit).
 *   - En az grup toplamı (minSum; lamelde 6500'lük çubuk için 6250): ölçüleri toplamı bunun
 *     altında kalan grup "optimizasyon" sayılmaz ve YAZILMAZ; pozları KALANLAR'a bırakılır.
 *     minSum en uzun boy içindir; daha kısa boydan kesilen grupta aynı pay geçerlidir
 *     (6500 → 6250 ise 5000 → 4750, 4700 → 4450).
 *     Bu kural açıkken KALANLAR için yeni çubuk grupları da yazılmaz (yalnızca liste verilir,
 *     gereken çubuk tahmini raporlanır) ve arama, olabildiğince çok pozu toplamı
 *     minSum … (boy − emniyet − kesim payları) penceresine oturan gruplara yerleştirmeye çalışır.
 * Amaç: wCut·kesim + wBar·çubuk + wChange·demet bozma + wSpread·adet farkı (+ küçük fire cezası).
 *
 * Node ve tarayıcıda çalışır (UMD).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PanjurOpt = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    L: 6500,          // çubuk boyu (mm); lengths verilirse en uzun stok boyu
    lengths: null,    // stok boyları (mm), ör. [6500, 5000, 4700]; verilmezse yalnızca L
    stock: null,      // boy → en çok kaç çubuk (ör. { 5000: 40 }); verilmeyen boy sınırsız
    kerf: 4,          // testere payı (mm / kesim)
    safety: 5,        // emniyet payı (mm / çubuk)
    maxBundle: 50,    // tek seferde kesilebilecek en fazla parça
    wCut: 10,         // kesim ağırlığı
    wBar: 4,          // çubuk ağırlığı
    wChange: 1,       // demet bozma (çubuk kenara ayırma) ağırlığı
    wSpread: 2,       // grup içi adet farkı (en büyük − en küçük kesim adedi) başına ceza
    maxSpread: 4,     // grup içinde izin verilen en büyük adet farkı (9999 = sınırsız)
    wWaste: 0.0005,   // fire (mm) eşitlik bozucu
    wKalan: 12,       // KALANLAR'a düşen her poz için ceza (adet farkı ≤ maxSpread olan grup, KALANLAR'dan ucuz olmalı)
    wFill: 3,         // kullanılmayan son kalanları az sayıda çubukta toplamaya yönlendirir (bin-packing sinyali)
    minSum: 0,        // en az grup toplamı (Σ ölçü, mm): altında kalan grup yazılmaz, pozları KALANLAR'a gider (0 = kural yok)
    kalanBarFactor: 1.1, // minSum açıkken KALANLAR pozunun tahmini çubuk payı çarpanı (dağınık kesimin verimsizliği)
    mergeSameLength: false, // aynı ölçüdeki pozları tek kesimde birleştir (iptal: her satır tek poz)
    multiStep: false,       // aynı poz aynı grupta birden çok satıra bölünebilir (34 → 17 + 17)
    allowSplit: false,     // bir pozun adedi farklı gruplara bölünebilir (deneysel)
    minSplit: 5,           // bölme açıksa bir parçanın en küçük adedi
    seed: 12345,
    T0: 5, T1: 0.3,        // tavlama sıcaklıkları
    pLNS: 0.004,           // yık-ve-yeniden-kur hamlesi olasılığı
    pElim: 0.02,           // yeniden paketleme (grup boşaltma) hamlesi olasılığı
    pFill: 0.012,          // minSum açıkken: birkaç grubu dağıtıp serbest pozlardan geçerli grupları yeniden kurma olasılığı
  });

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const INFEASIBLE = Object.freeze({ feasible: false, cost: Infinity, steps: [], bars: 0, strokes: 0, changes: 0, spread: 0, remnants: [], perBar: Infinity, sumLen: 0, barLen: 0, barUnits: 0, cands: [] });
  const EMPTY = Object.freeze({ feasible: true, cost: 0, steps: [], bars: 0, strokes: 0, changes: 0, spread: 0, remnants: [], perBar: 0, sumLen: 0, barLen: 0, barUnits: 0, leftover: 0, n: 0, cands: [] });

  // ---------------------------------------------------------------- grup derleyici

  function buildKeys(parts, P) {
    if (P.mergeSameLength) {
      const map = new Map();
      for (const p of parts) {
        let k = map.get(p.item.len);
        if (!k) { k = { len: p.item.len, pieces: 0, parts: [] }; map.set(p.item.len, k); }
        k.pieces += p.count; k.parts.push(p);
      }
      return [...map.values()];
    }
    return parts.map(p => ({ len: p.item.len, pieces: p.count, parts: [p] }));
  }

  function candidateBundles(keys, P) {
    const s = new Set([P.maxBundle]);
    for (const k of keys) {
      s.add(Math.min(k.pieces, P.maxBundle));
      for (let m = 2; m <= 6; m++) s.add(Math.ceil(k.pieces / m));
      for (const p of k.parts) s.add(Math.min(p.count, P.maxBundle));
    }
    return [...s].filter(n => n >= 1 && n <= P.maxBundle).sort((a, b) => b - a);
  }

  // Bir ölçü anahtarını demet boyu n için adımlara böler. Dönüş: alloc listesi
  // (her alloc = [{part, count}]) ya da null (bu n ile mümkün değil).
  function splitKey(k, n, P) {
    const m = Math.ceil(k.pieces / n);
    if (m === 1) return [k.parts.map(p => ({ part: p, count: p.count }))];
    const sorted = k.parts.slice().sort((a, b) => b.count - a.count || a.id - b.id);
    // 1) poz hizalı: hiçbir poz bölünmeden (FFD)
    const bins = [], sums = [];
    let ok = true;
    for (const p of sorted) {
      if (p.count > n) { ok = false; break; }
      let placed = false;
      for (let b = 0; b < bins.length; b++) {
        if (sums[b] + p.count <= n) { bins[b].push({ part: p, count: p.count }); sums[b] += p.count; placed = true; break; }
      }
      if (!placed) { bins.push([{ part: p, count: p.count }]); sums.push(p.count); }
    }
    if (ok && bins.length === m) return bins;
    if (!P.multiStep) return ok ? bins : null;
    // 2) dengeli bölme (pozlar gerekirse adımlar arasında bölünür)
    const base = Math.floor(k.pieces / m), extra = k.pieces % m;
    const allocs = [];
    let ii = 0, remC = sorted[0].count;
    for (let i = 0; i < m; i++) {
      let need = base + (i < extra ? 1 : 0);
      const alloc = [];
      while (need > 0) {
        const take = Math.min(need, remC);
        alloc.push({ part: sorted[ii], count: take });
        need -= take; remC -= take;
        if (remC === 0) { ii++; remC = ii < sorted.length ? sorted[ii].count : 0; }
      }
      allocs.push(alloc);
    }
    return allocs;
  }

  // Grubun sığdığı en kısa stok boyu (birden fazla çubuk boyu tanımlıysa); yoksa P.L
  function pickBar(P, perBar) {
    const Ls = P.lengths;
    if (!Ls || Ls.length < 2) return P.L;
    let best = P.L;
    for (let i = 0; i < Ls.length; i++) if (Ls[i] < best && perBar <= Ls[i] - P.safety) best = Ls[i];
    return best;
  }
  // En az grup toplamı kuralına takılıyor mu? Sınır, grubun kesildiği boya göredir:
  // en uzun boyda minSum, kısa boylarda aynı pay (boy − (P.L − minSum)).
  function isLowComp(P, c) { return P.minSum > 0 && c.sumLen < c.barLen - (P.L - P.minSum); }
  // KALANLAR yalnızca liste mi? (en az grup toplamı kuralı ya da sınırlı stok varsa: onlar için
  // yeni çubuk grubu yazılmaz)
  function listOnly(P) { return P.minSum > 0 || !!P.limited; }

  function compileWithN(keys, n, P, cap) {
    const steps = [];
    let perBar = 0;
    for (const k of keys) {
      const allocs = splitKey(k, n, P);
      if (!allocs) return null;
      perBar += allocs.length * (k.len + P.kerf);
      if (perBar > cap) return null;
      for (const alloc of allocs) {
        let c = 0;
        for (const a of alloc) c += a.count;
        steps.push({ len: k.len, n: c, alloc });
      }
    }
    // Satır sırası: ölçüsü büyük olandan küçüğe; eşit ölçüde adedi çok olan önce.
    steps.sort((a, b) => b.len - a.len || b.n - a.n);
    let bars = 0, minN = Infinity, sumLen = 0, changes = 0;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      if (st.n > bars) bars = st.n;
      if (st.n < minN) minN = st.n;
      sumLen += st.len;
      if (i > 0 && st.n !== steps[i - 1].n) changes++;     // demet bozma: adedin değiştiği her geçiş
    }
    // Adet farkı: gruptaki en kalabalık ve en az kesimin adet farkı. İdeal 0 (hepsi eşit).
    const spread = bars - minN;
    if (spread > P.maxSpread) return null;
    const barLen = pickBar(P, perBar);
    // Artıklar: adet düzeyi v olan çubuklar yalnızca adedi ≥ v olan satırlarda kesilir; daha az
    // adetli satırlarda kenarda bekledikleri için boyları uzun kalır.
    const remnants = [];
    if (spread > 0) {
      const levels = [];
      for (const st of steps) if (levels.indexOf(st.n) < 0) levels.push(st.n);
      levels.sort((a, b) => b - a);
      for (let j = 0; j < levels.length - 1; j++) {
        let used = 0;
        for (const st of steps) if (st.n >= levels[j]) used += st.len + P.kerf;
        remnants.push({ count: levels[j] - levels[j + 1], len: barLen - used, afterStep: j + 1 });
      }
    }
    const leftover = barLen - perBar;
    remnants.push({ count: minN, len: leftover, afterStep: steps.length, final: true });
    // Çubuk maliyeti boyuyla orantılıdır (kısa stok boyu daha ucuz); P.L en uzun boy
    const barUnits = bars * barLen / P.L;
    const cost = P.wCut * steps.length + P.wBar * barUnits + P.wChange * changes + (P.wSpread || 0) * spread;
    // sumLen: satırların ölçü toplamı (Excel'deki toplam satırı); minSum kuralı buna bakar
    return { feasible: true, n, steps, bars, strokes: steps.length, changes, spread, remnants, perBar, sumLen, leftover, barLen, barUnits, cost };
  }

  /** Poz kümesi için en iyi kesim planı. nPref verilirse yalnızca o demet boyu denenir. */
  function compileGroup(parts, P, nPref) {
    if (!parts.length) return EMPTY;
    const cap = P.L - P.safety;
    const keys = buildKeys(parts, P);
    let minPerBar = 0;
    for (const k of keys) minPerBar += k.len + P.kerf;
    if (minPerBar > cap) return INFEASIBLE;
    const cands = candidateBundles(keys, P);
    // ön eleme (plausible) için özet: her anahtar tek adım olsaydı çubuk başı boy ve adet aralığı
    let piecesMax = 0, piecesMin = Infinity;
    for (const k of keys) {
      const pc = Math.min(k.pieces, P.maxBundle);
      if (pc > piecesMax) piecesMax = pc;
      if (pc < piecesMin) piecesMin = pc;
    }
    const tag = r => { r.cands = cands; r.minPerBar = minPerBar; r.piecesMax = piecesMax; r.piecesMin = piecesMin; return r; };
    if (nPref) {
      const r = compileWithN(keys, nPref, P, cap);
      if (r) return tag(r);
    }
    let best = null;
    for (const n of cands) {
      const r = compileWithN(keys, n, P, cap);
      if (r && (!best || r.cost < best.cost)) best = r;
    }
    if (!best) return INFEASIBLE;
    return tag(best);
  }

  // ---------------------------------------------------------------- KALANLAR (artık) planlayıcı

  function insertSorted(queue, from, b) {
    let i = queue.length;
    while (i > from && bundleBefore(b, queue[i - 1])) i--;
    queue.splice(i, 0, b);
  }
  function bundleBefore(a, b) {
    return a.count > b.count || (a.count === b.count && a.len > b.len);
  }

  /**
   * KALANLAR parçalarını artık demetlerinden keser (deterministik, açgözlü).
   * pool: [{count, len, group, step}] — len fiziksel kalan boy.
   */
  function planKalan(parts, pool, P, estimate) {
    const res = { plan: [], strokes: 0, changes: 0, deficit: [], usedMm: 0, fallback: null, estBars: 0, cost: 0 };
    if (!parts.length) return res;
    const dem = parts.map(p => ({ part: p, rem: p.count }))
      .sort((a, b) => b.part.item.len - a.part.item.len || a.part.id - b.part.id);
    let minLen = Infinity, totalRem = 0;
    for (const d of dem) { if (d.part.item.len < minLen) minLen = d.part.item.len; totalRem += d.rem; }
    const queue = [];
    for (const b of pool) {
      if (b.count > 0 && b.len - P.safety >= minLen + P.kerf) queue.push({ count: b.count, len: b.len, group: b.group, step: b.step });
    }
    queue.sort((a, b) => b.count - a.count || b.len - a.len || a.group - b.group || a.step - b.step);
    let qi = 0;
    while (qi < queue.length && totalRem > 0) {
      const b = queue[qi++];
      let n = b.count, cap = b.len - P.safety, used = 0;
      const bsteps = [];
      for (;;) {
        let best = null, bestFull = false;
        for (const d of dem) {
          if (d.rem <= 0) continue;
          if (d.part.item.len + P.kerf > cap) continue;
          const full = d.rem >= n;
          if (!best || (full && !bestFull)) { best = d; bestFull = full; if (full) break; }
        }
        if (!best) break;
        const take = Math.min(n, best.rem);
        if (take < n) {
          res.changes++;
          insertSorted(queue, qi, { count: n - take, len: b.len - used, group: b.group, step: b.step, derived: true });
        }
        bsteps.push({ len: best.part.item.len, n: take, part: best.part });
        res.strokes++;
        best.rem -= take; totalRem -= take; n = take;
        used += best.part.item.len + P.kerf; cap -= best.part.item.len + P.kerf;
        res.usedMm += take * best.part.item.len;
      }
      if (bsteps.length) res.plan.push({ bundle: b, steps: bsteps, leftoverCount: n, leftoverLen: b.len - used });
    }
    for (const d of dem) if (d.rem > 0) res.deficit.push({ id: d.part.id, item: d.part.item, count: d.rem, origin: d.part });
    res.cost = P.wCut * res.strokes + P.wChange * res.changes + (P.wKalan || 0) * parts.length;
    if (res.deficit.length) {
      if (estimate) {
        // minSum kuralı: artıktan çıkmayan KALANLAR için grup kurulmaz; maliyeti toplamsal bir
        // tahminle sayılır (poz başına bir kesim + boyuyla orantılı çubuk payı). Arama sırasında
        // her değerlendirmede açgözlü gruplama yapmak hem pahalı hem gereksizdir.
        const cap = P.L - P.safety;
        let mm = 0;
        for (const d of res.deficit) mm += d.count * (d.item.len + P.kerf);
        res.estBars = (P.kalanBarFactor || 1.1) * mm / cap;
        res.cost += P.wCut * res.deficit.length + P.wBar * res.estBars;
      } else {
        res.fallback = fallbackGroups(res.deficit, P);
        res.cost += res.fallback.cost;
      }
    }
    return res;
  }

  /** Artık yetmeyen parçalar için yeni çubuklarla açgözlü gruplama (FFD). */
  function fallbackGroups(parts, P) {
    const sorted = parts.slice().sort((a, b) => b.item.len - a.item.len || b.count - a.count);
    const groups = [];
    for (const p of sorted) {
      let best = null, bestDelta = Infinity;
      for (const g of groups) {
        const c = compileGroup(g.parts.concat(p), P, null);
        if (!c.feasible) continue;
        const delta = c.cost - g.comp.cost;
        if (delta < bestDelta) { bestDelta = delta; best = { g, c }; }
      }
      const alone = compileGroup([p], P, null);
      if (best && bestDelta <= alone.cost) { best.g.parts.push(p); best.g.comp = best.c; }
      else groups.push({ parts: [p], comp: alone, nPref: null });
    }
    let bars = 0, strokes = 0, changes = 0, cost = 0, barUnits = 0, matMm = 0;
    for (const g of groups) {
      bars += g.comp.bars; strokes += g.comp.strokes; changes += g.comp.changes; cost += g.comp.cost;
      barUnits += g.comp.barUnits; matMm += g.comp.bars * g.comp.barLen;
    }
    return { groups, bars, strokes, changes, cost, barUnits, matMm };
  }

  // ---------------------------------------------------------------- sınırlı stok
  /**
   * Grupları stok boylarına dağıtır (yalnızca bir boyda adet sınırı varsa çağrılır).
   * Her grup, sığdığı en kısa boydan başlayarak stoğu yeten ve (kural açıksa) en az grup toplamını
   * sağlayan ilk boyu alır; hiçbiri yoksa 0 (yerleşemedi). Kısa boya ihtiyaç duyan gruplar önce
   * gelir; aynı boyu isteyenlerde çubuk başına kazancı yüksek olan önceliklidir.
   * Dönüş: { assign: Map(grup → boy | 0), remaining: Map(boy → kalan stok) }
   */
  function assignStock(state, cand) {
    const P = state.P, ms = P.minSum > 0, slack = P.L - P.minSum;
    const Ls = P.lengths.slice().sort((a, b) => a - b);
    const remaining = new Map();
    for (const L of Ls) remaining.set(L, P.stock && P.stock[L] != null ? P.stock[L] : Infinity);
    const dens = new Map();
    for (const gi of cand) {
      const g = state.groups[gi];
      let v = -g.comp.cost;
      for (const p of g.parts) v += kalanCost(p, P);
      dens.set(gi, v / g.comp.bars);
    }
    const order = cand.slice().sort((x, y) => state.groups[x].comp.barLen - state.groups[y].comp.barLen || dens.get(y) - dens.get(x) || x - y);
    const assign = new Map();
    for (const gi of order) {
      const c = state.groups[gi].comp;
      let got = 0;
      for (const L of Ls) {
        if (L < c.barLen || remaining.get(L) < c.bars) continue;
        if (ms && c.sumLen < L - slack) continue;
        got = L; break;
      }
      assign.set(gi, got);
      if (got) remaining.set(got, remaining.get(got) - c.bars);
    }
    return { assign, remaining };
  }

  // ---------------------------------------------------------------- durum ve değerlendirme

  const KALAN = -1;

  class State {
    constructor(parts, P, rng) {
      this.P = P; this.rng = rng;
      this.parts = parts;                 // tüm parçalar (poz parçaları)
      this.groups = [];                   // {parts: [], nPref, comp}
      this.loc = new Map();               // part.id → grup indeksi | KALAN
      this.totalPieceMm = 0; this.minLen = Infinity;
      for (const p of parts) { this.totalPieceMm += p.count * p.item.len; if (p.item.len < this.minLen) this.minLen = p.item.len; }
      this.cost = Infinity; this.eval = null;
    }
    newGroupIndex() {
      for (let i = 0; i < this.groups.length; i++) if (this.groups[i].parts.length === 0) return i;
      this.groups.push({ parts: [], nPref: null, comp: EMPTY });
      return this.groups.length - 1;
    }
    kalanParts() {
      const out = [];
      for (const p of this.parts) if (this.loc.get(p.id) === KALAN) out.push(p);
      return out;
    }
    recompile(gi) {
      const g = this.groups[gi];
      if (g.parts.length === 0) { g.comp = EMPTY; g.nPref = null; return; }
      g.comp = compileGroup(g.parts, this.P, g.nPref);
      if (!g.comp.feasible && g.nPref) { g.nPref = null; g.comp = compileGroup(g.parts, this.P, null); }
    }
    // minSum kuralı açıkken toplamı sınırın altında kalan gruplar "grup" sayılmaz: pozları
    // KALANLAR gibi değerlendirilir (aramada bu gruplar pozların biriktiği bekleme alanıdır).
    isLow(g) { return g.parts.length > 0 && isLowComp(this.P, g.comp); }
    /** KALANLAR + (minSum açıkken) sınırın altındaki grupların pozları */
    freeParts() {
      const out = this.kalanParts();
      if (this.P.minSum > 0) for (const g of this.groups) if (this.isLow(g)) for (const p of g.parts) out.push(p);
      return out;
    }
    // Grup serbest mi (pozları KALANLAR sayılıyor mu)? Sınırın altında kalmışsa ya da son
    // değerlendirmede stoktan boy alamamışsa.
    isFree(gi) {
      const g = this.groups[gi];
      if (!g.parts.length) return false;
      if (this.isLow(g)) return true;
      return !!(this.eval && this.eval.assign && this.eval.assign.get(gi) === 0);
    }
    evaluate() {
      const P = this.P, ms = P.minSum > 0, lo = listOnly(P);
      let cost = 0, bars = 0, strokes = 0, changes = 0, barUnits = 0, matMm = 0;
      const pool = [];
      const kal = this.kalanParts();
      const cand = [];
      for (let gi = 0; gi < this.groups.length; gi++) {
        const g = this.groups[gi];
        if (g.parts.length === 0) continue;
        const c = g.comp;
        if (!c.feasible) return { cost: Infinity };
        if (ms && isLowComp(P, c)) { for (const p of g.parts) kal.push(p); continue; }
        cand.push(gi);
      }
      // Sınırlı stok varsa gruplar boylara dağıtılır; boy alamayan grubun pozları KALANLAR sayılır.
      const st = P.limited ? assignStock(this, cand) : null;
      const placed = [];        // [grup, ek boy, grup, ek boy, …]
      for (const gi of cand) {
        const g = this.groups[gi], c = g.comp;
        let extra = 0;          // stok yüzünden sığdığından uzun boydan kesiliyorsa aradaki fark
        if (st) {
          const L = st.assign.get(gi);
          if (!L) { for (const p of g.parts) kal.push(p); continue; }
          extra = L - c.barLen;
        }
        placed.push(gi, extra);
        cost += c.cost + (extra ? P.wBar * c.bars * extra / P.L : 0);
        bars += c.bars; strokes += c.strokes; changes += c.changes;
        barUnits += c.bars * (c.barLen + extra) / P.L; matMm += c.bars * (c.barLen + extra);
        for (const r of c.remnants) if (r.count > 0 && r.len + extra > 0) pool.push({ count: r.count, len: r.len + extra, group: gi, step: r.afterStep });
      }
      const kp = planKalan(kal, pool, P, lo);
      cost += kp.cost;
      if (P.wFill) {
        // KALANLAR'da kullanılmayan son kalanlar için doluluk ödülü (yalnızca gerçek hurda)
        const usedFinal = new Set();
        for (const e of kp.plan) usedFinal.add(e.bundle.group + ':' + e.bundle.step);
        for (let i = 0; i < placed.length; i += 2) {
          const gi = placed[i], c = this.groups[gi].comp;
          if (usedFinal.has(gi + ':' + c.steps.length)) continue;
          const f = (c.leftover + placed[i + 1]) / P.L;
          cost -= P.wFill * c.remnants[c.remnants.length - 1].count * f * f;
        }
      }
      const fbBars = kp.fallback ? kp.fallback.bars : kp.estBars;
      const fbUnits = kp.fallback ? kp.fallback.barUnits : kp.estBars;
      const fbMm = kp.fallback ? kp.fallback.matMm : kp.estBars * P.L;
      const fbStrokes = kp.fallback ? kp.fallback.strokes : 0;
      const fbChanges = kp.fallback ? kp.fallback.changes : 0;
      cost += P.wWaste * (matMm + fbMm - this.totalPieceMm);
      return { cost, bars: bars + fbBars, barUnits: barUnits + fbUnits, matMm: matMm + fbMm, strokes: strokes + kp.strokes + fbStrokes, changes: changes + kp.changes + fbChanges, kp, kal,
        groupBars: bars, groupBarUnits: barUnits, groupMatMm: matMm, groupStrokes: strokes, groupChanges: changes,
        assign: st ? st.assign : null, remaining: st ? st.remaining : null };
    }
    snapshot() {
      const s = { loc: new Map(this.loc), nPref: this.groups.map(g => g.nPref), cost: this.cost };
      if (this.P.allowSplit) s.parts = this.parts.map(p => ({ id: p.id, item: p.item, count: p.count }));
      return s;
    }
    checkConsistency(tag) {
      const seen = new Map();
      for (let gi = 0; gi < this.groups.length; gi++) {
        const g = this.groups[gi];
        for (const p of g.parts) {
          if (seen.has(p.id)) throw new Error(`${tag}: parça ${p.id} iki yerde (${seen.get(p.id)} ve ${gi})`);
          seen.set(p.id, gi);
          if (this.loc.get(p.id) !== gi) throw new Error(`${tag}: parça ${p.id} loc=${this.loc.get(p.id)} ama grupta ${gi}`);
        }
        if (g.parts.length && !g.comp.feasible) throw new Error(`${tag}: grup ${gi} dolu ama comp infeasible`);
        if (g.parts.length && g.comp.steps.length === 0) throw new Error(`${tag}: grup ${gi} dolu ama adım yok`);
        if (!g.parts.length && g.comp.steps.length) throw new Error(`${tag}: grup ${gi} boş ama adım var`);
      }
      for (const p of this.parts) {
        const l = this.loc.get(p.id);
        if (l === KALAN) { if (seen.has(p.id)) throw new Error(`${tag}: parça ${p.id} KALAN ama grupta`); }
        else if (!seen.has(p.id)) throw new Error(`${tag}: parça ${p.id} loc=${l} ama hiçbir grupta değil`);
      }
    }
    restore(s) {
      if (s.parts) this.parts = s.parts.map(p => ({ id: p.id, item: p.item, count: p.count }));
      for (const g of this.groups) { g.parts = []; }
      this.loc = new Map();
      for (const p of this.parts) {
        const gi = s.loc.get(p.id);
        this.loc.set(p.id, gi);
        if (gi !== KALAN) {
          while (this.groups.length <= gi) this.groups.push({ parts: [], nPref: null, comp: EMPTY });
          this.groups[gi].parts.push(p);
        }
      }
      for (let i = 0; i < this.groups.length; i++) { this.groups[i].nPref = s.nPref[i] || null; this.recompile(i); }
      this.eval = this.evaluate(); this.cost = this.eval.cost;
    }
  }

  // ---------------------------------------------------------------- kurucu sezgisel

  function constructInitial(state) {
    const P = state.P;
    if (P.minSum > 0) {
      // En az grup toplamı kuralı: bütün pozlar serbest başlar, toplamı pencereye oturan
      // gruplar kurulur; hiçbir geçerli gruba giremeyenler KALANLAR'da kalır.
      for (const p of state.parts) state.loc.set(p.id, KALAN);
      fillFree(state, 4000, false);
      state.eval = state.evaluate(); state.cost = state.eval.cost;
      return;
    }
    const sorted = state.parts.slice().sort((a, b) => b.item.len - a.item.len || b.count - a.count || a.id - b.id);
    for (const p of sorted) {
      let best = null, bestDelta = Infinity;
      for (let gi = 0; gi < state.groups.length; gi++) {
        const g = state.groups[gi];
        if (g.parts.length === 0) continue;
        const c = compileGroup(g.parts.concat(p), P, null);
        if (!c.feasible) continue;
        const delta = c.cost - g.comp.cost;
        if (delta < bestDelta) { bestDelta = delta; best = { gi, c }; }
      }
      const alone = compileGroup([p], P, null);
      if (best && bestDelta <= alone.cost) {
        state.groups[best.gi].parts.push(p); state.groups[best.gi].comp = best.c; state.loc.set(p.id, best.gi);
      } else {
        const gi = state.newGroupIndex();
        state.groups[gi].parts.push(p); state.groups[gi].comp = alone; state.loc.set(p.id, gi);
      }
    }
    state.eval = state.evaluate(); state.cost = state.eval.cost;
  }

  // ---------------------------------------------------------------- en az grup toplamı (minSum)

  // Bir pozun KALANLAR'da kalmasının (artıktan çıkmadığı varsayımıyla) maliyeti; planKalan'ın
  // tahmin moduyla aynı ölçü: poz cezası + bir kesim + boyuyla orantılı çubuk payı.
  function kalanCost(p, P) {
    return (P.wKalan || 0) + P.wCut + P.wBar * (P.kalanBarFactor || 1.1) * p.count * (p.item.len + P.kerf) / (P.L - P.safety);
  }

  /**
   * Çekirdek pozlara (seeds) aday pozlardan ekleyerek "geçerli" bir grup arar: ölçü toplamı
   * minSum'dan az olmayan, çubuğa sığan (Σ(ölçü + testere payı) ≤ boy − emniyet), adetleri
   * maxSpread içinde kalan en kazançlı alt küme (sınırlı derinlik-öncelikli arama).
   * Kazanç = pozların KALANLAR maliyeti − grubun maliyeti; yalnızca kazançlı gruplar döner.
   * rng verilirse aday sırası hafifçe karıştırılır (her çağrıda başka çözüm).
   * avail (Map boy → kalan stok) verilirse grup, stoğu yeten bir boya oturmak zorundadır.
   * Dönüş: { parts, gain } ya da null.
   */
  function bestFill(P, seeds, cands, limit, rng, avail) {
    const cap = P.L - P.safety, kerf = P.kerf;
    const slack = P.L - P.minSum;                     // her boyda izin verilen en çok açık (boy − toplam)
    const Ls = (P.lengths && P.lengths.length ? P.lengths : [P.L]).slice().sort((a, b) => a - b);
    // çubuk başı boy (testere payları dahil) per olan grubun sığdığı en kısa stok boyu
    const need = per => { for (let i = 0; i < Ls.length; i++) if (per <= Ls[i] - P.safety) return Ls[i]; return P.L; };
    // stok sınırlıyken: sığan, stoğu hi çubuğa yeten ve toplamı sınırı tutan en kısa boy (yoksa 0)
    const place = (per, hi, sum) => {
      for (let i = 0; i < Ls.length; i++) {
        const L = Ls[i];
        if (per > L - P.safety || avail.get(L) < hi) continue;
        if (sum >= L - slack) return L;
      }
      return 0;
    };
    const S = P.maxSpread == null ? 9999 : P.maxSpread;
    const exact = P.mergeSameLength || P.multiStep;   // satır sayısı poz sayısına eşit değilse tam derleme gerekir
    let sum0 = 0, per0 = 0, lo0 = Infinity, hi0 = -Infinity, kc0 = 0;
    for (const p of seeds) {
      sum0 += p.item.len; per0 += p.item.len + kerf; kc0 += kalanCost(p, P);
      if (p.count < lo0) lo0 = p.count;
      if (p.count > hi0) hi0 = p.count;
    }
    if (per0 > cap || hi0 - lo0 > S) return null;
    const list = [];
    for (const p of cands) {
      if (per0 + p.item.len + kerf > cap) continue;
      if (Math.max(hi0, p.count) - Math.min(lo0, p.count) > S) continue;
      list.push(p);
    }
    const key = new Map();
    for (const p of list) key.set(p.id, p.item.len + (rng ? rng() * 300 : 0));
    list.sort((a, b) => key.get(b.id) - key.get(a.id) || b.count - a.count || a.id - b.id);
    const n = list.length;
    const suffix = new Array(n + 1);
    suffix[n] = 0;
    for (let i = n - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + list[i].item.len;
    const chosen = [], counts = [];
    let best = null, bestGain = 1e-9, nodes = 0;
    const score = (lo, hi, kc, barLen) => {
      const parts = seeds.concat(chosen);
      let cost;
      if (exact) {
        const c = compileGroup(parts, P, null);
        if (!c.feasible || isLowComp(P, c)) return;
        cost = c.cost;
      } else {
        // her poz tek satır: çubuk = en büyük adet (boyuyla orantılı), demet bozma ≥ farklı adet sayısı − 1
        counts.length = 0;
        for (const q of parts) if (counts.indexOf(q.count) < 0) counts.push(q.count);
        cost = P.wCut * parts.length + P.wBar * hi * barLen / P.L + P.wChange * (counts.length - 1) + (P.wSpread || 0) * (hi - lo);
      }
      if (kc - cost > bestGain) { bestGain = kc - cost; best = parts; }
    };
    const dfs = (i, sum, per, lo, hi, kc) => {
      if (nodes++ > limit) return;
      // Bu pozlar en az barLen boyunda çubuk ister; poz eklendikçe gereken boy ancak büyür.
      // Geçerli olmak için toplam en az (boy − pay) olmalı.
      const barLen = need(per), minSum = barLen - slack;
      if (sum >= minSum) {
        const L = avail ? place(per, hi, sum) : barLen;
        if (L) score(lo, hi, kc, L);
      }
      const room = cap - per;
      for (let j = i; j < n; j++) {
        if (nodes > limit) return;
        if (sum + Math.min(room, suffix[j]) < minSum) return;   // kalan adaylarla hiçbir pencereye ulaşılamaz
        const q = list[j], u = q.item.len + kerf;
        if (u > room) continue;
        const nlo = q.count < lo ? q.count : lo, nhi = q.count > hi ? q.count : hi;
        if (nhi - nlo > S) continue;
        chosen.push(q);
        dfs(j + 1, sum + q.item.len, per + u, nlo, nhi, kc + kalanCost(q, P));
        chosen.pop();
      }
    };
    dfs(0, sum0, per0, lo0, hi0, kc0);
    return best ? { parts: best, gain: bestGain } : null;
  }

  /**
   * Serbest pozlardan (KALANLAR + toplamı minSum altında kalan gruplar) geçerli gruplar kurar.
   * Sınırın altındaki gruplar önce dağıtılır. randomize: çekirdek sırası ve aday sırası karışır.
   * Kurulan grup sayısını döndürür; state.cost güncellenmez (çağıran evaluate eder).
   */
  function fillFree(state, limit, randomize) {
    const P = state.P, rng = state.rng;
    const dissolve = g => {
      for (const p of g.parts) state.loc.set(p.id, KALAN);
      g.parts = []; g.comp = EMPTY; g.nPref = null;
    };
    for (const g of state.groups) if (state.isLow(g)) dissolve(g);
    // Sınırlı stok: boy alamayan gruplar da dağıtılır; yeni gruplar kalan stoğa göre kurulur
    let avail = null;
    const asc = (P.lengths || [P.L]).slice().sort((a, b) => a - b), slack = P.L - P.minSum;
    if (P.limited) {
      const ev = state.evaluate();
      if (ev.assign) {
        for (const [gi, L] of ev.assign) if (!L) dissolve(state.groups[gi]);
        avail = new Map(ev.remaining);
      }
    }
    const free = state.kalanParts();
    if (randomize) {
      for (let i = free.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = free[i]; free[i] = free[j]; free[j] = t; }
    } else free.sort((a, b) => b.item.len - a.item.len || b.count - a.count || a.id - b.id);
    const used = new Set();
    let made = 0;
    for (const seed of free) {
      if (used.has(seed.id)) continue;
      const cands = [];
      for (const q of free) if (q !== seed && !used.has(q.id)) cands.push(q);
      const r = bestFill(P, [seed], cands, limit, randomize ? rng : null, avail);
      if (!r) continue;
      const comp = compileGroup(r.parts, P, null);
      if (!comp.feasible || isLowComp(P, comp)) continue;
      if (avail) {
        let L = 0;
        for (const x of asc) {
          if (x < comp.barLen || avail.get(x) < comp.bars || comp.sumLen < x - slack) continue;
          L = x; break;
        }
        if (!L) continue;
        avail.set(L, avail.get(L) - comp.bars);
      }
      const gi = state.newGroupIndex(), g = state.groups[gi];
      g.parts = r.parts.slice(); g.comp = comp; g.nPref = null;
      for (const q of r.parts) { state.loc.set(q.id, gi); used.add(q.id); }
      made++;
    }
    return made;
  }

  // minSum hamlesi: 0–3 geçerli grubu dağıtır, serbest pozlarla birlikte yeniden kurar.
  function fillIteration(state, T) {
    const rng = state.rng, P = state.P;
    const valid = [];
    let freeCount = 0;
    for (let i = 0; i < state.groups.length; i++) {
      const g = state.groups[i];
      if (!g.parts.length) continue;
      if (state.isFree(i)) freeCount += g.parts.length; else valid.push(i);
    }
    for (const p of state.parts) if (state.loc.get(p.id) === KALAN) freeCount++;
    let k = (rng() * 4) | 0;
    if (!freeCount && k < 2) k = 2;          // serbest poz yoksa tek grubu dağıtıp aynen kurmak boşunadır
    k = Math.min(k, valid.length);
    if (!k && !freeCount) return false;
    const snap = state.snapshot();
    snap.comps = state.groups.map(g => g.comp);
    const chosen = new Set();
    if (k && rng() < 0.5) {
      // adetleri en dağınık (ya da en boş) geçerli grup öncelikli
      let worst = -1, worstV = -1;
      for (const gi of valid) {
        const c = state.groups[gi].comp;
        const v = (c.spread || 0) * 10 + c.changes * 3 + c.leftover / 100 + rng();
        if (v > worstV) { worstV = v; worst = gi; }
      }
      chosen.add(worst);
    }
    while (chosen.size < k) chosen.add(valid[(rng() * valid.length) | 0]);
    for (const gi of chosen) {
      const g = state.groups[gi];
      for (const p of g.parts) state.loc.set(p.id, KALAN);
      g.parts = []; g.comp = EMPTY; g.nPref = null;
    }
    fillFree(state, 500 + ((rng() * 1500) | 0), true);
    const ev = state.evaluate();
    const delta = ev.cost - state.cost;
    if (delta <= 0 || rng() < Math.exp(-delta / T)) { state.cost = ev.cost; state.eval = ev; return true; }
    for (const g of state.groups) g.parts = [];
    for (const p of state.parts) {
      const gi = snap.loc.get(p.id); state.loc.set(p.id, gi);
      if (gi !== KALAN) state.groups[gi].parts.push(p);
    }
    for (let i = 0; i < state.groups.length; i++) { state.groups[i].nPref = snap.nPref[i] || null; state.groups[i].comp = i < snap.comps.length ? snap.comps[i] : EMPTY; }
    return false;
  }

  // ---------------------------------------------------------------- tavlama benzetimi

  function removePart(state, p) {
    const gi = state.loc.get(p.id);
    if (gi === KALAN) return KALAN;
    const g = state.groups[gi];
    const ix = g.parts.indexOf(p);
    g.parts.splice(ix, 1);
    return gi;
  }
  function placePart(state, p, gi) {
    state.loc.set(p.id, gi);
    if (gi !== KALAN) state.groups[gi].parts.push(p);
  }

  // Bir parçanın bir gruba "sığma ihtimali" (hızlı ön eleme): ya boy kapasitesi var
  // ya da aynı ölçü zaten grupta (birleştirme adım eklemeyebilir).
  function plausible(state, g, p) {
    const P = state.P;
    if (g.parts.length === 0) return true;
    const c = g.comp;
    if (P.mergeSameLength) for (const q of g.parts) if (q.item.len === p.item.len) return true;
    const cap = P.L - P.safety, unit = p.item.len + P.kerf;
    const minPer = c.minPerBar != null ? c.minPerBar : c.perBar;
    if (minPer + unit > cap) return false;
    return adetCompatible(P, c, p.count, unit, cap);
  }

  // Adet uyumu ön elemesi: parçanın adedi (gerekirse k adıma bölünerek) grubun kesim
  // adetlerine maxSpread içinde yaklaşabiliyor mu? Grubun üç olası hali denenir:
  // şimdiki hali, adımları j'ye bölünmüş hali ve her ölçünün tek adım olduğu hali.
  function adetCompatible(P, c, count, unit, cap) {
    const S = P.maxSpread;
    if (S == null || S >= 9999 || !c.bars) return true;
    const maxK = P.multiStep ? 3 : 1;
    const fits = (hi, lo, base) => {
      for (let k = 1; k <= maxK; k++) {
        if (base + k * unit > cap) return false;
        const a = count / k;
        if (Math.max(hi, a) - Math.min(lo, a) <= S + 1) return true;
      }
      return false;
    };
    const nHi = c.bars, nLo = c.bars - (c.spread || 0);
    if (fits(nHi, nLo, c.perBar)) return true;
    if (P.multiStep) {
      if (c.perBar * 2 <= cap && fits(nHi / 2, nLo / 2, c.perBar * 2)) return true;
      if (c.perBar * 3 <= cap && fits(nHi / 3, nLo / 3, c.perBar * 3)) return true;
    }
    if (c.piecesMax > nHi && c.piecesMax - c.piecesMin <= S && fits(c.piecesMax, c.piecesMin, c.minPerBar)) return true;
    return false;
  }

  function pickTarget(state, p, from) {
    const rng = state.rng;
    const t = rng();
    if (t < 0.1) return KALAN;
    if (t < 0.17) return state.newGroupIndex();
    // sığabilecek gruplar arasından seç
    const cands = [];
    for (let i = 0; i < state.groups.length; i++) {
      if (i === from) continue;
      const g = state.groups[i];
      if (g.parts.length && plausible(state, g, p)) cands.push(i);
    }
    if (!cands.length) return rng() < 0.5 ? KALAN : state.newGroupIndex();
    return cands[(rng() * cands.length) | 0];
  }

  // Yık-ve-yeniden-kur (LNS): birkaç grubu dağıt, parçaları açgözlü yeniden yerleştir.
  function greedyInsert(state, p) {
    const P = state.P;
    let best = -1, bestDelta = Infinity, bestComp = null;
    for (let gi = 0; gi < state.groups.length; gi++) {
      const g = state.groups[gi];
      if (!g.parts.length || !plausible(state, g, p)) continue;
      const c = compileGroup(g.parts.concat(p), P, null);
      if (!c.feasible) continue;
      const delta = c.cost - g.comp.cost;
      if (delta < bestDelta) { bestDelta = delta; best = gi; bestComp = c; }
    }
    const alone = compileGroup([p], P, null);
    if (best >= 0 && bestDelta <= alone.cost) {
      state.groups[best].parts.push(p); state.groups[best].comp = bestComp; state.groups[best].nPref = null; state.loc.set(p.id, best);
    } else {
      const gi = state.newGroupIndex();
      state.groups[gi].parts.push(p); state.groups[gi].comp = alone; state.groups[gi].nPref = null; state.loc.set(p.id, gi);
    }
  }

  function lnsIteration(state, T) {
    const rng = state.rng;
    const nonEmpty = [];
    for (let i = 0; i < state.groups.length; i++) if (state.groups[i].parts.length) nonEmpty.push(i);
    if (nonEmpty.length < 2) return false;
    const snap = state.snapshot();
    snap.comps = state.groups.map(g => g.comp);
    // Seçilecek grup sayısı mevcut grup sayısını aşamaz (2 gruplu küçük projede k = 3 sonsuz döngüye girerdi)
    const k = Math.min(nonEmpty.length, 2 + ((rng() * 2) | 0));
    const chosen = new Set();
    if (rng() < 0.5) {
      // en pahalı (parça başına) grup
      let worst = -1, worstV = -1;
      for (const gi of nonEmpty) {
        const g = state.groups[gi];
        let pieces = 0; for (const p of g.parts) pieces += p.count;
        const v = g.comp.cost / pieces;
        if (v > worstV) { worstV = v; worst = gi; }
      }
      chosen.add(worst);
    }
    while (chosen.size < k) chosen.add(nonEmpty[(rng() * nonEmpty.length) | 0]);
    const released = [];
    for (const gi of chosen) {
      const g = state.groups[gi];
      for (const p of g.parts) released.push(p);
      g.parts = []; g.comp = EMPTY; g.nPref = null;
    }
    if (rng() < 0.5) for (const p of state.kalanParts()) if (rng() < 0.5) released.push(p);
    if (rng() < 0.5) released.sort((a, b) => b.item.len - a.item.len || b.count - a.count);
    else for (let i = released.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = released[i]; released[i] = released[j]; released[j] = t; }
    for (const p of released) greedyInsert(state, p);
    const ev = state.evaluate();
    const delta = ev.cost - state.cost;
    if (delta <= 0 || rng() < Math.exp(-delta / T)) { state.cost = ev.cost; state.eval = ev; return true; }
    // geri al
    for (const g of state.groups) g.parts = [];
    for (const p of state.parts) {
      const gi = snap.loc.get(p.id); state.loc.set(p.id, gi);
      if (gi !== KALAN) state.groups[gi].parts.push(p);
    }
    for (let i = 0; i < state.groups.length; i++) { state.groups[i].nPref = snap.nPref[i] || null; state.groups[i].comp = i < snap.comps.length ? snap.comps[i] : EMPTY; }
    return false;
  }

  // Yeniden paketleme hamlesi: en çok boşluk bırakan k gruptan (biri en boşu) parçaları toplar,
  // rastgeleleştirilmiş FFD ile k−1 (olmazsa k) gruba yeniden yerleştirmeyi dener.
  function repackAttempt(state, pieces, limit, jitter) {
    const P = state.P, rng = state.rng;
    const order = pieces.slice().sort((a, b) => (b.item.len + rng() * jitter) - (a.item.len + rng() * jitter) || b.count - a.count);
    const bins = []; // {parts, comp}
    for (const p of order) {
      let best = -1, bestKey = Infinity, bestComp = null;
      for (let i = 0; i < bins.length; i++) {
        const b = bins[i];
        if (!plausible(state, { parts: b.parts, comp: b.comp }, p)) continue;
        const c = compileGroup(b.parts.concat(p), P, null);
        if (!c.feasible) continue;
        const key = (c.cost - b.comp.cost) * 1000 + c.leftover; // önce maliyet artışı, sonra kalan boy
        if (key < bestKey) { bestKey = key; best = i; bestComp = c; }
      }
      if (best >= 0) { bins[best].parts.push(p); bins[best].comp = bestComp; }
      else {
        if (bins.length >= limit) return null;
        bins.push({ parts: [p], comp: compileGroup([p], P, null) });
      }
    }
    return bins;
  }

  function repackIteration(state, T) {
    const rng = state.rng;
    const nonEmpty = [];
    for (let i = 0; i < state.groups.length; i++) if (state.groups[i].parts.length) nonEmpty.push(i);
    if (nonEmpty.length < 3) return false;
    // boşluk (son çubuklardaki kalan × adet + kenara ayrılan artıklar) / çubuk
    const slack = gi => { const c = state.groups[gi].comp; let s = 0; for (const r of c.remnants) s += r.count * r.len; return s / c.bars; };
    nonEmpty.sort((a, b) => slack(b) - slack(a));
    const k = 3 + ((rng() * 3) | 0);
    const top = nonEmpty.slice(0, Math.min(nonEmpty.length, 8));
    const chosen = new Set([top[0]]);
    while (chosen.size < Math.min(k, top.length)) chosen.add(top[(rng() * top.length) | 0]);
    const gis = [...chosen];
    const pieces = [];
    for (const gi of gis) for (const p of state.groups[gi].parts) pieces.push(p);
    let curCost = 0; for (const gi of gis) curCost += state.groups[gi].comp.cost;
    let best = null, bestCost = Infinity;
    const tries = 6;
    for (let t = 0; t < tries; t++) {
      const limit = t < tries - 1 ? gis.length - 1 : gis.length;
      const bins = repackAttempt(state, pieces, limit, t === 0 ? 0 : 400);
      if (!bins) continue;
      let c = 0; for (const b of bins) c += b.comp.cost;
      if (c < bestCost) { bestCost = c; best = bins; }
      if (bins.length < gis.length) break;
    }
    if (!best || bestCost > curCost + 1e-9) return false;
    // uygula
    const snap = state.snapshot();
    snap.comps = state.groups.map(x => x.comp);
    for (const gi of gis) { const g = state.groups[gi]; g.parts = []; g.comp = EMPTY; g.nPref = null; }
    best.forEach((b, i) => {
      const gi = i < gis.length ? gis[i] : state.newGroupIndex();
      const g = state.groups[gi];
      g.parts = b.parts; g.comp = b.comp; g.nPref = null;
      for (const p of b.parts) state.loc.set(p.id, gi);
    });
    const ev = state.evaluate();
    const delta = ev.cost - state.cost;
    if (delta <= 0 || rng() < Math.exp(-delta / T)) { state.cost = ev.cost; state.eval = ev; return true; }
    for (const x of state.groups) x.parts = [];
    for (const p of state.parts) {
      const li = snap.loc.get(p.id); state.loc.set(p.id, li);
      if (li !== KALAN) state.groups[li].parts.push(p);
    }
    for (let i = 0; i < state.groups.length; i++) { state.groups[i].nPref = snap.nPref[i] || null; state.groups[i].comp = i < snap.comps.length ? snap.comps[i] : EMPTY; }
    return false;
  }

  function saIteration(state, T) {
    const rng = state.rng, P = state.P;
    const r = rng();
    const parts = state.parts;
    if (parts.length < 2) return false;
    const touched = [];
    const saved = [];
    const remember = gi => { if (gi !== KALAN && !touched.includes(gi)) { touched.push(gi); saved.push({ gi, comp: state.groups[gi].comp, nPref: state.groups[gi].nPref }); } };
    let undo;
    const useNPref = P.mergeSameLength || P.multiStep;
    const pNPref = useNPref ? 0.08 : 0, pSplit = P.allowSplit ? 0.07 : 0;
    const pMove = useNPref ? 0.5 : 0.54;
    const pSwap = 1 - pMove - pNPref - pSplit;
    if (r < pMove) {
      // taşı
      const p = parts[(rng() * parts.length) | 0];
      const from = state.loc.get(p.id);
      const to = pickTarget(state, p, from);
      if (to === from) return false;
      remember(from); remember(to);
      removePart(state, p); placePart(state, p, to);
      undo = () => { removePart(state, p); placePart(state, p, from); };
    } else if (r < pMove + pSwap) {
      // değiştir: p ile, başka gruptaki q (boy farkı küçük olanlar tercih)
      const p = parts[(rng() * parts.length) | 0];
      const a = state.loc.get(p.id);
      let q = null;
      const mode = rng();
      if (mode < 0.45) {
        // adedi yakın aday (grupların adet uyumunu bozmadan yer değiştirir)
        const tolC = P.maxSpread >= 9999 ? 3 : Math.max(1, P.maxSpread);
        const cands = [];
        for (const x of parts) if (x !== p && state.loc.get(x.id) !== a && Math.abs(x.count - p.count) <= tolC) cands.push(x);
        if (cands.length) q = cands[(rng() * cands.length) | 0];
      } else if (mode < 0.8) {
        // benzer ölçülü aday
        const tol = 50 + ((rng() * 400) | 0);
        const cands = [];
        for (const x of parts) if (x !== p && state.loc.get(x.id) !== a && Math.abs(x.item.len - p.item.len) <= tol) cands.push(x);
        if (cands.length) q = cands[(rng() * cands.length) | 0];
      }
      if (!q) q = parts[(rng() * parts.length) | 0];
      if (p === q) return false;
      const b = state.loc.get(q.id);
      if (a === b) return false;
      remember(a); remember(b);
      removePart(state, p); removePart(state, q);
      placePart(state, p, b); placePart(state, q, a);
      undo = () => { removePart(state, p); removePart(state, q); placePart(state, p, a); placePart(state, q, b); };
    } else if (r < pMove + pSwap + pNPref) {
      // demet boyu tercihi
      const nonEmpty = [];
      for (let i = 0; i < state.groups.length; i++) if (state.groups[i].parts.length) nonEmpty.push(i);
      if (!nonEmpty.length) return false;
      const gi = nonEmpty[(rng() * nonEmpty.length) | 0];
      const g = state.groups[gi];
      const cands = g.comp.cands || [];
      const pick = rng() < 0.3 || !cands.length ? null : cands[(rng() * cands.length) | 0];
      if (pick === g.nPref) return false;
      remember(gi);
      g.nPref = pick;
      undo = () => {};
    } else {
      // böl / birleştir (deneysel)
      if (!P.allowSplit) return false;
      if (rng() < 0.5) {
        const p = parts[(rng() * parts.length) | 0];
        if (p.count < 2 * P.minSplit) return false;
        const c1 = P.minSplit + ((rng() * (p.count - 2 * P.minSplit + 1)) | 0);
        const from = state.loc.get(p.id);
        const q = { id: state.nextPartId++, item: p.item, count: p.count - c1 };
        const to = pickTarget(state, q, from);
        if (to === from) { state.nextPartId--; return false; }
        remember(from); remember(to);
        p.count = c1; parts.push(q); placePart(state, q, to);
        undo = () => { removePart(state, q); parts.pop(); state.loc.delete(q.id); p.count += q.count; };
      } else {
        // aynı pozun iki parçasını birleştir
        const p = parts[(rng() * parts.length) | 0];
        const sib = parts.filter(x => x !== p && x.item === p.item);
        if (!sib.length) return false;
        const q = sib[(rng() * sib.length) | 0];
        const from = state.loc.get(q.id);
        const to = state.loc.get(p.id);
        remember(from); remember(to);
        removePart(state, q); const qi = parts.indexOf(q); parts.splice(qi, 1); const qc = q.count; p.count += qc;
        undo = () => { p.count -= qc; parts.splice(qi, 0, q); placePart(state, q, from); };
      }
    }
    for (const gi of touched) state.recompile(gi);
    const ev = state.evaluate();
    const delta = ev.cost - state.cost;
    if (delta <= 0 || rng() < Math.exp(-delta / T)) {
      state.cost = ev.cost; state.eval = ev;
      return true;
    }
    undo();
    for (const s of saved) { state.groups[s.gi].comp = s.comp; state.groups[s.gi].nPref = s.nPref; }
    return false;
  }

  // ---------------------------------------------------------------- sonuç üretimi

  /**
   * KALANLAR için gereken yeni çubuk tahmini. Parçalar tek tek, uzundan kısaya, ilk sığdığı çubuğa
   * yerleştirilir (en uzun boyda); sonra her çubuk, içeriğinin sığdığı ve stoğu olan en kısa boya
   * indirilir. Usta böyle kesmek zorunda değildir; sayı yol göstermek içindir.
   * rem: Map(boy → kalan stok) ya da null (sınırsız). Stokta karşılığı olmayan çubuklar "short".
   */
  function estimateKalanBars(deficit, P, rem) {
    const Ls = (P.lengths && P.lengths.length ? P.lengths : [P.L]).slice().sort((a, b) => a - b);
    const cap = P.L - P.safety;
    const pieces = [];
    for (const d of deficit) {
      const u = d.item.len + P.kerf;
      for (let k = 0; k < d.count; k++) pieces.push(u);
    }
    pieces.sort((a, b) => b - a);
    const bins = [];
    for (const u of pieces) {
      let placed = false;
      for (let i = 0; i < bins.length; i++) if (bins[i] + u <= cap) { bins[i] += u; placed = true; break; }
      if (!placed) bins.push(u);
    }
    bins.sort((a, b) => b - a);
    const byLen = {};
    let bars = 0, mm = 0, short = 0;
    for (const used of bins) {
      let L = 0;
      for (const x of Ls) {
        if (used > x - P.safety || (rem && rem.get(x) < 1)) continue;
        L = x; break;
      }
      if (!L) { L = P.L; short++; } else if (rem) rem.set(L, rem.get(L) - 1);
      byLen[L] = (byLen[L] || 0) + 1; bars++; mm += L;
    }
    return { byLen, bars, mm, short };
  }

  function buildResult(state, material) {
    const P = state.P, ms = listOnly(P);      // ms: KALANLAR yalnızca liste (kural ya da sınırlı stok)
    const ev = state.evaluate();
    const groups = [];
    const order = [];
    // Grubun kesileceği boy: sığdığı en kısa boy; stok sınırlıysa atanan boy (0 = boy alamadı)
    const lenOf = gi => ev.assign ? ev.assign.get(gi) : state.groups[gi].comp.barLen;
    // Toplamı sınırın altında kalan ya da stoktan boy alamayan gruplar yazılmaz (pozları KALANLAR'da: ev.kal)
    for (let gi = 0; gi < state.groups.length; gi++) if (state.groups[gi].parts.length && !state.isLow(state.groups[gi]) && lenOf(gi)) order.push(gi);
    // sıralama: çubuk boyu uzundan kısaya, demet büyükten küçüğe, sonra en uzun ölçü uzundan kısaya
    order.sort((a, b) => {
      const ca = state.groups[a].comp, cb = state.groups[b].comp;
      return lenOf(b) - lenOf(a) || cb.bars - ca.bars || cb.steps[0].len - ca.steps[0].len || a - b;
    });
    const gIndexOf = new Map();
    order.forEach((gi, i) => gIndexOf.set(gi, i + 1));
    // setAside: bu satır kesilirken kenarda bekleyen çubuk sayısı (demet − satırın adedi)
    const mapSteps = c => c.steps.map(st => ({
      len: st.len, n: st.n,
      alloc: st.alloc.map(a => ({ part: a.part, item: a.part.item, count: a.count })),
      setAside: c.bars - st.n,
    }));
    for (const gi of order) {
      const c = state.groups[gi].comp;
      const extra = lenOf(gi) - c.barLen;      // stok yüzünden daha uzun boydan kesiliyorsa
      groups.push({
        no: gIndexOf.get(gi), stateIndex: gi, bars: c.bars, barLen: c.barLen + extra, strokes: c.strokes, changes: c.changes, spread: c.spread || 0,
        perBar: c.perBar, sumLen: c.sumLen, leftover: c.leftover + extra, steps: mapSteps(c),
        remnants: c.remnants.map(r => Object.assign({}, r, { len: r.len + extra })).filter(r => r.count > 0 && r.len > 0),
      });
    }
    const kp = ev.kp;
    const kalanParts = ev.kal.slice().sort((a, b) => b.item.len - a.item.len || b.count - a.count || a.id - b.id);
    // KALANLAR yalnızca listeyken artıktan çıkmayanlar için grup yazılmaz; gereken yeni çubuk
    // estimateKalanBars ile tahmin edilir (stok sınırlıysa gruplardan artan stoğa göre).
    const estByLen = {};
    let estBars = 0, estMm = 0, estShort = 0;       // estShort: stokta karşılığı olmayan çubuk
    if (ms && kp.deficit.length) {
      const e = estimateKalanBars(kp.deficit, P, ev.remaining ? new Map(ev.remaining) : null);
      estBars = e.bars; estMm = e.mm; estShort = e.short;
      for (const k of Object.keys(e.byLen)) estByLen[k] = e.byLen[k];
    }
    const fbGroups = kp.fallback ? kp.fallback.groups.map((g, i) => ({
      no: groups.length + i + 1, bars: g.comp.bars, barLen: g.comp.barLen, strokes: g.comp.strokes, changes: g.comp.changes, spread: g.comp.spread || 0, perBar: g.comp.perBar,
      sumLen: g.comp.sumLen, leftover: g.comp.leftover, fallback: true,
      steps: mapSteps(g.comp),
      remnants: [],
    })) : [];
    const fbByLen = {};
    for (const g of fbGroups) fbByLen[g.barLen] = (fbByLen[g.barLen] || 0) + g.bars;
    const kalan = {
      parts: kalanParts.map(p => ({ part: p, item: p.item, count: p.count })),
      plan: kp.plan.map(e => ({
        groupNo: gIndexOf.get(e.bundle.group), step: e.bundle.step, count: e.bundle.count, len: e.bundle.len, derived: !!e.bundle.derived,
        steps: e.steps.map(st => ({ len: st.len, n: st.n, item: st.part.item, part: st.part })),
        leftoverCount: e.leftoverCount, leftoverLen: e.leftoverLen,
      })),
      strokes: kp.strokes, changes: kp.changes, usedMm: kp.usedMm,
      deficit: kp.deficit.map(d => ({ item: d.item, count: d.count, part: d.origin })),
      listOnly: ms,                       // true: KALANLAR yalnızca listedir, yeni çubuk grupları yazılmaz
      newBars: ms ? estBars : (kp.fallback ? kp.fallback.bars : 0),     // artıktan çıkmayanlar için (kural açıkken tahmini) yeni çubuk
      newBarsByLen: ms ? estByLen : fbByLen,                             // aynısı, stok boyuna göre
      shortBars: estShort,                                               // bunun stokta karşılığı olmayan kısmı (sınırlı stok)
      fallbackGroups: fbGroups,
    };
    let pieces = 0;
    for (const p of state.parts) pieces += p.count;
    let remnantMm = 0;
    for (const g of groups) for (const r of g.remnants) remnantMm += r.count * r.len;
    let groupPieceMm = 0, groupPieces = 0;
    for (const g of groups) for (const st of g.steps) { groupPieceMm += st.n * st.len; groupPieces += st.n; }
    let kalanPieces = 0, kalanMm = 0;
    for (const p of kalanParts) { kalanPieces += p.count; kalanMm += p.count * p.item.len; }
    const allG = groups.concat(fbGroups);
    // Yazılan grupların çubukları, stok boyuna göre ("şu boydan şu kadar kesilecek")
    const barsByLen = {};
    for (const g of allG) barsByLen[g.barLen] = (barsByLen[g.barLen] || 0) + g.bars;
    const groupMaterialMm = ev.groupMatMm;
    // Toplam: gruplar + KALANLAR için gereken yeni çubuk (minSum açıkken tahmini)
    const totalBars = ev.groupBars + kalan.newBars;
    const totalStrokes = ms ? ev.groupStrokes + kp.strokes + kp.deficit.length : ev.strokes;
    const materialMm = groupMaterialMm + (ms ? estMm : (kp.fallback ? kp.fallback.matMm : 0));
    let cutPart, barPart, chgPart, kalanPart;
    if (ms) {
      // KALANLAR'ın bütün maliyeti (poz cezası + artık kesimleri + tahmini çubuk payı) tek kalemde
      cutPart = P.wCut * ev.groupStrokes; barPart = P.wBar * ev.groupBarUnits; chgPart = P.wChange * ev.groupChanges; kalanPart = kp.cost;
    } else {
      cutPart = P.wCut * ev.strokes; barPart = P.wBar * ev.barUnits; chgPart = P.wChange * ev.changes; kalanPart = (P.wKalan || 0) * kalanParts.length;
    }
    const wastePart = (P.wWaste || 0) * (ev.matMm - state.totalPieceMm);
    let spreadSum = 0, spreadMax = 0, equalGroups = 0, equalPieces = 0;
    for (const g of allG) {
      spreadSum += g.spread; if (g.spread > spreadMax) spreadMax = g.spread;
      if (g.spread === 0) { equalGroups++; for (const st of g.steps) equalPieces += st.n; }
    }
    const spreadPart = (P.wSpread || 0) * spreadSum;
    const stats = {
      cost: ev.cost, bars: totalBars, strokes: totalStrokes, changes: ev.changes,
      spreadSum, spreadMax, equalGroups, equalPieces, spreadAvg: allG.length ? spreadSum / allG.length : 0,
      costParts: { cut: cutPart, bar: barPart, change: chgPart, spread: spreadPart, kalan: kalanPart, waste: wastePart, other: ev.cost - (cutPart + barPart + chgPart + spreadPart + kalanPart + wastePart) },
      groupBars: ev.groupBars, groupStrokes: ev.groupStrokes, groupChanges: ev.groupChanges,
      kalanStrokes: kp.strokes, kalanChanges: kp.changes, kalanCount: kalanParts.length,
      fallbackBars: kp.fallback ? kp.fallback.bars : 0,
      // stok boyları
      lengths: (P.lengths || [P.L]).slice(), barsByLen, kalanBarsByLen: kalan.newBarsByLen,
      stock: Object.assign({}, P.stock || {}), stockShort: estShort,
      // KALANLAR yalnızca liste olduğunda (kural ya da sınırlı stok): yazılan gruplar ile KALANLAR ayrı ayrı
      minSum: P.minSum || 0, listOnly: ms,
      groupPieces, groupPieceMm, groupMaterialMm,
      groupWastePct: groupMaterialMm ? (groupMaterialMm - groupPieceMm) / groupMaterialMm : 0,
      groupPozCount: groups.reduce((a, g) => a + g.steps.length, 0),
      kalanPieces, kalanMm, kalanNewBars: kalan.newBars,
      pieces, pieceMm: state.totalPieceMm, materialMm,
      wasteMm: materialMm - state.totalPieceMm,
      wastePct: materialMm ? (materialMm - state.totalPieceMm) / materialMm : 0,
      remnantMm, remnantUsedMm: kp.usedMm,
      lowerBoundBars: Math.ceil(state.totalPieceMm / P.L),
      groupCount: groups.length,
    };
    return { material, P, stats, groups, kalan };
  }

  // ---------------------------------------------------------------- doğrulayıcı

  function validate(result) {
    const P = result.P, errors = [];
    const ms = P.minSum > 0, lo = listOnly(P);
    const stock = P.stock || {};
    const Ls = P.lengths && P.lengths.length ? P.lengths : [P.L];
    const produced = new Map(); // part.id → adet (gruplarda + artık planında)
    const inGroup = new Map();  // part.id → gruplarda kesilen adet
    let fromGroup = true;
    const add = (part, c) => {
      produced.set(part.id, (produced.get(part.id) || 0) + c);
      if (fromGroup) inGroup.set(part.id, (inGroup.get(part.id) || 0) + c);
    };
    const allGroups = result.groups.concat(result.kalan.fallbackGroups || []);
    const pool = new Map(); // "gNo:artık" → {count,len}
    for (const g of allGroups) {
      const L = g.barLen;
      if (Ls.indexOf(L) < 0) errors.push(`Grup ${g.no}: çubuk boyu ${L} tanımlı boylardan değil (${Ls.join(', ')})`);
      if (g.bars > P.maxBundle) errors.push(`Grup ${g.no}: demet ${g.bars} > ${P.maxBundle}`);
      let maxN = 0, minN = Infinity, used = 0, sum = 0;
      g.steps.forEach((st, i) => {
        if (st.n > maxN) maxN = st.n;
        if (st.n < minN) minN = st.n;
        used += st.len + P.kerf; sum += st.len;
        if (i > 0 && st.len > g.steps[i - 1].len) errors.push(`Grup ${g.no} satır ${i + 1}: ölçüler büyükten küçüğe sıralı değil (${g.steps[i - 1].len} → ${st.len})`);
        if (st.setAside !== g.bars - st.n) errors.push(`Grup ${g.no} satır ${i + 1}: kenarda bekleyen ${st.setAside} ≠ ${g.bars} − ${st.n}`);
        let c = 0;
        for (const a of st.alloc) { add(a.part, a.count); c += a.count; }
        if (c !== st.n) errors.push(`Grup ${g.no} satır ${i + 1}: dağıtım ${c} ≠ adet ${st.n}`);
      });
      if (!g.steps.length) continue;
      if (maxN !== g.bars) errors.push(`Grup ${g.no}: çubuk sayısı ${g.bars} ≠ en büyük adet ${maxN}`);
      if (sum !== g.sumLen) errors.push(`Grup ${g.no}: toplam ${g.sumLen} ≠ ${sum}`);
      if (P.maxSpread != null && maxN - minN > P.maxSpread) errors.push(`Grup ${g.no}: adet farkı ${maxN - minN} > ${P.maxSpread}`);
      // Demetin bütün satırlarda kesilen çubukları en çok yeri kullanır: çubuğa sığmalı
      if (used > L - P.safety) errors.push(`Grup ${g.no}: çubuk boyu aşıldı (${used} > ${L - P.safety})`);
      // Daha kısa bir stok boyuna sığıyorsa oradan kesilmeliydi (stoğu sınırlı boy dolmuş olabilir: o sayılmaz)
      for (const x of Ls) if (x < L && used <= x - P.safety && stock[x] == null) errors.push(`Grup ${g.no}: ${x}'lik çubuğa sığarken ${L}'lik yazılmış`);
      if (ms && !g.fallback && g.sumLen < L - (P.L - P.minSum)) errors.push(`Grup ${g.no}: toplam ${g.sumLen} < en az grup toplamı ${L - (P.L - P.minSum)} (${L}'lik çubuk)`);
      if (g.fallback) continue;
      // artık havuzu: adet düzeylerine göre (derleyiciyle aynı kural)
      const levels = [];
      for (const st of g.steps) if (levels.indexOf(st.n) < 0) levels.push(st.n);
      levels.sort((a, b) => b - a);
      for (let j = 0; j < levels.length - 1; j++) {
        let u = 0;
        for (const st of g.steps) if (st.n >= levels[j]) u += st.len + P.kerf;
        pool.set(`${g.no}:${j + 1}`, { count: levels[j] - levels[j + 1], len: L - u });
      }
      pool.set(`${g.no}:${g.steps.length}`, { count: minN, len: L - used });
    }
    fromGroup = false;
    for (const e of result.kalan.plan) {
      const key = `${e.groupNo}:${e.step}`;
      const b = pool.get(key);
      if (!b) { errors.push(`Artık planı: kaynak bulunamadı (Grup ${e.groupNo} artık ${e.step})`); continue; }
      if (!e.derived && e.len !== b.len) errors.push(`Artık planı Grup ${e.groupNo}: artık boyu ${e.len} ≠ ${b.len}`);
      let active = e.count, used = 0;
      for (const st of e.steps) {
        if (st.n > active) errors.push(`Artık planı Grup ${e.groupNo}: demet büyüyor`);
        active = st.n; used += st.len + P.kerf;
        if (used > e.len - P.safety) errors.push(`Artık planı Grup ${e.groupNo} artık ${e.step}: artık boyu aşıldı (${used} > ${e.len - P.safety})`);
        add(st.part, st.n);
      }
    }
    // artık adet kontrolü: aynı kaynaktan kesilen toplam ilk-adım adedi (türetilmemiş) ≤ kaynak adedi
    const useByKey = new Map();
    for (const e of result.kalan.plan) {
      if (e.derived) continue; // türetilmiş demetler zaten ana demetten ayrılmış çubuklardır
      const key = `${e.groupNo}:${e.step}`;
      useByKey.set(key, (useByKey.get(key) || 0) + e.count);
    }
    for (const [key, used] of useByKey) {
      const b = pool.get(key);
      if (b && used > b.count) errors.push(`Artık planı ${key}: ${used} çubuk kullanılmış, kaynakta ${b.count} var`);
    }
    // Boy bazında çubuk sayımı gruplarla tutmalı
    const byLen = {};
    for (const g of allGroups) byLen[g.barLen] = (byLen[g.barLen] || 0) + g.bars;
    const sb = (result.stats && result.stats.barsByLen) || {};
    for (const k of Object.keys(byLen).concat(Object.keys(sb))) if ((byLen[k] || 0) !== (sb[k] || 0)) { errors.push(`Boy sayımı tutmuyor: ${k}'lik ${sb[k] || 0} yazıyor, gruplarda ${byLen[k] || 0}`); break; }
    // Stok adedi aşılmamalı
    for (const k of Object.keys(stock)) if ((byLen[k] || 0) > stock[k]) errors.push(`Stok aşıldı: ${k}'lik çubuktan ${byLen[k]} kullanılmış, stokta ${stock[k]} var`);
    // Her poz ya tam adediyle bir grupta kesilir ya da KALANLAR'da listelenir (ikisi birden olmaz).
    const listed = new Map();
    for (const k of result.kalan.parts) listed.set(k.part.id, (listed.get(k.part.id) || 0) + k.count);
    const lacking = new Map();
    for (const d of result.kalan.deficit || []) if (d.part) lacking.set(d.part.id, (lacking.get(d.part.id) || 0) + d.count);
    for (const p of result.parts || []) {
      const got = produced.get(p.id) || 0;
      if (lo && listed.has(p.id)) {
        // Kural ya da sınırlı stok: KALANLAR yalnızca listedir. Poz hiçbir grupta olmamalı; artıktan kesilen
        // adet + artıktan çıkmayan adet, poz adedine eşit olmalı.
        if (listed.get(p.id) !== p.count) errors.push(`Poz ${p.item.poz} (${p.item.order}): KALANLAR'da ${listed.get(p.id)} yazıyor, adet ${p.count}`);
        if (inGroup.get(p.id)) errors.push(`Poz ${p.item.poz} (${p.item.order}): hem grupta hem KALANLAR'da`);
        if (got + (lacking.get(p.id) || 0) !== p.count) errors.push(`Poz ${p.item.poz} (${p.item.order}): artık planı ${got} + artıktan çıkmayan ${lacking.get(p.id) || 0} ≠ adet ${p.count}`);
        continue;
      }
      if (got !== p.count) errors.push(`Poz ${p.item.poz} (${p.item.order}): ${p.count} gerekli, ${got} kesildi`);
    }
    return { ok: errors.length === 0, errors };
  }

  // ---------------------------------------------------------------- sürücü

  // Olay döngüsüne kısa bir süre bırakır (worker'da mesaj işlenebilsin diye)
  function yieldNow() {
    if (typeof MessageChannel !== 'undefined') {
      return new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); r(); }; ch.port2.postMessage(null); });
    }
    return new Promise(r => setTimeout(r, 0));
  }

  // Her poz bir "parça"dır (bir satır, bir kesim). Adedi demet sınırını aşan poz tek seferde
  // kesilemeyeceği için dengeli parçalara ön bölünür (60 adet, demet 50 → 30 + 30); bu parçalar
  // ayrı satırlar olarak farklı gruplara da girebilir.
  function makeParts(items, P) {
    const maxB = P && P.maxBundle ? P.maxBundle : Infinity;
    const parts = [];
    for (const it of items) {
      const k = Math.max(1, Math.ceil(it.count / maxB));
      const base = Math.floor(it.count / k), extra = it.count % k;
      for (let j = 0; j < k; j++) parts.push({ id: parts.length + 1, item: it, count: base + (j < extra ? 1 : 0) });
    }
    return parts;
  }

  /**
   * items: [{order, customer, poz, len, count, ...}]
   * opts: { iters, timeMs, onProgress(info), chunk }
   */
  async function optimize(items, params, opts) {
    const P = Object.assign({}, DEFAULTS, params || {});
    opts = opts || {};
    // Stok boyları: benzersiz, büyükten küçüğe; P.L en uzun boydur
    let Ls = Array.isArray(P.lengths) && P.lengths.length ? P.lengths : [P.L];
    Ls = Ls.map(Number).filter(x => isFinite(x) && x > 0);
    Ls = Ls.filter((x, i) => Ls.indexOf(x) === i).sort((a, b) => b - a);
    if (!Ls.length) Ls = [DEFAULTS.L];
    P.lengths = Ls; P.L = Ls[0];
    // Stok adedi: yalnızca tanımlı boylar için, boş / geçersiz değer sınırsız demektir
    const stock = {};
    if (P.stock) for (const L of Ls) {
      const raw = P.stock[L];
      if (raw == null || raw === '') continue;
      const v = Math.floor(Number(raw));
      if (isFinite(v) && v >= 0) stock[L] = v;
    }
    P.stock = stock; P.limited = Object.keys(stock).length > 0;
    const rng = mulberry32(P.seed >>> 0);
    // Çubuğa sığmayan (ölçü + testere payı > boy − emniyet) pozlar plana alınamaz; ayrı listelenir.
    const allItems = items, capLen = P.L - P.safety;
    const oversize = allItems.filter(it => it.len + P.kerf > capLen);
    items = oversize.length ? allItems.filter(it => it.len + P.kerf <= capLen) : allItems;
    const parts = makeParts(items, P);
    const ms = P.minSum > 0;     // pencere araması (fill) yalnızca en az grup toplamı kuralında kullanılır
    const state = new State(parts, P, rng);
    state.nextPartId = parts.length + 1;
    constructInitial(state);
    const init = state.snapshot();
    let best = state.snapshot();
    const T0 = P.T0 || 5, T1 = P.T1 || 0.3;
    const iters = opts.iters || 0, timeMs = opts.timeMs || 0;
    const chunk = opts.chunk || 2000;
    const start = Date.now();
    let it = 0, accepted = 0;
    if (parts.length >= 2 && (iters > 0 || timeMs > 0)) {
      for (;;) {
        const fracI = iters ? it / iters : 0;
        const fracT = timeMs ? (Date.now() - start) / timeMs : 0;
        const frac = Math.max(fracI, fracT);
        if (frac >= 1) break;
        const T = T0 * Math.pow(T1 / T0, frac);
        for (let k = 0; k < chunk; k++) {
          const mv = rng();
          // minSum açıkken yık-yeniden-kur hamlesi, serbest pozlardan geçerli grup kuran fillIteration'dır
          const pL = ms ? (P.pFill || 0) : (P.pLNS || 0);
          const kind = mv < (P.pElim || 0) ? 'elim' : mv < (P.pElim || 0) + pL ? (ms ? 'fill' : 'lns') : 'sa';
          const acc = kind === 'elim' ? repackIteration(state, T) : kind === 'fill' ? fillIteration(state, T) : kind === 'lns' ? lnsIteration(state, T) : saIteration(state, T);
          if (acc) accepted++;
          if (P.debug) state.checkConsistency(kind + (acc ? '+' : '-') + ' it' + it);
          it++;
          if (state.cost < best.cost - 1e-9) best = state.snapshot();
        }
        if (opts.onProgress) opts.onProgress({ iter: it, frac, T, cost: state.cost, best: best.cost, accepted, eval: state.eval });
        if (opts.abort && opts.abort()) break;
        if (opts.yield !== false) await yieldNow();
        if (opts.abort && opts.abort()) break;
      }
    }
    state.restore(best);
    if (ms) {
      // son rötuş: serbest kalan pozlardan hâlâ kurulabilecek geçerli grup varsa (daha geniş aramayla) kur
      for (let pass = 0; pass < 4; pass++) {
        const made = fillFree(state, 30000, false);
        state.eval = state.evaluate(); state.cost = state.eval.cost;
        if (!made) break;
      }
    }
    const result = buildResult(state, opts.material || null);
    result.parts = state.parts;
    result.items = items;
    result.oversize = oversize;
    result.initialCost = init.cost;
    result.iterations = it;
    result.validation = validate(result);
    return result;
  }

  return { DEFAULTS, compileGroup, planKalan, optimize, validate, makeParts, mulberry32, State, constructInitial, buildResult, bestFill, fillFree, kalanCost, pickBar, assignStock, estimateKalanBars, KALAN };
});

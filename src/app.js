/* Panjur Kesim Optimizasyonu — arayüz */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const app = { files: [], mats: [], results: [], running: false, abort: false, workerSrc: null };

  // ---------------------------------------------------------------- yardımcılar
  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), ms || 2500);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmt(n) { return Number(n).toLocaleString('tr-TR'); }
  function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* yok say */ } }

  // ---------------------------------------------------------------- parametreler
  const PARAM_IDS = ['pL', 'pKerf', 'pSafety', 'pSpread', 'wSpread', 'wCut', 'wBar', 'wChange', 'wKalan', 'pTime'];
  const WEIGHT_IDS = ['pSpread', 'wSpread', 'wCut', 'wBar', 'wChange', 'wKalan'];
  const CHECK_IDS = ['oMulti', 'oSplit'];
  // 2: adet yakınlığı önceliği · 3: her satır tek poz (birleştirme kaldırıldı, poz bölme varsayılan kapalı)
  // · 4: tek çubuk boyu yerine boy listesi (6500, 5000, 4700).
  // Eski sürümde kaydedilmiş, anlamı değişen ayarlar yeni varsayılanlara döner.
  const PARAMS_VERSION = 4;
  function loadParams() {
    const saved = lsGet('panjur.params', null);
    if (!saved) return;
    const sv = Number(saved.v) || 0;
    for (const id of PARAM_IDS) {
      if (sv < 3 && WEIGHT_IDS.includes(id)) continue;
      if (sv < 4 && id === 'pL') continue;
      if (saved[id] != null && $(id)) $(id).value = saved[id];
    }
    if (sv >= 3) for (const id of CHECK_IDS) if (saved[id] != null && $(id)) $(id).checked = !!saved[id];
  }

  // ---------------------------------------------------------------- çubuk boyları
  // "6500, 5000, 4700" gibi bir metinden stok boyları (büyükten küçüğe, yinelenmeden)
  const DEFAULT_LENGTHS = [6500, 5000, 4700];
  function parseLengths(text) {
    const out = [];
    for (const t of String(text == null ? '' : text).split(/[\s,;\/|+]+/)) {
      const v = Math.round(Number(t.replace(/\./g, '')));
      if (isFinite(v) && v >= 100 && !out.includes(v)) out.push(v);
    }
    return out.sort((a, b) => b - a);
  }
  function defaultLengths() {
    const l = parseLengths($('pL').value);
    return l.length ? l : DEFAULT_LENGTHS.slice();
  }
  const byLenText = o => Object.keys(o || {}).map(Number).sort((a, b) => b - a).map(L => `${fmt(L)} × ${fmt(o[L])}`).join(' · ');
  function saveParams() {
    const o = { v: PARAMS_VERSION };
    for (const id of PARAM_IDS) o[id] = $(id).value;
    for (const id of CHECK_IDS) o[id] = $(id).checked;
    lsSet('panjur.params', o);
  }
  // Grup içi en çok adet farkı: boş → sınırsız (9999)
  function spreadLimit(raw) {
    const t = String(raw == null ? '' : raw).trim();
    if (t === '') return 9999;
    const n = Math.round(Number(t));
    return isFinite(n) && n >= 0 ? n : 9999;
  }
  function readParams() {
    const num = id => Number($(id).value);
    return {
      lengths: defaultLengths(), L: defaultLengths()[0], kerf: num('pKerf'), safety: num('pSafety'),
      wCut: num('wCut'), wBar: num('wBar'), wChange: num('wChange'), wKalan: num('wKalan'),
      wSpread: num('wSpread'), maxSpread: spreadLimit($('pSpread').value),
      mergeSameLength: false,   // iptal: her satır tek poz
      multiStep: $('oMulti').checked, allowSplit: $('oSplit').checked,
      timeMs: Math.max(1, num('pTime')) * 1000,
    };
  }

  // ---------------------------------------------------------------- ağırlıklar
  // pSpread: grup içi en çok adet farkı ('' = sınırsız); diğerleri ağırlık
  const PRESETS = [
    { id: 'denge', name: 'Dengeli', w: { pSpread: 4, wSpread: 2, wCut: 10, wBar: 4, wChange: 1, wKalan: 12 }, desc: 'varsayılan: adet farkı en çok 4, eşitlik tercih edilir' },
    { id: 'esit', name: 'Adetler tam eşit', w: { pSpread: 0, wSpread: 2, wCut: 10, wBar: 4, wChange: 1, wKalan: 12 }, desc: 'yalnızca eşit adetli pozlar aynı grupta' },
    { id: 'malzeme', name: 'Malzeme öncelikli', w: { pSpread: 4, wSpread: 0, wCut: 10, wBar: 4, wChange: 0, wKalan: 12 }, desc: '4 farka kadar serbest: çubuğu doldurmak için tolerans sonuna kadar kullanılır' },
    { id: 'serbest', name: 'Adet serbest', w: { pSpread: '', wSpread: 0, wCut: 10, wBar: 4, wChange: 1, wKalan: 3 }, desc: 'eski düzen: adet sınırı yok' },
  ];
  const W_KEYS = ['wSpread', 'wCut', 'wBar', 'wChange', 'wKalan'];
  function currentWeights() {
    const w = { pSpread: $('pSpread').value };
    for (const k of W_KEYS) w[k] = Number($(k).value);
    return w;
  }
  function sameWeights(a, b) { return spreadLimit(a.pSpread) === spreadLimit(b.pSpread) && W_KEYS.every(k => Number(a[k]) === Number(b[k])); }
  // Ayar nesnesinden motor parametreleri
  function weightParams(w) {
    const o = { maxSpread: spreadLimit(w.pSpread) };
    for (const k of W_KEYS) o[k] = Number(w[k]);
    return o;
  }
  function weightLabel(w) {
    const s = spreadLimit(w.pSpread);
    return `${s >= 9999 ? 'fark ∞' : s === 0 ? 'fark 0' : 'fark ≤ ' + s} · ağırlık ${w.wSpread}`;
  }
  function applyPreset(p) {
    for (const [k, v] of Object.entries(p.w)) $(k).value = v;
    saveParams(); renderWeights();
  }
  function renderWeights() {
    const w = currentWeights();
    const box = $('presets');
    if (!box.dataset.ready) {
      box.innerHTML = PRESETS.map((p, i) => `<button data-p="${i}" title="${esc(p.desc)}">${esc(p.name)} <span class="hint">${esc(weightLabel(p.w))}</span></button>`).join('');
      box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => applyPreset(PRESETS[Number(b.dataset.p)])));
      box.dataset.ready = '1';
    }
    box.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', sameWeights(PRESETS[i].w, w)));
    const num = n => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
    const li = [];
    const S = spreadLimit(w.pSpread);
    if (S >= 9999) li.push('Adet sınırı <b>yok</b>: adetleri çok farklı pozlar da aynı gruba girebilir (çok çubuk kenara ayrılır).');
    else if (S === 0) li.push('Bir grupta yalnızca <b>eşit adetli</b> kesimler bulunur; adedi tutmayan pozlar başka gruba ya da KALANLAR\'a gider.');
    else li.push(`Bir grupta adetler en çok <b>${S}</b> farklı olabilir (ör. ${43}–${43 - S}); ideal olan hepsinin eşit olmasıdır.`);
    if (S > 0 && S < 9999 && w.wSpread > 0 && w.wBar > 0) li.push(`Sınırın içinde her 1 adet fark <b>${num(w.wSpread)} puan</b>: ${S} farklı bir grubu eşitlemek için en fazla <b>${num(w.wSpread * S / w.wBar)} çubuk</b> fazladan harcanır.`);
    const splitOn = $('oMulti').checked || $('oSplit').checked;
    if (!splitOn) li.push('Her poz tam adediyle <b>tek satır, tek kesim</b>: gruplardaki kesim sayısı poz sayısına eşittir, ağırlıklar bunu değiştirmez.');
    else if (w.wBar > 0 && w.wCut > 0) {
      li.push(w.wCut >= w.wBar
        ? `Poz bölme açık: 1 ek kesimden kaçınmak için en fazla <b>${num(w.wCut / w.wBar)} çubuk</b> fazladan harcanır.`
        : `Poz bölme açık: 1 çubuk kazanmak için en fazla <b>${num(w.wBar / w.wCut)} kesim</b> fazladan yapılır.`);
    }
    if (w.wChange > 0 && w.wBar > 0) li.push(`1 çubuk kazanmak için <b>${num(w.wBar / w.wChange)} kez demet bozma</b> göze alınır.`);
    if (w.wCut > 0) li.push(`Bir pozu KALANLAR'a atmanın bedeli ≈ <b>${num(w.wKalan / w.wCut)} kesim</b> (üstüne artıktan kesim maliyeti de eklenir).`);
    const Ls = defaultLengths();
    if (w.wBar > 0) li.push(`En uzun çubuk (<b>${fmt(Ls[0])} mm</b>) ${num(w.wBar)} puan${Ls.length > 1 ? ', kısa boylar boyuyla orantılı (' + Ls.slice(1).map(x => fmt(x) + ' → ' + num(w.wBar * x / Ls[0])).join(', ') + ')' : ''}; eşit maliyetli çözümlerde fire az olan seçilir.`);
    let flag = '';
    if (S > 0 && S < 9999 && w.wSpread * S >= 3 * w.wBar && w.wBar > 0) flag += `<div class="warn2">⚠ Adet farkı çok pahalı: ${S} farklı bir grup yerine ${num(w.wSpread * S / w.wBar)} çubuk fazla harcanır; sınır fiilen kullanılmaz.</div>`;
    // Sınırdaki bir farkı gruba almak, pozu KALANLAR'a atmaktan pahalıysa araç KALANLAR'a kaçar
    if (S > 0 && S < 9999 && w.wKalan <= w.wSpread * S + w.wChange) {
      flag += `<div class="warn2">⚠ KALANLAR (${num(w.wKalan)}) çok ucuz: ${S} adet farklı bir pozu gruba almak (${num(w.wSpread * S + w.wChange)} puan) yerine KALANLAR'a atmak tercih edilir. KALANLAR'ı ${num(w.wSpread * S + w.wChange + 3)} ve üstü yapın.</div>`;
    }
    $('balance').innerHTML = `<b>Şu anki denge</b><ul>${li.map(x => '<li>' + x + '</li>').join('')}</ul>${flag}`;
  }

  // ---------------------------------------------------------------- dosyalar
  function orderMemory() { return lsGet('panjur.orders', {}); }
  function rememberOrder(f) {
    const m = orderMemory();
    m[f.orderNo] = { customer: f.customer, date: f.date, note: f.note };
    lsSet('panjur.orders', m);
  }

  async function addFiles(fileList) {
    for (const file of fileList) {
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const parsed = PanjurParse.parseBuffer(buf, file.name);
        const dup = app.files.find(x => x.parsed.orderNo && x.parsed.orderNo === parsed.orderNo && x.parsed.rowCount === parsed.rowCount);
        if (dup) { toast(`${file.name} atlandı: ${parsed.orderNo} nolu proje zaten yüklü (${dup.name})`, 5000); continue; }
        const mem = orderMemory()[parsed.orderNo] || {};
        app.files.push({ name: file.name, orderNo: parsed.orderNo || '', customer: mem.customer || '', date: mem.date || '', note: mem.note || '', parsed });
        toast(`${file.name} yüklendi (sipariş ${parsed.orderNo || '?'})`);
      } catch (e) {
        console.error(e);
        toast(`${file.name} okunamadı: ${e.message}`, 5000);
      }
    }
    renderFiles();
  }

  function renderFiles() {
    const box = $('files');
    box.innerHTML = '';
    app.files.forEach((f, i) => {
      const mats = f.parsed.materials.map(m => `${esc(m.label || m.typeLabel)} ${m.pozCount} poz${m.color ? ' <span class="badge">' + esc(m.color) + '</span>' : ''}`).join(' · ');
      const skip = f.parsed.skipped && f.parsed.skipped.length
        ? `<div class="secs"><span class="hint">Ölçüsüz (optimize edilmeyen): ${f.parsed.skipped.map(x => esc(x.desc) + ' ×' + x.count).join(' · ')}</span></div>` : '';
      const warn = f.parsed.warnings.length ? `<div class="warn">⚠ ${f.parsed.warnings.length} uyarı — <a href="#" data-toggle="w${i}">göster</a><ul id="w${i}" hidden>${f.parsed.warnings.map(w => '<li>' + esc(w.message) + '</li>').join('')}</ul></div>` : '';
      const div = document.createElement('div');
      div.className = 'file';
      div.innerHTML = `
        <div class="title">${esc(f.name)} <span class="badge">${esc(f.parsed.layout)}</span>${f.parsed.sheetName ? ' <span class="badge">' + esc(f.parsed.sheetName) + '</span>' : ''}</div>
        <div><button class="small ghost" data-rm="${i}">Kaldır</button></div>
        <div class="meta">
          <label>Sipariş no <input type="text" data-k="orderNo" data-i="${i}" value="${esc(f.orderNo)}" style="width:90px"></label>
          <label>Müşteri <input type="text" data-k="customer" data-i="${i}" value="${esc(f.customer)}" placeholder="örn. ÖRNEK PEN" style="width:160px"></label>
          <label>Tarih <input type="date" data-k="date" data-i="${i}" value="${esc(f.date)}"></label>
          <label>Not <input type="text" data-k="note" data-i="${i}" value="${esc(f.note)}" placeholder="örn. teslim notu" style="width:120px"></label>
        </div>
        <div class="secs">${mats || '<span class="err">Ölçülü parça bulunamadı</span>'}</div>
        <div class="secs"><span class="hint">Sütunlar: ${esc((f.parsed.columns || []).join(' · '))}${f.parsed.hasRef ? ' — müşteri pozu dolu' : ''}</span></div>
        ${skip}
        ${warn}`;
      box.appendChild(div);
    });
    box.querySelectorAll('input[data-k]').forEach(inp => inp.addEventListener('input', e => {
      const f = app.files[Number(e.target.dataset.i)];
      f[e.target.dataset.k] = e.target.value.trim();
      rememberOrder(f);
      app.mats = collectMaterials();   // müşteri / proje no / tarih satırlara ve Excel başlığına yansısın
    }));
    box.querySelectorAll('button[data-rm]').forEach(b => b.addEventListener('click', e => { app.files.splice(Number(e.target.dataset.rm), 1); renderFiles(); }));
    box.querySelectorAll('a[data-toggle]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); const ul = $(e.target.dataset.toggle); ul.hidden = !ul.hidden; }));
    const pl = $('projLine');
    if (app.files.length > 1) {
      const pozTotal = app.files.reduce((a, f) => a + (f.parsed.pozCount || 0), 0);
      pl.hidden = false;
      pl.innerHTML = `<b>${app.files.length} proje birlikte optimize edilecek</b> (${app.files.map(f => esc(f.orderNo || f.name)).join(' + ')} · toplam ${pozTotal} poz). Aynı profil ve renkteki parçalar tek havuzda birleşir; gruplar projeler arasında karışabilir, her satırda proje no yazar.`;
    } else { pl.hidden = true; pl.innerHTML = ''; }
    renderMaterials();
  }

  // ---------------------------------------------------------------- malzeme ayarları
  function matCfgAll() { return lsGet('panjur.mats', {}); }
  function matCfgSave(key, cfg) { const all = matCfgAll(); all[key] = cfg; lsSet('panjur.mats', all); }
  // En az grup toplamı: lamelde çubuk boyunun 250 mm altı (6500 → 6250); diğer parçalarda kural yok (0).
  const MIN_SUM_SLACK = 250;
  function defaultMinSum(m, L) { return m.type === 'lamel' ? Math.max(0, L - MIN_SUM_SLACK) : 0; }
  // lengths: bu parçanın stok boyları (büyükten küçüğe); L en uzunu. En az grup toplamı en uzun boy içindir.
  // Bütün pozları çubuktan uzun olan parça (ör. toplam boy yazılmış kutu kapağı) varsayılan olarak kapalı gelir.
  function defaultCfg(m, defLs) {
    const cap = defLs[0] - (Number($('pSafety').value) || 0), kerf = Number($('pKerf').value) || 0;
    const fits = m.items.some(it => it.len + kerf <= cap);
    return { on: !!m.defaultOn && fits, lengths: defLs.slice(), L: defLs[0], bundle: m.defaultBundle || 1, minSum: defaultMinSum(m, defLs[0]) };
  }
  // Kısa boylarda geçerli sınırlar: "5.000 → 4.750 · 4.700 → 4.450"
  function minSumHint(cfg) {
    if (!(cfg.minSum > 0) || cfg.lengths.length < 2) return '';
    const slack = cfg.L - cfg.minSum;
    return cfg.lengths.slice(1).map(x => `${fmt(x)} → ${fmt(x - slack)}`).join(' · ');
  }

  function renderMaterials() {
    const box = $('matList');
    app.mats = collectMaterials();
    if (!app.mats.length) {
      box.innerHTML = app.files.length
        ? '<span class="err">Bu dosyalarda ölçülü parça bulunamadı.</span>'
        : '<span class="hint">Dosya yükleyince bulunan parçalar burada listelenir.</span>';
    } else {
      const rows = app.mats.map((m, i) => `<tr class="${m.cfg.on ? '' : 'off'}">
        <td><input type="checkbox" data-mi="${i}" data-mk="on"${m.cfg.on ? ' checked' : ''}></td>
        <td class="name"><b>${esc(m.desc)}</b>${m.known ? '' : ' <span class="badge">tanınmadı</span>'}${m.orders.length > 1 ? ' <span class="badge">' + m.orders.length + ' proje birlikte</span>' : ''}${longCount(m) ? ' <span class="badge" style="background:#fee2e2;color:#b91c1c">' + longCount(m) + ' poz çubuktan uzun</span>' : ''}<br><span class="code">${esc(m.stokCodes.join(', '))}</span></td>
        <td>${m.color ? '<span class="badge">' + esc(m.color) + '</span>' : ''}</td>
        <td>${m.pozCount}</td>
        <td>${fmt(m.pieces)}</td>
        <td>${(m.totalMm / 1000).toFixed(1)} m</td>
        <td><input type="text" class="lens" data-mi="${i}" data-mk="lengths" value="${m.cfg.lengths.join(', ')}" title="Bu parçanın stok boyları (mm), virgülle. Her grup sığdığı en kısa boydan kesilir."></td>
        <td><input type="number" step="1" min="1" data-mi="${i}" data-mk="bundle" value="${m.cfg.bundle}"></td>
        <td><input type="number" step="10" min="0" data-mi="${i}" data-mk="minSum" value="${m.cfg.minSum || 0}" title="En uzun çubuk için: ölçüleri toplamı bu değerin altında kalan grup yazılmaz, pozları KALANLAR'a bırakılır. 0 = kural yok">${minSumHint(m.cfg) ? '<br><span class="hint">' + minSumHint(m.cfg) + '</span>' : ''}</td>
      </tr>`).join('');
      const unknown = app.mats.filter(m => !m.known).length;
      box.innerHTML = `<div class="matwrap"><table class="mats">
        <thead><tr><th></th><th>Parça</th><th>Renk</th><th>Poz</th><th>Parça</th><th>Toplam</th><th>Çubuk boyları</th><th>Demet</th><th>En az grup toplamı</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
        <div class="matfoot">İşaretli parçalar optimize edilir; demet = tek seferde kesilen en fazla adet.
          <b>Çubuk boyları:</b> parçanın stokta bulunan boyları, virgülle (ör. 6500, 5000, 4700). Her grup sığdığı en kısa boydan kesilir;
          sonuçta hangi boydan kaç çubuk kesileceği yazar. Bir parça yalnızca tek boyda geliyorsa buraya yalnızca o boyu yazın.
          <b>En az grup toplamı:</b> bir grubun ölçüleri toplamı bu değerin altında kalıyorsa o grup yazılmaz, pozları KALANLAR'a bırakılır
          (lamelde ${fmt(6500)}'lük çubuk için ${fmt(6500 - MIN_SUM_SLACK)}; kısa boylarda aynı pay: 5.000 → 4.750, 4.700 → 4.450). 0 yazarsan kural kalkar.${unknown ? ' ' + unknown + ' parça tanınmadı — kesilecekse işaretleyip çubuk boylarını girin.' : ''}</div>`;
      box.querySelectorAll('input[data-mi]').forEach(inp => inp.addEventListener('change', e => {
        const m = app.mats[Number(e.target.dataset.mi)], k = e.target.dataset.mk;
        if (k === 'on') m.cfg.on = e.target.checked;
        else if (k === 'lengths') {
          const lens = parseLengths(e.target.value);
          if (lens.length) {
            // en az grup toplamı en uzun boyu izliyorsa (boy − 250) yeni boya göre güncellenir
            const follows = m.cfg.minSum > 0 && m.cfg.minSum === Math.max(0, m.cfg.L - MIN_SUM_SLACK);
            m.cfg.lengths = lens; m.cfg.L = lens[0];
            m.cfg.minSum = follows ? Math.max(0, m.cfg.L - MIN_SUM_SLACK) : Math.max(0, Math.min(m.cfg.minSum, m.cfg.L - 1));
          }
        } else {
          const v = Math.round(Number(e.target.value) || 0);
          if (k === 'minSum') m.cfg.minSum = Math.max(0, Math.min(v, m.cfg.L - 1));
          else m.cfg[k] = Math.max(1, v);
          e.target.value = m.cfg[k];
        }
        matCfgSave(m.key, m.cfg);
        if (k === 'on') e.target.closest('tr').classList.toggle('off', !m.cfg.on);
        if (k === 'lengths' || k === 'minSum') { renderMaterials(); return; }
        updateRunHint();
      }));
    }
    updateRunHint();
  }

  // Seçili çubuk boyuna sığmayan poz sayısı (ölçü + testere payı > boy − emniyet)
  function longCount(m) {
    const cap = (m.cfg.L || 6500) - (Number($('pSafety').value) || 0), kerf = Number($('pKerf').value) || 0;
    let n = 0;
    for (const it of m.items) if (it.len + kerf > cap) n++;
    return n;
  }

  function updateRunHint() {
    const on = app.mats.filter(m => m.cfg.on);
    const has = app.files.length > 0 && on.length > 0;
    $('runBtn').disabled = !has || app.running;
    $('runHint').textContent = !app.files.length ? 'Önce dosya yükleyin.'
      : !on.length ? 'En az bir parça seçin.'
      : `${app.files.length} dosya · ${on.length} parça · ${fmt(on.reduce((a, m) => a + m.pieces, 0))} kesilecek parça`;
  }

  // Tüm dosyalardan malzeme (tür + profil + renk) bazında poz listesi.
  // Stok kodu projeden projeye değişebildiği için anahtar profil adı + renktir.
  function collectMaterials() {
    const defLs = defaultLengths();
    const saved = matCfgAll();
    const arr = PanjurParse.mergeProjects(app.files);
    for (const m of arr) {
      const def = defaultCfg(m, defLs);
      const sv = saved[m.key];
      if (sv) {
        // Eski kayıtlarda tek boy (L) vardı: 6500 ise yeni boy listesi uygulanır, elle değiştirilmişse o boy korunur
        let lens = Array.isArray(sv.lengths) ? parseLengths(sv.lengths.join(',')) : [];
        if (!lens.length) lens = Number(sv.L) && Number(sv.L) !== 6500 ? [Math.round(Number(sv.L))] : def.lengths.slice();
        const L = lens[0];
        // minSum alanı olmayan eski kayıtlarda varsayılan (lamel: boy − 250) uygulanır
        m.cfg = { on: !!sv.on, lengths: lens, L, bundle: Number(sv.bundle) || def.bundle, minSum: sv.minSum != null && isFinite(Number(sv.minSum)) ? Math.max(0, Math.min(Number(sv.minSum), L - 1)) : defaultMinSum(m, L) };
      } else m.cfg = def;
    }
    // sekme / sayfa adı: mergeProjects'in verdiği ayırt edici kısa ad (LAMEL EKO, LAMEL STANDART …)
    for (const m of arr) m.sheetName = m.label;
    return arr;
  }

  // ---------------------------------------------------------------- worker altyapısı
  async function getWorkerSource() {
    if (app.workerSrc) return app.workerSrc;
    const el = $('optimizer-src');
    let src = el && el.textContent && el.textContent.trim().length > 100 ? el.textContent : null;
    if (!src && el && el.src) {
      try { const r = await fetch(el.src); if (r.ok) src = await r.text(); } catch (e) { /* file:// altında olabilir */ }
    }
    if (!src) return null;
    app.workerSrc = src + '\n;let __abort = false; self.onmessage = async function (e) { const d = e.data; if (d && d.type === "abort") { __abort = true; return; } try { const res = await PanjurOpt.optimize(d.items, d.params, { timeMs: d.timeMs, yield: true, chunk: 2000, abort: () => __abort, onProgress: p => self.postMessage({ type: "progress", frac: p.frac, best: p.best, iter: p.iter }) }); self.postMessage({ type: "done", result: res }); } catch (err) { self.postMessage({ type: "error", message: String(err && err.stack || err) }); } };';
    return app.workerSrc;
  }

  function workerCount() {
    const hc = navigator.hardwareConcurrency || 2;
    return Math.max(1, Math.min(hc - 1, 8));
  }

  // Bir malzemeyi paralel koşularla optimize eder; en iyi sonucu döndürür
  async function optimizeMaterial(mat, P, timeMs, onProgress) {
    const src = app.noWorker ? null : await getWorkerSource();
    const n = src ? workerCount() : 1;
    const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919 + mat.items.length);
    if (!src || n === 1) {
      // ana iş parçacığı (yedek yol)
      const res = await PanjurOpt.optimize(mat.items, Object.assign({}, P, { seed: seeds[0] }), { timeMs, chunk: 1000, onProgress: p => onProgress(p.frac, p.best, 1), abort: () => app.abort, material: mat.key });
      return res;
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const workers = [];
      const results = [];
      const fracs = new Array(n).fill(0), bests = new Array(n).fill(Infinity);
      let done = 0, finished = false;
      const mainThread = () => PanjurOpt.optimize(mat.items, Object.assign({}, P, { seed: seeds[0] }), { timeMs, chunk: 1000, onProgress: p => onProgress(p.frac, p.best, 1), abort: () => app.abort, material: mat.key });
      const finish = () => {
        if (finished) return;
        finished = true;
        clearInterval(chk);
        for (const w of workers) w.terminate();
        URL.revokeObjectURL(url);
        if (!results.length) {
          // Hiçbir worker sonuç vermedi: kısıtlı ortamda (ör. sandbox iframe, içerik güvenlik
          // politikası) worker betiği yüklenememiş olabilir. Aynı aramayı bu iş parçacığında yap.
          app.noWorker = true;
          mainThread().then(resolve, reject);
          return;
        }
        results.sort((a, b) => a.stats.cost - b.stats.cost);
        resolve(results[0]);
      };
      let abortSent = false;
      const chk = setInterval(() => {
        if (app.abort && !abortSent) { abortSent = true; for (const w of workers) w.postMessage({ type: 'abort' }); }
      }, 200);
      for (let i = 0; i < n; i++) {
        let w;
        try { w = new Worker(url); } catch (e) { console.error('worker oluşturulamadı', e); break; }
        workers.push(w);
        w.onmessage = e => {
          const m = e.data;
          if (m.type === 'progress') { fracs[i] = m.frac; bests[i] = m.best; onProgress(Math.min(...fracs), Math.min(...bests), n); }
          else if (m.type === 'done') { results.push(m.result); fracs[i] = 1; done++; if (done === workers.length) finish(); }
          else if (m.type === 'error') { console.error('worker', m.message); done++; if (done === workers.length) finish(); }
        };
        w.onerror = err => { console.error('worker hata', err.message); done++; if (done === workers.length) finish(); };
        w.postMessage({ items: mat.items, params: Object.assign({}, P, { seed: seeds[i] }), timeMs });
      }
      if (!workers.length) {
        clearInterval(chk); finished = true; app.noWorker = true;
        mainThread().then(resolve, reject);
      }
    });
  }

  // Arama süresi poz sayısıyla orantılıdır: girilen süre 150 poz içindir. Birkaç pozluk projede
  // saniyeler içinde biter (en az 0,15 kat); çok projeli büyük havuzda uzar (en çok 4 kat; tek tek
  // kesilen parçalarda arama hızlı yakınsadığı için 1 katı aşmaz).
  function timeScale(m) {
    const s = m.items.length / 150;
    return Math.max(0.15, Math.min((m.cfg.bundle || 1) <= 2 ? 1 : 4, s));
  }

  // ---------------------------------------------------------------- çalıştırma
  async function run() {
    if (app.running) return;
    saveParams();
    const params = readParams();
    app.mats = collectMaterials();     // dosya kartlarındaki son bilgilerle
    const mats = app.mats.filter(m => m.cfg.on);
    if (!mats.length) { toast('Optimize edilecek parça seçilmedi.'); return; }
    app.running = true; app.abort = false; app.results = [];
    $('runBtn').disabled = true; $('stopBtn').hidden = false;
    $('sec-results').hidden = true;
    const prog = $('progress'); prog.innerHTML = '';
    const lines = mats.map(m => {
      const div = document.createElement('div'); div.className = 'pline';
      const sc = timeScale(m);
      div.innerHTML = `<div>${esc(m.sheetName)} <span class="hint">${m.items.length} poz · çubuk ${m.cfg.lengths.join(' / ')} · demet ${m.cfg.bundle}${m.cfg.minSum ? ' · grup toplamı ≥ ' + fmt(m.cfg.minSum) : ''}${m.orders.length > 1 ? ' · ' + m.orders.length + ' proje' : ''}${sc > 1.05 ? ' · süre ×' + sc.toFixed(1) : ''}</span></div><div class="pbar"><div></div></div><div class="hint">bekliyor</div>`;
      prog.appendChild(div); return div;
    });
    const t0 = performance.now();
    try {
      for (let i = 0; i < mats.length; i++) {
        if (app.abort) break;
        const m = mats[i];
        const P = { L: m.cfg.L, lengths: m.cfg.lengths.slice(), kerf: params.kerf, safety: params.safety, maxBundle: m.cfg.bundle || 1, minSum: m.cfg.minSum || 0, wCut: params.wCut, wBar: params.wBar, wChange: params.wChange, wKalan: params.wKalan, wSpread: params.wSpread, maxSpread: params.maxSpread, mergeSameLength: params.mergeSameLength, multiStep: params.multiStep, allowSplit: params.allowSplit };
        const bar = lines[i].querySelector('.pbar > div'), txt = lines[i].children[2];
        const scale = timeScale(m);
        const res = await optimizeMaterial(m, P, Math.round(params.timeMs * scale), (frac, best, n) => { bar.style.width = (frac * 100).toFixed(0) + '%'; txt.textContent = `${(frac * 100).toFixed(0)}% · en iyi maliyet ${isFinite(best) ? Math.round(best) : '–'} · ${n} paralel`; });
        bar.style.width = '100%';
        txt.textContent = res.stats.listOnly
          ? `tamam · ${res.stats.groupCount} grup · ${byLenText(res.stats.barsByLen) || '0 çubuk'} · KALANLAR ${res.stats.kalanCount} poz`
          : `tamam · ${byLenText(res.stats.barsByLen) || res.stats.bars + ' çubuk'} · ${res.stats.strokes} kesim · fire %${(res.stats.wastePct * 100).toFixed(1)}`;
        app.results.push({ mat: m, result: res });
      }
    } catch (e) {
      console.error(e); toast('Hata: ' + e.message, 6000);
    }
    app.running = false; $('runBtn').disabled = false; $('stopBtn').hidden = true;
    if (app.results.length) {
      $('resHint').textContent = `${((performance.now() - t0) / 1000).toFixed(0)} sn`;
      renderResults();
      $('sec-results').hidden = false;
      $('sec-results').scrollIntoView({ behavior: 'smooth' });
    }
  }

  // ---------------------------------------------------------------- ağırlık karşılaştırma
  async function compareWeights() {
    if (app.running) return;
    app.mats = collectMaterials();
    const mats = app.mats.filter(m => m.cfg.on);
    if (!mats.length) { toast('Önce dosya yükleyip parça seçin.'); return; }
    const mat = mats.slice().sort((a, b) => b.pieces - a.pieces)[0];
    const params = readParams();
    const cur = currentWeights();
    const runs = PRESETS.map(p => ({ name: p.name, w: p.w, preset: p }));
    if (!PRESETS.some(p => sameWeights(p.w, cur))) runs.unshift({ name: 'Şu anki ayar', w: cur, preset: null });
    const per = Math.max(2500, Math.round(params.timeMs / 2));
    app.running = true; app.abort = false;
    $('runBtn').disabled = true; $('stopBtn').hidden = false;
    const btn = $('cmpBtn'); btn.disabled = true;
    const out = $('cmpOut');
    out.innerHTML = `<div class="hint">${esc(mat.sheetName)} (${mat.items.length} poz) üzerinde ${runs.length} ayar × ${(per / 1000).toFixed(0)} sn deneniyor…</div>`;
    const rows = [];
    try {
      for (let i = 0; i < runs.length; i++) {
        if (app.abort) break;
        const r = runs[i];
        btn.textContent = `Karşılaştırılıyor… ${i + 1}/${runs.length}`;
        const P = Object.assign({ L: mat.cfg.L, lengths: mat.cfg.lengths.slice(), kerf: params.kerf, safety: params.safety, maxBundle: mat.cfg.bundle || 1, minSum: mat.cfg.minSum || 0,
          mergeSameLength: params.mergeSameLength, multiStep: params.multiStep, allowSplit: params.allowSplit }, weightParams(r.w));
        const res = await optimizeMaterial(mat, P, per, () => {});
        rows.push({ name: r.name, w: r.w, preset: r.preset, st: res.stats });
        out.innerHTML = renderCompare(mat, rows, cur, per);
      }
    } catch (e) { console.error(e); toast('Karşılaştırma hatası: ' + e.message, 5000); }
    btn.disabled = false; btn.textContent = 'Ağırlıkları karşılaştır';
    app.running = false; $('stopBtn').hidden = true; updateRunHint();
    if (rows.length) {
      out.innerHTML = renderCompare(mat, rows, cur, per);
      out.querySelectorAll('button[data-use]').forEach(b => b.addEventListener('click', () => {
        const w = rows[Number(b.dataset.use)].w;
        for (const [k, v] of Object.entries(w)) $(k).value = v;
        saveParams(); renderWeights(); toast('Ayar uygulandı: ' + rows[Number(b.dataset.use)].name);
      }));
    }
  }

  function renderCompare(mat, rows, cur, per) {
    const best = {
      bars: Math.min(...rows.map(r => r.st.bars)),
      strokes: Math.min(...rows.map(r => r.st.strokes)),
      waste: Math.min(...rows.map(r => r.st.wastePct)),
      eq: Math.max(...rows.map(r => r.st.equalGroups / r.st.groupCount)),
    };
    const body = rows.map((r, i) => {
      const st = r.st, isCur = sameWeights(r.w, cur);
      return `<tr class="${isCur ? 'cur' : ''}">
        <td>${esc(r.name)} <span class="hint">${esc(weightLabel(r.w))}</span></td>
        <td class="${st.equalGroups / st.groupCount === best.eq ? 'best' : ''}">${st.equalGroups}/${st.groupCount}</td>
        <td>${st.spreadMax}</td>
        <td class="${st.bars === best.bars ? 'best' : ''}">${fmt(st.bars)}</td>
        <td class="${st.strokes === best.strokes ? 'best' : ''}">${st.strokes}</td>
        <td>${st.changes}</td>
        <td class="${st.wastePct === best.waste ? 'best' : ''}">${(st.wastePct * 100).toFixed(1)}%</td>
        <td>${((st.materialMm - st.pieceMm) / 1000).toFixed(0)} m</td>
        <td>${st.kalanCount}</td>
        <td>${isCur ? '<span class="hint">kullanımda</span>' : `<button class="small ghost" data-use="${i}">kullan</button>`}</td>
      </tr>`;
    }).join('');
    const spanBars = Math.max(...rows.map(r => r.st.bars)) - best.bars;
    const spanCuts = Math.max(...rows.map(r => r.st.strokes)) - best.strokes;
    return `<table class="cmp2">
      <thead><tr><th>Ayar (adet sınırı · fark ağırlığı)</th><th>Eşit adetli grup</th><th>En çok fark</th><th>Çubuk</th><th>Kesim</th><th>Demet bozma</th><th>Fire</th><th>Fire (m)</th><th>KALANLAR</th><th></th></tr></thead>
      <tbody>${body}</tbody></table>
      <div class="hint" style="margin-top:6px">${esc(mat.sheetName)} · ${mat.items.length} poz · ayar başına ${(per / 1000).toFixed(0)} sn arama (tam koşuda sonuçlar biraz daha iyi olur).
      Ayarlar arası fark: <b>${spanBars} çubuk</b> (${((spanBars * mat.cfg.L) / 1000).toFixed(0)} m malzeme)${spanCuts ? ` · <b>${spanCuts} kesim</b>` : ''}.</div>`;
  }

  // ---------------------------------------------------------------- sonuç görünümü
  function stepCells(step) {
    const r = PanjurExcel.stepRow(step);
    return r;
  }
  // Satırlar ölçüye göre büyükten küçüğe; adedi demetten az olan satırda aradaki fark kadar çubuk kenarda bekler
  function renderGroup(g, res) {
    const multiLen = res && ((res.P.lengths || []).length > 1);
    const rows = g.steps.map(s => {
      const r = stepCells(s);
      const note = s.setAside > 0 ? `${s.setAside} çubuk kenarda` : '';
      return `<tr><td>${esc(r.order)}</td><td>${esc(r.customer)}</td><td>${esc(r.poz)}</td><td>${esc(r.count)}</td><td class="len">${fmt(r.len)}</td><td class="note">${esc(note)}</td></tr>`;
    }).join('');
    const rem = (g.remnants || []).filter(r => !r.final && r.count > 0).map(r => `${r.count}×${fmt(r.len)}`).join(', ');
    const title = `GRUP ${g.no}` + (multiLen ? ` <span class="badge">${fmt(g.barLen)}'lik çubuk</span>` : '') + (g.fallback ? ' <span class="m">artık yetmedi – yeni çubuk</span>' : '');
    const lastN = g.steps.length ? Math.min(...g.steps.map(s => s.n)) : g.bars;
    const adet = g.spread ? `<span class="df">adet ${g.bars}–${lastN} (fark ${g.spread})</span>` : `<span class="eq">adetler eşit (${g.bars})</span>`;
    return `<div class="gbox"><table class="g"><caption>${title}<span class="m">${g.bars} çubuk · ${g.strokes} kesim${g.changes ? ' · ' + g.changes + ' demet bozma' : ''}</span>${adet}</caption>
      <thead><tr><th>Sipariş</th><th>Müşteri</th><th>POZ</th><th>ADET</th><th>ÖLÇÜ</th><th style="text-align:left">Not</th></tr></thead>
      <tbody>${rows}<tr class="sum"><td colspan="4" style="text-align:left;font-weight:400" class="note">kalan ${fmt(g.leftover)} mm${rem ? ' · artık ' + rem : ''}</td><td class="len">${fmt(g.sumLen)}</td><td></td></tr></tbody></table></div>`;
  }
  function renderKalan(res) {
    const k = res.kalan;
    if (!k.parts.length) return '';
    const src = new Map();
    for (const e of k.plan) for (const s of e.steps) { const m = src.get(s.part.id) || new Map(); m.set(e.groupNo, (m.get(e.groupNo) || 0) + s.n); src.set(s.part.id, m); }
    const rows = k.parts.map(p => {
      const m = src.get(p.part.id);
      const note = m ? 'artık: ' + [...m.entries()].map(([g, n]) => `G${g} (${n})`).join(' + ') : '';
      return `<tr class="kalan"><td>${esc(p.item.order)}</td><td>${esc(p.item.customer)}</td><td>${esc(p.item.poz)}</td><td>${p.count}</td><td class="len">${fmt(p.item.len)}</td><td class="note">${esc(note)}</td></tr>`;
    }).join('');
    // En az grup toplamı kuralı açıkken KALANLAR yalnızca listedir (yeni çubuk grubu yazılmaz)
    const def = k.listOnly ? '' : (k.deficit || []).map(d => `<tr><td colspan="6" class="err">Eksik: poz ${esc(d.item.poz)} × ${d.count} (${fmt(d.item.len)} mm) artıktan çıkmadı → yeni çubuk grubu</td></tr>`).join('');
    const st = res.stats;
    const cap = k.listOnly
      ? `${k.parts.length} poz · ${fmt(st.kalanPieces)} parça · toplamı sınıra ulaşan gruba giremeyenler${k.strokes ? ' · artıklardan ' + k.strokes + ' kesim' : ''}${st.kalanNewBars ? ' · ≈ ' + ((res.P.lengths || []).length > 1 ? byLenText(st.kalanBarsByLen) : st.kalanNewBars + ' çubuk') : ''}`
      : `${k.parts.length} poz · artıklardan ${k.strokes} kesim`;
    return `<div class="gbox kalan"><table class="g"><caption>KALANLAR <span class="m">${cap}</span></caption>
      <thead><tr><th>Sipariş</th><th>Müşteri</th><th>POZ</th><th>ADET</th><th>ÖLÇÜ</th><th style="text-align:left">Kaynak</th></tr></thead><tbody>${rows}${def}</tbody></table></div>`;
  }
  function renderPlan(res) {
    if (!res.kalan.plan.length) return '';
    const rows = res.kalan.plan.map(e => `<tr><td>G${e.groupNo} / adım ${e.step}${e.derived ? ' (bölünmüş)' : ''}</td><td>${e.count} × ${fmt(e.len)}</td><td style="text-align:left">${e.steps.map(s => `${fmt(s.len)} × ${s.n} → poz ${esc(s.item.poz)}`).join('<br>')}</td><td>${e.leftoverCount} × ${fmt(e.leftoverLen)}</td></tr>`).join('');
    return `<details><summary>Artık planı (KALANLAR hangi artıktan kesilir)</summary><table class="g" style="margin-top:8px"><thead><tr><th style="text-align:left">Kaynak</th><th>Artık</th><th style="text-align:left">Kesimler</th><th>Kalan</th></tr></thead><tbody>${rows}</tbody></table></details>`;
  }
  function renderResults() {
    const tabs = $('tabs'); tabs.innerHTML = '';
    app.results.forEach((x, i) => {
      const b = document.createElement('button'); b.textContent = `${x.mat.sheetName}${x.mat.color && !x.mat.sheetName.includes(x.mat.color) ? ' · ' + x.mat.color : ''}`;
      b.addEventListener('click', () => showResult(i)); tabs.appendChild(b);
    });
    showResult(0);
  }
  function showResult(i) {
    $('tabs').querySelectorAll('button').forEach((b, j) => b.classList.toggle('active', j === i));
    const x = app.results[i], res = x.result, st = res.stats;
    const v = res.validation;
    const lim = res.P.maxSpread >= 9999 ? 'sınır yok' : 'sınır ' + res.P.maxSpread;
    // En az grup toplamı kuralı açıkken yazılan gruplar ile KALANLAR ayrı ayrı özetlenir
    const multiLen = (res.P.lengths || []).length > 1;
    const slack = res.P.L - res.P.minSum;
    const minText = multiLen ? res.P.lengths.map(x => fmt(x) + ' → ' + fmt(x - slack)).join(' · ') : fmt(res.P.minSum);
    const stats = (st.listOnly ? [
      ['Grup', st.groupCount, `${st.groupPozCount}/${res.items.length} poz · grup toplamı ≥ ${multiLen ? 'boy − ' + fmt(slack) : fmt(res.P.minSum)}`],
      ['Eşit adetli grup', `${st.equalGroups}/${st.groupCount}`, `en çok fark ${st.spreadMax} · ${lim}`],
      ['Grup çubuğu', fmt(st.groupBars), `${multiLen ? byLenText(st.barsByLen) + ' · ' : ''}fire ${(st.groupWastePct * 100).toFixed(1)} %`],
      ['KALANLAR', st.kalanCount + ' poz', `${fmt(st.kalanPieces)} parça${st.kalanNewBars ? ' · ≈ ' + (multiLen ? byLenText(st.kalanBarsByLen) : st.kalanNewBars + ' çubuk') : ''}`],
      ['Toplam çubuk', '≈ ' + fmt(st.bars), multiLen ? `${(st.materialMm / 1000).toFixed(0)} m malzeme · KALANLAR tahmini` : `alt sınır ${st.lowerBoundBars} · KALANLAR tahmini`],
      ['Demet bozma', st.groupChanges, ''],
      ['Kesim', st.groupStrokes, 'gruplarda'],
    ] : [
      ['Eşit adetli grup', `${st.equalGroups}/${st.groupCount}`, `en çok fark ${st.spreadMax} · ${lim}`],
      ['Çubuk', st.bars, multiLen ? `${byLenText(st.barsByLen)} · ${(st.materialMm / 1000).toFixed(0)} m` : `alt sınır ${st.lowerBoundBars} · ${(st.bars * res.P.L / 1000).toFixed(0)} m`],
      ['Kesim', st.strokes, `grup ${st.groupStrokes}${st.kalanStrokes ? ' + artık ' + st.kalanStrokes : ''}`],
      ['Fire', (st.wastePct * 100).toFixed(1) + ' %', `${(st.wasteMm / 1000).toFixed(1)} m`],
      ['Demet bozma', st.changes, ''],
      ['Grup', st.groupCount, `${res.items.length} poz · ${fmt(st.pieces)} parça`],
      ['KALANLAR', st.kalanCount, st.fallbackBars ? `+${st.fallbackBars} yeni çubuk` : 'artıktan'],
    ]).map(([k, val, s]) => `<div class="stat"><div class="k">${k}</div><div class="v">${val}</div><div class="s">${s}</div></div>`).join('');
    const groups = res.groups.map(g => renderGroup(g, res)).join('') + (res.kalan.fallbackGroups || []).map(g => renderGroup(g, res)).join('') + renderKalan(res);
    $('resBody').innerHTML = `<div class="stats">${stats}</div>
      <div class="valid ${v.ok ? 'ok' : 'bad'}">${v.ok ? (st.listOnly
        ? `✔ Doğrulama: her poz ya tam adediyle bir grupta ya da KALANLAR'da; yazılan her grubun toplamı en az ${multiLen ? '(' + minText + ')' : fmt(res.P.minSum) + ' mm'}, hiçbir çubuk boyu aşılmadı, demet ve adet farkı sınırları korundu.`
        : '✔ Doğrulama: her pozun adedi tam, hiçbir çubuk boyu aşılmadı, demet ve adet farkı sınırları korundu.') : '✖ Doğrulama hataları: ' + esc(v.errors.slice(0, 5).join(' | '))}</div>
      ${st.listOnly && !st.groupCount ? `<div class="valid bad">⚠ Hiçbir grup yazılmadı: bu parçada ölçüleri toplamı ${multiLen ? 'sınıra (' + minText + ')' : fmt(res.P.minSum) + " mm'ye"} ulaşan, adetleri uyumlu grup kurulamıyor. Bütün pozlar KALANLAR'da. Kuralı kaldırmak için parça tablosunda "En az grup toplamı"na 0 yazın.</div>` : ''}
      ${(res.oversize || []).length ? `<div class="valid bad">⚠ ${res.oversize.length} poz çubuk boyundan (${fmt(res.P.L)} mm) uzun olduğu için plana alınmadı: ${res.oversize.slice(0, 8).map(o => 'poz ' + esc(o.poz) + ' (' + o.count + ' × ' + fmt(o.len) + ' mm)').join(', ')}${res.oversize.length > 8 ? ' …' : ''}</div>` : ''}
      <div class="cmp">Maliyet ${Math.round(st.cost)} (başlangıç ${Math.round(res.initialCost)}) · ${fmt(res.iterations)} iterasyon · ${esc(x.mat.desc)} ${esc(x.mat.color)}</div>
      <div class="breakdown">${costBreakdown(res)}</div>
      <div class="groups" style="margin-top:10px">${groups}</div>${renderPlan(res)}`;
  }

  function costBreakdown(res) {
    const c = res.stats.costParts;
    if (!c) return '';
    const total = res.stats.cost || 1;
    const parts = [
      ['kesim', c.cut], ['çubuk', c.bar], ['adet farkı', c.spread || 0], ['demet bozma', c.change], ['KALANLAR', c.kalan], ['fire', c.waste],
    ].filter(([, v]) => Math.abs(v) >= 0.5);
    return 'Maliyet puanının dağılımı: ' + parts.map(([k, v]) => `${k} ${Math.round(v)} <span class="hint">(%${Math.round(100 * v / total)})</span>`).join(' + ')
      + (Math.abs(c.other) >= 0.5 ? ` − doluluk ödülü ${Math.abs(Math.round(c.other))}` : '')
      + ' <span class="hint">— kararları yönlendiren şey ağırlıkların oranıdır; bu satır yalnızca toplamın nereden geldiğini gösterir.</span>';
  }

  // ---------------------------------------------------------------- Excel
  async function downloadExcel() {
    if (!app.results.length) return;
    const showRemnants = $('oRemnantNote').checked;
    const results = app.results.map(x => ({
      result: x.result,
      meta: { desc: x.mat.desc, color: x.mat.color, sheetName: x.mat.sheetName, orders: dedupeOrders(x.mat.orders) },
      opts: { showRemnants },
    }));
    const allOrders = dedupeOrders(app.files.map(f => ({ orderNo: f.orderNo, customer: f.customer, date: f.date, note: f.note })));
    try {
      const buf = await PanjurExcel.buildWorkbook(results, { orders: allOrders });
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      const names = allOrders.map(o => o.customer || o.orderNo).filter(Boolean).slice(0, 3).join('-') || 'kesim';
      a.href = URL.createObjectURL(blob); a.download = `${names} KESİM PLANI.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { console.error(e); toast('Excel oluşturulamadı: ' + e.message, 6000); }
  }
  function dedupeOrders(list) {
    const m = new Map();
    for (const o of list) {
      const k = o.orderNo || o.customer;
      if (!m.has(k)) m.set(k, { orderNo: o.orderNo, customer: o.customer, date: o.date ? new Date(o.date + 'T00:00:00Z') : null, note: o.note, pozCount: 0 });
      m.get(k).pozCount += o.pozCount || 0;
    }
    return [...m.values()];
  }

  // ---------------------------------------------------------------- olaylar
  function init() {
    loadParams();
    const drop = $('drop'), inp = $('fileInput');
    drop.addEventListener('click', () => inp.click());
    inp.addEventListener('change', () => { addFiles([...inp.files]); inp.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files].filter(f => /\.(csv|txt|xlsx?)$/i.test(f.name))));
    $('runBtn').addEventListener('click', run);
    $('stopBtn').addEventListener('click', () => { app.abort = true; toast('Durduruluyor… mevcut en iyi sonuç alınacak'); });
    $('dlBtn').addEventListener('click', downloadExcel);
    $('cmpBtn').addEventListener('click', compareWeights);
    for (const id of WEIGHT_IDS) $(id).addEventListener('input', renderWeights);
    for (const id of CHECK_IDS) $(id).addEventListener('change', renderWeights);
    for (const id of PARAM_IDS.concat(CHECK_IDS)) $(id).addEventListener('change', () => {
      if (id === 'pL') $('pL').value = defaultLengths().join(', ');
      saveParams();
      if (id === 'pL') { renderMaterials(); renderWeights(); } else updateRunHint();
    });
    $('parHint').textContent = `${workerCount()} paralel arama`;
    renderWeights();
    if (new URLSearchParams(location.search).get('debug')) window.__panjur = app;   // tanılama
    // demo: ?demo=1 ile örnek dosyaları (http üzerinden) yükle
    const q = new URLSearchParams(location.search);
    if (q.get('demo')) {
      (async () => {
        for (const name of q.get('demo').split('|')) {
          try { const r = await fetch(encodeURI(name)); const b = await r.blob(); await addFiles([new File([b], name.split('/').pop())]); } catch (e) { console.error(e); }
        }
      })();
    }
    // kendi kendine test: ?selftest=1 → worker yoluyla küçük bir örnek çözer, sonucu <pre id="selftest"> içine yazar
    if (q.get('selftest')) {
      (async () => {
        const pre = document.createElement('pre'); pre.id = 'selftest'; document.body.appendChild(pre);
        try {
          const items = [];
          for (let i = 1; i <= 24; i++) items.push({ order: '1', customer: 'T', poz: i, len: 1200 + (i % 7) * 97, count: 18 + (i % 3) });
          const mat = { key: 'lamel|x|y', type: 'lamel', desc: 'TEST', color: '', sheetName: 'LAMEL', items, orders: [], cfg: { on: true, lengths: [6500], L: 6500, bundle: 50, minSum: 0 } };
          const P = Object.assign({}, PanjurOpt.DEFAULTS, { maxBundle: 50 });
          const res = await optimizeMaterial(mat, P, 1500, () => {});
          let ls = true;
          try { localStorage.setItem('panjur.deneme', '1'); localStorage.removeItem('panjur.deneme'); } catch (e) { ls = false; }
          pre.textContent = JSON.stringify({ ok: res.validation.ok, bars: res.stats.bars, strokes: res.stats.strokes, iters: res.iterations, workers: workerCount(), src: !!app.workerSrc, noWorker: !!app.noWorker, origin: location.origin, localStorage: ls });
        } catch (e) { pre.textContent = 'HATA ' + (e && e.message); }
        // çerçeve içinde (ör. src/test/sandbox.html) koşuyorsa sonucu dış sayfaya bildir
        if (window.parent !== window) window.parent.postMessage({ panjurSelftest: pre.textContent }, '*');
      })();
    }
    renderFiles();
  }
  document.addEventListener('DOMContentLoaded', init);
})();

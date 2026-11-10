/*
 * test.js'i tarayıcısız, Node ile koşar. Kullanım (src/test içinden ya da herhangi bir yerden):
 *   node src/test/run-node.js "iters=60000&xlsx=1"
 * Sorgu dizgisi test.html?… ile aynıdır. Excel üretilirse test-output.xlsx olarak yazılır.
 * Tarayıcıya özgü davranışlar (worker, dosya bırakma, indirme) burada sınanmaz; onlar için run.sh.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = __dirname, SRC = path.dirname(DIR);
const query = process.argv[2] || 'iters=60000';

let printed = 0, done;
const finished = new Promise(r => { done = r; });
const out = {
  _t: '',
  get textContent() { return this._t; },
  set textContent(v) {            // test.js her satırda tüm metni yeniden yazar: yalnızca yeni satırları bas
    this._t = v;
    const lines = v.split('\n');
    for (; printed < lines.length; printed++) console.log(lines[printed]);
  },
};
const els = { out, xlsx: { textContent: '' } };
globalThis.window = globalThis;
globalThis.location = { search: '?' + query };
globalThis.document = { getElementById: id => els[id] || (els[id] = { textContent: '' }), body: { setAttribute: () => done() } };
globalThis.fetch = async rel => {
  const p = path.resolve(DIR, decodeURI(rel));
  if (!fs.existsSync(p)) return { ok: false, status: 404 };
  const b = fs.readFileSync(p);
  return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
globalThis.XLSX = require(path.join(SRC, 'lib', 'xlsx.full.min.js'));
globalThis.ExcelJS = require(path.join(SRC, 'lib', 'exceljs.min.js'));
// Kaynaklar tarayıcı betiği olarak yüklenir (module tanımsız → global PanjurOpt / PanjurParse / PanjurExcel)
for (const f of ['optimizer.js', 'parser.js', 'excel-out.js']) vm.runInThisContext(fs.readFileSync(path.join(SRC, f), 'utf8'), { filename: f });
vm.runInThisContext(fs.readFileSync(path.join(DIR, 'test.js'), 'utf8'), { filename: 'test.js' });

finished.then(() => {
  const b64 = (els.xlsx.textContent || '').trim();
  if (b64) {
    fs.writeFileSync(path.join(DIR, 'test-output.xlsx'), Buffer.from(b64, 'base64'));
    console.log('test-output.xlsx yazıldı');
  }
  process.exit(/FAIL:|EXCEPTION|SONUÇ: \d+ HATA/.test(out.textContent) ? 1 : 0);
});

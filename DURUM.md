# Panjur kesim optimizasyonu — durum

Son güncelleme: 2026-11-11

`PanjurKesim.html`: imalat programının proje dosyalarını (CSV / Excel) okuyup lamel, kutu, dikme, alt
parça ve tambur borusu için demet kesim planı çıkaran, kurulum ve internet gerektirmeyen tek dosyalık
araç. Kullanım ve model ayrıntısı `README.md` içinde; bu dosya nerede kaldığımızı tutar.

Depo: `github.com/abidcan7/ferrini-panjurkesim` (herkese açık; giriş dosyası kökteki `PanjurKesim.html`).
Araç 11.11'de Atlas içinde çalışır halde görüldü.

## Şu an ne durumda

Çalışıyor ve gerçek dosyalarla doğrulandı. 214 kontrolün tamamı hem Node'da hem headless Chrome'da geçiyor.

| Konu | Durum |
|---|---|
| Dosya okuma | Üç düzen okunuyor (aşağıda); kutulu örnek 24576 dahil |
| Parça türleri | Lamel, dikme, alt parça, tambur, kutu, kutu kapağı, köşebent, pano U (açık); fitil, strafor (kapalı) |
| Çok proje | Birden fazla dosya tek havuzda optimize ediliyor |
| Satır düzeni | Her satır tek poz; grup içinde ölçüye göre büyükten küçüğe (11.11) |
| Öncelik | Grup içi adet farkı en çok 4, ideal eşit |
| Çubuk boyları | Parça başına seçenek (6500 / 5000 / 4700; 6500 işaretli gelir) + isteğe bağlı stok adedi; her grup işaretli boylardan sığdığı en kısasından; boy başına çubuk sayısı yazılıyor (11.11) |
| En az grup toplamı | Lamelde 6250 (kısa boylarda 4750 / 4450): altında kalan grup yazılmaz, pozları KALANLAR'a bırakılır |
| Çıktı | Excel: parça başına sayfa + ÖZET + POZ LİSTESİ + ARTIK PLANI |
| Baskı | A4 dikey, sayfa başına iki sütun, elle sayfa sonları; Excel'in PDF çıktısıyla doğrulandı |
| Portal içinde çalışma | Kısıtlı çerçevede (sandbox, `allow-same-origin` yok) ve worker'ları engelleyen politikada denendi |

## Kararlar

| Tarih | Karar |
|---|---|
| 15.09 | Çubuk 6500 mm, testere payı 4 mm, emniyet 5 mm. Demet: lamel 50, dikme 2 (her poz 2 adet), alt parça ve tambur tek tek |
| 15.09 | KALANLAR artıklardan kesilir; artık stoğu takip edilmez |
| 15.09 | Araç tek HTML dosyası; çıktı Excel, elle yapılan örnekle aynı satır düzeni |
| 15.10 | Girdi imalat programının CSV'si (`0000000000NNNNN_İmalat.csv`); birden fazla proje birlikte atılabilir |
| 10.11 | **1. öncelik adet yakınlığı:** gruptaki adetler 43–39 gibi en çok 4 farklı olabilir, ideal hepsinin eşit olması |
| 10.11 | **Her satır tek poz:** aynı ölçüdeki pozları tek satırda birleştirme yok |
| 10.11 | Birden fazla projenin dosyası birlikte atılıp hep birlikte optimize edilir |
| 10.11 | **Lamelde toplamı 6250'nin (6500'lük çubuk) altında kalan grup yazılmaz**, pozları KALANLAR'a eklenir: 6250 altı optimizasyon anlamsız |
| 10.11 | **Baskı iki sütun:** sayfanın sağ yarısı boş kalmasın |
| 10.11 | Araç ayrı bir GitHub deposunda durur (Poz Çizer gibi), Atlas oradan alır |
| 11.11 | **Grup içinde satırlar ölçüsü büyük olandan küçüğe sıralanır** (elle yapılan örnekte de 30 grubun 30'u böyle). "Demet yalnızca küçülür" kuralı bununla kalktı: adedi az olan satırda aradaki çubuklar kenarda bekler |
| 11.11 | **Çubuk boyları 6500 + 5000 + 4700;** çıktıda hangi boydan kaç çubuk kesileceği yazar |
| 11.11 | **Kutu profilleri tanınır** (SK-165 / 180 / 205, ÖN 45 ve AR 90) ve optimize edilir; tanınmayan parça kalmamalı |
| 11.11 | **Çubuk boyları her parça için "seçenek ve adet":** boylar işaretlenir, 6500 kendiliğinden işaretli gelir (hangi parçanın hangi boyda geldiği sorusunun cevabı) |

Varsayılan ağırlıklar: adet farkı 2 · kesim 10 · çubuk 4 · demet bozma 1 · KALANLAR 12.

Benim yaptığım varsayımlar (teyit bekliyor, aşağıda "Açık konular"):
"adet" o boydan **stokta kaç çubuk olduğu** olarak yorumlandı (araç bu adedi aşmaz, boş = sınır yok);
kısa boylarda en az grup toplamı aynı payla (250 mm) hesaplanıyor; kutu, kutu kapağı, köşebent ve
pano U tek tek kesiliyor (demet 1).

## Çubuk boyları

- `P.lengths` (büyükten küçüğe), `P.L` en uzunu. Grup, çubuk başı boyu (Σ(ölçü + testere payı))
  `boy − emniyet`e sığan **en kısa** stok boyundan kesilir (`pickBar`). Çubuk maliyeti boyuyla
  orantılı: 6500 = 1, 5000 = 0,77, 4700 = 0,72 çubuk.
- Sonuçta `stats.barsByLen` (yazılan grupların çubukları, boya göre) ve `stats.kalanBarsByLen`
  (KALANLAR tahmini). Excel'de sayfanın başında "Çubuk: 6500 × 592 · 5000 × 131", grup başlığında
  "GRUP 3 · 5000"; gruplar boya göre uzundan kısaya dizilir.
- Arayüz: genel "Çubuk boyları" alanı seçenek listesini verir (varsayılan `6500, 5000, 4700`). Parça
  tablosunda her parçanın satırında her boy için işaret kutusu; **yalnızca en uzun boy (6500) işaretli
  gelir**. İşaretli boyun yanında adet alanı (stok; boş = sınır yok). Kayıt: `cfg.opts`
  (`{len, on, qty}`), türetilen `lengths` / `L` / `stock`; `CFG_VERSION = 2` (eski kayıtlarda seçim
  varsayılana döner).
- **Stok adedi** (`P.stock`, boy → en çok çubuk): bir boyda sınır varsa `assignStock` grupları boylara
  dağıtır (kısa boya ihtiyaç duyan ve çubuk başına kazancı yüksek grup önce); kısa boyun stoğu
  biterse grup bir uzun boya geçer (kural açıksa orada da sınırı tutmalı), hiçbirinde yer yoksa
  pozları KALANLAR'a kalır. Sınır varken KALANLAR yalnızca listedir (`listOnly`), tahminde stokta
  karşılığı olmayan çubuklar `stats.stockShort` olarak ayrıca verilir ve ekranda uyarı çıkar.
  Pencere araması (`bestFill`) kalan stoğu bilir; doğrulayıcı stok aşımını denetler.
- Etkisi (lamel, kural açık): 21542'de yalnızca 6500 ile 154/156 poz gruplarda, üç boyla 156/156;
  4700 × 100 ve 5000 × 40 adet sınırıyla yine 156/156 (4700 × 37 · 5000 × 40 · 6500 × 1.369).
  Kısa parçalı alt parça ve tamburda fire düşüyor (dört projede tambur %4,4 → %1,6).

## En az grup toplamı kuralı

- Bakılan değer satırların ölçü toplamıdır (Excel'deki toplam satırı; testere payı sayılmaz).
  Sınır parça başınadır ve en uzun boy için yazılır: lamelde varsayılan çubuk boyu − 250 (6500 → 6250),
  diğer parçalarda 0. Kısa boydan kesilen grupta aynı pay geçerlidir (5000 → 4750, 4700 → 4450).
- Kural açıkken geçerli grup pencereleri dardır (6500 için: 6250 ≤ Σ ölçü ve Σ(ölçü + 4) ≤ 6495).
  Motor bu pencerelere oturan grupları özel bir aramayla kurar (`bestFill`: adet uyumlu pozlar
  arasında sınırlı derinlik-öncelikli arama; `fillFree`: serbest pozlardan grup kurma;
  `fillIteration`: birkaç grubu dağıtıp yeniden kurma). Sınırın altındaki gruplar aramada
  "bekleme alanı" sayılır, sonuca yazılmaz.
- KALANLAR yalnızca listedir: onlar için yeni çubuk grubu yazılmaz. Kenarda bekleyen çubuklardan
  kesilebilenler notta ve ARTIK PLANI'nda görünür. Çubuk tahmini (`estimateKalanBars`): parçalar
  tek tek, uzundan kısaya, ilk sığdığı çubuğa yerleştirilir; sonra her çubuk içeriğinin sığdığı
  (ve stoğu olan) en kısa işaretli boya indirilir.
- Adedi hiçbir pozla uyuşmayan ya da boyu tutmayan pozlar için grup kurulamaz; küçük projede bütün
  pozların KALANLAR'a düşmesi beklenen bir sonuçtur (ekran bunu uyarıyla söyler).

## Girdi düzenleri

Ham ERP dosyasında başlık satırı yok, sütun sayısı hep 7 ama düzen dışa aktarıma göre değişiyor. Bu
yüzden sütunlar sabit konumdan değil içerikten bulunuyor (`parser.js › inferRawColumns`): çapa
açıklama sütunu, solunda stok kodu, sağında renk, sonraki ilk "her satırda tam sayı" sütunu adet,
onun sağı ölçü. Başlıklı Excel'de sütunlar başlıktan okunuyor.

| Düzen | Sütunlar | Örnek dosya |
|---|---|---|
| ERP ham, müşteri pozlu | poz · müşteri pozu · stok · açıklama · renk · adet · ölçü | `örnek projeler/` (24714, 23876, 24221, 24543) |
| ERP ham, ağırlıklı | poz · stok · açıklama · renk · adet · ölçü · ağırlık | `000000000021542_İmalat.csv` |
| Başlıklı, bölümlü Excel | Poz no · (Referans no) · Stok kodu · Açıklama · Renk · Adet · Ölçü · (Toplam ağırlık) | `İMALAT LİSTESİ.xls` (19757), `örnek projeler/24576 OP.xls` (kutulu) |

- Ölçüde nokta binlik ayırıcı: `1.274` → 1274 mm. Kodlama Windows-1254.
- Parça türü açıklamadan bulunur (`parser.js › TYPES`). Kutu: açıklamada "kutu" geçen ve "kapak"
  geçmeyenler; kutu kapağı: ikisi de geçenler; köşebent; pano U. Ölçüsü olmayan "yan kapak" gibi
  kalemler zaten atlanır.
- Birleştirme anahtarı **stok kodu + renk**; stok kodundaki noktalama yok sayılır (`3224.24` = `322424`).
  Kutunun ön (BAR.F.45…) ve arka (BAR.T.90…) profili, boyutları (165 / 180 / 205) ve renkleri
  (A40, M14) ayrı parçalardır.
- Müşteri pozu doluysa POZ LİSTESİ sayfasına ayrı sütun olarak yazılır.
- Müşteri adı ve tarih dosyada yok; arayüzde elle girilir, proje no bazında hatırlanır.
- Çubuk boyundan uzun kalem (23876'daki 25.000 mm kutu kapağı) plana alınmaz; bütün pozları
  uzun olan parça kapalı gelir.

## Ölçülen sonuçlar

Lamelde kural açık; parça başına 300 bin iterasyon × 6 tohum.

Dört gerçek proje birlikte (24714 + 23876 + 24221 + 24543, toplam 94 poz), varsayılan ayar
(yalnızca 6500 işaretli) — `ÖRNEK ÇIKTI - 4 proje birlikte (araç).xlsx`:

| Parça | Poz | Grup | Gruplardaki poz | Çubuk (6500) | Grup firesi | KALANLAR |
|---|---|---|---|---|---|---|
| Lamel EKO | 88 | 17 | 73 | 684 | %1,7 | 15 poz, ≈ 78 çubuk |
| Lamel STANDART | 6 | 0 | 0 | – | – | 6 poz, ≈ 253 çubuk |
| Dikme | 94 | 34 | 94 | 68 | %10,7 | – (kural yok) |
| Alt parça K.SİZ | 88 | 20 | 88 | 20 | %1,6 | – |
| Alt parça K.Lİ | 6 | 6 | 6 | 6 | %49,8 | – |
| Tambur | 94 | 28 | 94 | 28 | %4,4 | – |

Aynı dört proje, üç boy işaretliyken: lamel EKO 18 grup / 74 poz (6500 × 592 · 5000 × 131, fire %1,4);
dikme 6500 × 50 · 5000 × 2 · 4700 × 22 (%10,0); alt parça K.SİZ %1,3; K.Lİ 4700 × 6 (%30,6);
tambur 6500 × 25 · 5000 × 1 · 4700 × 2 (%1,6).

Tek proje 21542 (156 poz, adetler 35–40), **üç boy işaretli** — `ÖRNEK ÇIKTI - 21542 (araç).xlsx`:
lamelde 40 grup, 156 pozun tamamı gruplarda, 6500 × 1.181 · 5000 × 40 · 4700 × 297, grup firesi
%2,3, 33 grup tam eşit adetli. Dikme 6500 × 104; alt parça 38 çubuk (%2,0); tambur 48 çubuk (%7,7).
Yalnızca 6500 ile: lamel 37 grup, 154 poz, 1.407 çubuk, 2 poz KALANLAR.

Kutulu örnek 24576 (4 poz), varsayılan ayar — `ÖRNEK ÇIKTI - 24576 kutulu (araç).xlsx`: dört kutu
profilinin her birinde iki parça tek çubuktan; lamelin dört pozu (adet 20 / 24 / 31 / 32) KALANLAR'da.

Karşılaştırmalar (lamel):

| | 21542 (156 poz) | Dört proje EKO (88 poz) |
|---|---|---|
| Kuralsız çözüp 6250 altını atmak, yalnızca 6500 | 139–140 poz gruplarda | 60–67 |
| Kurala göre aramak, yalnızca 6500 | 154 | 69–73 |
| Kurala göre aramak, üç boy | 156 | 74–75 |

Kural ve kısa boylar yokken (eski sonuçlar): dört projede EKO lamel 781 çubuk / 21 grup, 21542 lamel
1.443 çubuk / 38 grup. Elle yapılmış eski örnekte (3 proje, 158 lamel pozu, adet 14–40) insan
962 çubuk / 184 kesim, araç aynı kurallarla (tek poz, fark ≤ 4, toplam sınırı yok) 958 çubuk / 158 kesim.

## Baskı: gerçek çıktıdan öğrenilenler

- **Kesilen başlık.** Sayfada `sheetViews` kaydı yokken Excel, ekran ölçeği %100 olmayan
  bilgisayarda elle verilen satır yüksekliğini ölçeğe bölerek okuyor (%150'de 21 punto → 14);
  16 puntoluk başlığın üstü baskıda kesiliyordu. Aynı dosya başka bir kütüphaneyle üretilince
  olmuyor; fark yalnızca bu kayıt. Çözüm: her sayfaya `ws.views`, kitaba `wb.views`; başlık
  satırına yükseklik verilmiyor (Excel yazı boyuna göre ayarlıyor).
- **Sütun genişliği birimi** baskıda ekran ölçeğine göre değişiyor (%100'de 5,25, %150'de 5,5 punto).
  "Genişliğe sığdır" kullanılsaydı ölçek ve sayfaya sığan satır sayısı bilgisayardan bilgisayara
  oynardı. Bu yüzden ölçek en geniş hale (5,75) göre hesaplanıp sabit yazılıyor, sayfa sonları elle
  konuyor; bir sayfaya kaç satır sığacağı hesaplanırken %1,5 ve satır başına 0,25 punto pay var.
- Yazdırma alanı mutlak başvuruyla yazılıyor (`$A$1:$L$n`; ExcelJS'e `A$1:L$n` verilerek).
- Doğrulama yolu: Excel'i gizli ayrı bir örnekle açıp sayfayı PDF'e bastırmak
  (`ExportAsFixedFormat`) ve sayfa sayısını planla karşılaştırmak. Üç örnek dosyanın 23 parça
  sayfasının hepsinde tuttu (ekran ölçeği %150, varsayılan yazıcı sürücüsü). Kâğıda basılmış
  çıktıya ve %100 ölçekli bir bilgisayara henüz bakılmadı.

## Atlas

Atlas dış araçları ayrı depodan günde bir kez eşitliyor ve kısıtlı çerçevede gösteriyor
(`sandbox allow-scripts allow-modals allow-downloads`, `allow-same-origin` yok, `connect-src 'none'`).

- Giriş dosyası kökte `PanjurKesim.html`; kendi kendine yeter (dış betik, `assets/`, `lib/` yok),
  2 MB (dosya sınırı 8 MB). SheetJS 0.20.3.
- Kısıtlı çerçevede denendi: `localStorage` kapalı, araç çalışıyor, 8 worker `blob:` adresinden
  açılıyor. Worker'ları yasaklayan politikada (`worker-src 'none'`) ana iş parçacığına düşüp
  doğru sonuç veriyor.
- **Atlas'ta ayarlar hatırlanmaz** (`localStorage` yok): her açılışta varsayılanlar gelir (yalnızca
  6500 işaretli, adetler boş). 5000 / 4700 ve stok adetleri her açılışta yeniden işaretlenir.
- Yeni sürüm: Atlas bu depodan eşitliyorsa `main` dalındaki son commit bir sonraki eşitlemede alınır (günde bir kez); hangi kaynaktan aldığı Atlas tarafında teyit edilmeli.

## Açık konular

1. **"Adet"in anlamı.** Boyun yanındaki adet "stokta kaç çubuk var" olarak yorumlandı: araç o
   boydan en çok o kadar çubuk kullanır. Kastedilen başka bir şeyse (ör. yalnızca sonuçta boy başına
   çıkan çubuk sayısı) alan kaldırılabilir; sonuçtaki sayım zaten yazıyor.
2. **Kısa boylarda en az grup toplamı.** 5000 için 4750, 4700 için 4450 varsayıldı (aynı 250 mm pay).
3. **Kutu, kutu kapağı, köşebent, pano U demeti.** Tek tek kesim (demet 1) varsayıldı; kural yok.
4. **Her kutu profili ayrı sayfa.** Altı projede 7–10 kutu sayfası çıkabilir, çoğu birkaç satır.
   İstenirse aynı türün profilleri tek sayfada alt alta toplanabilir.
5. **KALANLAR çubuk sayısı tahmindir** (parçalar tek tek yerleştirilirse); artıklar değerlendirilirse daha az tutar.
6. **STANDART lamel ve K.Lİ alt parça (~3250 mm).** İki poz birlikte hiçbir boya sığmıyor
   (3239 + 3254 + 8 = 6501); lamelde hepsi KALANLAR'da.
7. Kuralın kapalı olduğu parçalarda çubuğa iki kez sığan uzun parça, "her satır tek poz" yüzünden
   poz adedi kadar çubukla açılıyor; "bir poz aynı grupta iki satıra bölünebilir" bunu çözer (kapalı).
8. KALANLAR, başka grubun kenarda bekleyen çubuklarından kesilirken adet sınırını dolaylı aşabilir.
9. Arama rastlantısal: aynı girdide koşudan koşuya birkaç poz ya da çubuk oynayabilir.
10. Baskı: kâğıt çıktısı ve %100 ölçekli bilgisayar denenmedi.

## Dosyalar

```
PanjurKesim.html                       araç (src/'den derlenir, elle düzenlenmez)
README.md                              kullanım, model, tanınan parçalar, Excel sayfaları, baskı düzeni
DURUM.md                               bu dosya
ÖRNEK ÇIKTI - 4 proje birlikte (araç).xlsx
ÖRNEK ÇIKTI - 21542 (araç).xlsx
ÖRNEK ÇIKTI - 24576 kutulu (araç).xlsx
örnek projeler/                        müşteri pozu sütunlu dört gerçek CSV + kutulu örnek (24576 OP.xls)
000000000021542_İmalat.csv / .xlsx     ağırlık sütunlu CSV ve Excel ikizi
İMALAT LİSTESİ.xls                     eski başlıklı düzen (19757)
src/
  optimizer.js    motor: grup derleyici, stok boyu seçimi, en az grup toplamı araması, artık planlayıcı, tavlama, doğrulayıcı
  parser.js       dosya okuma, sütun çıkarımı, parça türleri, proje birleştirme, kısa adlar
  excel-out.js    Excel yazıcı: iki sütunlu sayfalama, baskı ayarları
  app.js          arayüz, paralel worker koşuları (worker yoksa ana iş parçacığı)
  index.html      arayüz şablonu
  build.py        tek dosyalık PanjurKesim.html üretir
  test/           test.js, run-node.js, run.sh, test.html, sandbox.html, türetilmiş deneme projesi 21999
  lib/            SheetJS 0.20.3, ExcelJS 4.4.0
```

Depoda olmayan yerel dosyalar: elle yapılmış eski örnek Excel (müşteri adları içerir; proje
klasöründe ve `src/test/yerel/elle-ornek.xlsx` olarak durur), `src/test/test-output.xlsx`.

## Çalıştırma

```
py src/build.py                                              derle
node src/test/run-node.js "iters=60000&xlsx=1"               bütün testler, tarayıcısız (≈ 25 sn)
bash src/test/run.sh "iters=60000&xlsx=1"                    aynı testler headless Chrome'da (birkaç dakika)
bash src/test/run.sh "only=real4&iters=150000"               dört gerçek proje: ayrı ayrı ve birlikte
bash src/test/run.sh "only=real4all&iters=300000&nocust=1"   dört projenin tam Excel'i
bash src/test/run.sh "only=csv&mat=lamel&iters=300000"       21542'nin tek parçası
```

Sorgu dizgisi iki koşucuda da aynıdır; `minSum=0` kuralı kapatır, `lengths=6500` tek çubuk boyu verir.
`run.sh` takılan koşuyu `TIMEOUT` (varsayılan 420 sn) dolunca kendi başlattığı tarayıcıyla birlikte
sonlandırır. Arayüzde `?debug=1` iç durumu `window.__panjur` olarak açar, `?demo=dosya|dosya`
dosyaları kendiliğinden yükler, `?selftest=1` worker yoluyla küçük bir örnek çözer (http üzerinden).

## Sürüm geçmişi

| Tarih | Değişiklik |
|---|---|
| 11.11 | Grup içi sıra ölçüye göre büyükten küçüğe; "N kenarda" notu, demetteki çubuk sayısı grup başlığında |
| 11.11 | Çubuk boyları 6500 / 5000 / 4700: grup sığdığı en kısa boydan, boy başına çubuk sayısı (sayfa başı, ÖZET, ekran) |
| 11.11 | Kutu, kutu kapağı, köşebent, pano U tanınıyor ve açık geliyor; strafor tanınıyor, kapalı. Kutulu örnek 24576 |
| 11.11 | Çubuk boyları parça başına seçenek + stok adedi (6500 işaretli gelir); stok sınırı motoru (`assignStock`); KALANLAR çubuk tahmini parça bazında yerleştirmeyle |
| 10.11 | En az grup toplamı kuralı (lamel 6250) ve buna göre arama; KALANLAR yalnızca liste + çubuk tahmini |
| 10.11 | Baskı: başlığın kesilmesi düzeltildi (görünüm kaydı), sayfa başına iki sütun, elle sayfa sonları, sabit ölçek, altbilgide sayfa no; notlar kısaldı |
| 10.11 | Kısıtlı çerçeve desteği: worker açılamazsa ana iş parçacığı; SheetJS 0.20.3; Node test koşucusu; GitHub deposu |
| 10.11 | Müşteri pozu sütunlu CSV düzeni; sütunlar içerikten bulunuyor. Birleştirme anahtarı stok kodu + renk oldu. Çubuktan uzun kalem koruması, POZ LİSTESİ'nde müşteri pozu, ayırt edici sayfa adları. Arama süresi poz sayısıyla ölçekleniyor |
| 10.11 | Düzeltme: 2 gruplu küçük projelerde arama sonsuz döngüye giriyordu. Düzeltme: müşteri adı dosya yüklendikten sonra yazılınca satırlara geçmiyordu |
| 10.11 | Her satır tek poz (birleştirme iptal). Adet yakınlığı 1. öncelik. Hazır ayarlar: Dengeli, Adetler tam eşit, Malzeme öncelikli, Adet serbest |
| 15.10 | ERP CSV girdisi, çok proje birleştirme, parça tablosu, öncelik paneli ve karşılaştırma |
| 15.09 | İlk sürüm: motor, Excel çıktısı, arayüz |

## Geliştirme tuzakları

- Kaynakta `\uXXXX` kaçışı yerine `String.fromCharCode` kullanıldı (bazı araçlar kaçışı gerçek
  karaktere çeviriyor). Çok satırlı yamalar dosyaya yazılıp çalıştırılmalı.
- Kayıtlı arayüz ayarları `PARAMS_VERSION` ile sürümlenir (şu an 4); anlamı değişen alan olunca
  artırılmalı. Parça ayarları (`panjur.mats`) `CFG_VERSION` ile sürümlenir (şu an 2); eski sürüm
  kayıtlarında boy seçimi varsayılana döner, `minSum` alanı yoksa varsayılan uygulanır.
- Satır sırası çubuk kullanımını değiştirmez (bekleyen çubuklar hep aynı çubuklardır); artık
  demetleri adet düzeylerinden hesaplanır, derleyici ve doğrulayıcı aynı kuralı kullanır.
- Motor eski "aynı ölçüyü birleştir" yolunu hâlâ destekliyor (`mergeSameLength`), arayüzde kapalı;
  yalnızca birim testlerinde kullanılıyor.
- Sanal zamanlı headless Chrome (`--virtual-time-budget`) ana iş parçacığındaki süreye bağlı aramayı
  bitiremez (saat ilerlemez); gerçek zamanlı deneme için tarayıcı hata ayıklama ucundan sürülmeli.
- Excel'i otomasyonla açarken yalnızca kendi başlattığın gizli örneği kapat; kullanıcının açık
  Excel'ine dokunma.

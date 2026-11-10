# Panjur kesim optimizasyonu — durum

Son güncelleme: 2026-11-10

`PanjurKesim.html`: imalat programının proje dosyalarını (CSV) okuyup lamel, dikme, alt parça ve
tambur borusu için demet kesim planı çıkaran, kurulum ve internet gerektirmeyen tek dosyalık araç.
Kullanım ve model ayrıntısı `README.md` içinde; bu dosya nerede kaldığımızı tutar.

Depo: `github.com/abidcan7/ferrini-panjurkesim` (herkese açık; giriş dosyası kökteki `PanjurKesim.html`).

## Şu an ne durumda

Çalışıyor ve gerçek dosyalarla doğrulandı. 166 kontrolün tamamı hem Node'da hem headless Chrome'da geçiyor.

| Konu | Durum |
|---|---|
| Dosya okuma | Üç düzen de okunuyor (aşağıda) |
| Çok proje | Birden fazla dosya tek havuzda optimize ediliyor |
| Satır düzeni | Her satır tek poz, tam adediyle tek kesim |
| Öncelik | Grup içi adet farkı en çok 4, ideal eşit |
| En az grup toplamı | Lamelde 6250: altında kalan grup yazılmaz, pozları KALANLAR'a bırakılır (10.11) |
| Çıktı | Excel: parça başına sayfa + ÖZET + POZ LİSTESİ + ARTIK PLANI |
| Baskı | A4 dikey, sayfa başına iki sütun, elle sayfa sonları; Excel'in PDF çıktısıyla doğrulandı (10.11) |
| Arayüz | Dosya kartları, parça tablosu (çubuk boyu / demet / en az grup toplamı), öncelik paneli, hazır ayarlar |
| Portal içinde çalışma | Kısıtlı çerçevede (sandbox, `allow-same-origin` yok) ve worker'ları engelleyen politikada denendi |

## Kararlar

| Tarih | Karar |
|---|---|
| 15.09 | Çubuk 6500 mm, testere payı 4 mm, emniyet 5 mm. Demet: lamel 50, dikme 2 (her poz 2 adet), alt parça ve tambur tek tek |
| 15.09 | Demet yalnızca küçülür (kenara ayırma azalarak). KALANLAR artıklardan kesilir; artık stoğu takip edilmez |
| 15.09 | Araç tek HTML dosyası; çıktı Excel, elle yapılan örnekle aynı satır düzeni |
| 15.10 | Girdi imalat programının CSV'si (`0000000000NNNNN_İmalat.csv`); birden fazla proje birlikte atılabilir |
| 10.11 | **1. öncelik adet yakınlığı:** gruptaki adetler 43–39 gibi en çok 4 farklı olabilir, ideal hepsinin eşit olması |
| 10.11 | **Her satır tek poz:** aynı ölçüdeki pozları tek satırda birleştirme yok |
| 10.11 | Birden fazla projenin dosyası birlikte atılıp hep birlikte optimize edilir |
| 10.11 | **Lamelde toplamı 6250'nin (6500'lük çubuk) altında kalan grup yazılmaz**, pozları KALANLAR'a eklenir: 6250 altı optimizasyon anlamsız |
| 10.11 | **Baskı iki sütun:** sayfanın sağ yarısı boş kalmasın |
| 10.11 | Araç ayrı bir GitHub deposunda durur (Poz Çizer gibi), Atlas oradan alır |

Varsayılan ağırlıklar: adet farkı 2 · kesim 10 · çubuk 4 · demet bozma 1 · KALANLAR 12.

## En az grup toplamı kuralı

- Bakılan değer satırların ölçü toplamıdır (Excel'deki toplam satırı; testere payı sayılmaz).
  Sınır parça başınadır: lamelde varsayılan çubuk boyu − 250 (6500 → 6250), diğer parçalarda 0.
  Çubuk boyu değişince sınır kendiliğinden 250 altına çekilir; elle yazılan değer korunur.
- Kural açıkken geçerli grup penceresi dardır: 6250 ≤ Σ ölçü ve Σ(ölçü + 4) ≤ 6495. Motor bu
  pencereye oturan grupları özel bir aramayla kurar (`bestFill`: adet uyumlu pozlar arasında sınırlı
  derinlik-öncelikli arama; `fillFree`: serbest pozlardan grup kurma; `fillIteration`: birkaç grubu
  dağıtıp yeniden kurma). Sınırın altındaki gruplar aramada "bekleme alanı" sayılır, sonuca yazılmaz.
- KALANLAR yalnızca listedir: onlar için yeni çubuk grubu yazılmaz. Kenara ayrılan çubuklardan
  kesilebilenler notta ve ARTIK PLANI'nda görünür. Çubuk tahmini: her poz kendi başına, bir çubuğa
  sığdığı kadar kesilirse (2998 mm → çubuktan 2; 3254 mm → 1).
- Adedi hiçbir pozla uyuşmayan ya da boyu tutmayan pozlar için grup kurulamaz; küçük projede bütün
  pozların KALANLAR'a düşmesi beklenen bir sonuçtur (ekran bunu uyarıyla söyler).

## Girdi düzenleri

Dosyada başlık satırı yok, sütun sayısı hep 7 ama düzen dışa aktarıma göre değişiyor. Bu yüzden
sütunlar sabit konumdan değil içerikten bulunuyor (`parser.js › inferRawColumns`): çapa açıklama
sütunu, solunda stok kodu, sağında renk, sonraki ilk "her satırda tam sayı" sütunu adet, onun sağı ölçü.

| Düzen | Sütunlar | Örnek dosya |
|---|---|---|
| ERP ham, müşteri pozlu | poz · müşteri pozu · stok · açıklama · renk · adet · ölçü | `örnek projeler/` (24714, 23876, 24221, 24543) |
| ERP ham, ağırlıklı | poz · stok · açıklama · renk · adet · ölçü · ağırlık | `000000000021542_İmalat.csv` |
| Başlıklı, bölümlü Excel | Poz no · Referans no · Stok kodu · Açıklama · Renk · Adet · Ölçü | `İMALAT LİSTESİ.xls` (19757) |

- Ölçüde nokta binlik ayırıcı: `1.274` → 1274 mm. Kodlama Windows-1254.
- Parça türü açıklamadan bulunur (lamel, dikme, alt parça, tambur; fitil tanınır ama kapalı gelir).
- Birleştirme anahtarı **stok kodu + renk**; stok kodundaki noktalama yok sayılır (`3224.24` = `322424`).
  Aynı adlı ama stok kodu farklı profiller (P-1301/2072 ile P-1301/3072) ayrı kalır.
- Müşteri pozu doluysa POZ LİSTESİ sayfasına ayrı sütun olarak yazılır.
- Müşteri adı ve tarih dosyada yok; arayüzde elle girilir, proje no bazında hatırlanır.
- Çubuk boyundan uzun kalem (23876'daki 25.000 mm kutu kapağı) plana alınmaz, uyarıyla listelenir.

## Ölçülen sonuçlar

Dört gerçek proje birlikte (24714 + 23876 + 24221 + 24543, toplam 94 poz) —
`ÖRNEK ÇIKTI - 4 proje birlikte (araç).xlsx`:

| Parça | Poz | Grup | Gruplardaki poz | Grup çubuğu | Grup firesi | KALANLAR |
|---|---|---|---|---|---|---|
| Lamel EKO | 88 | 17 | 73 | 684 | %1,7 | 15 poz, 387 parça, ≈ 93 çubuk |
| Lamel STANDART | 6 | 0 | 0 | – | – | 6 poz, 276 parça, ≈ 253 çubuk |
| Dikme | 94 | 34 | 94 | 68 | %10,7 | – (kural yok) |
| Alt parça K.SİZ | 88 | 20 | 88 | 20 | %1,6 | – |
| Alt parça K.Lİ | 6 | 6 | 6 | 6 | %49,8 | – |
| Tambur | 94 | 28 | 94 | 28 | %4,4 | – |

Tek proje 21542 (156 poz, adetler 35–40) — `ÖRNEK ÇIKTI - 21542 (araç).xlsx`: lamelde 37 grup,
154 poz gruplarda, 1.407 çubuk, grup firesi %2,3, 29 grup tam eşit adetli; 2 poz KALANLAR'da
(≈ 18 çubuk). Toplam ≈ 1.425 çubuk, alt sınır 1.394.

Kuralın etkisi (aynı veriler, 60–150 bin iterasyon):

| | Kuralsız çözüp 6250 altını atmak | Kurala göre aramak |
|---|---|---|
| 21542 lamel (156 poz) | 139–140 poz gruplarda | 154 poz gruplarda |
| Dört proje EKO lamel (88 poz) | 60–67 poz gruplarda | 69–73 poz gruplarda |

Kural yokken (eski sonuçlar, karşılaştırma için): dört projede EKO lamel 781 çubuk / 21 grup,
21542 lamel 1.443 çubuk / 38 grup. Elle yapılmış eski örnekte (3 proje, 158 lamel pozu, adet 14–40)
insan 962 çubuk / 184 kesim, araç aynı kurallarla (tek poz, fark ≤ 4, toplam sınırı yok) 958 çubuk / 158 kesim.

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
  (`ExportAsFixedFormat`) ve sayfa sayısını planla karşılaştırmak. İki örnek dosyanın on parça sayfasının onunda da tuttu
  (ekran ölçeği %150, varsayılan yazıcı sürücüsü). Kâğıda basılmış çıktıya ve %100 ölçekli bir
  bilgisayara henüz bakılmadı.

## Atlas'a alma

Atlas dış araçları ayrı depodan günde bir kez eşitliyor ve kısıtlı çerçevede gösteriyor (Poz Çizer
modeli: `sandbox allow-scripts allow-modals allow-downloads`, `allow-same-origin` yok,
`connect-src 'none'`). Bu depo o modele göre hazırlandı:

- Giriş dosyası kökte `PanjurKesim.html`; kendi kendine yeter (dış betik, `assets/`, `lib/` yok),
  2 MB (dosya sınırı 8 MB). SheetJS 0.20.3 (Atlas'ın Poz Çizer'de sabitlediği dosyanın aynısı).
- Kısıtlı çerçevede denendi: `localStorage` kapalı, araç çalışıyor, 8 worker `blob:` adresinden
  açılıyor. Worker'ları yasaklayan politikada (`worker-src 'none'`) ana iş parçacığına düşüp
  doğru sonuç veriyor.
- Atlas tarafında yapılacak iş bu depoda değil: eşitleme bugün yalnızca Poz Çizer için
  tanımlı (depo, dal, giriş dosyası ayarları); ikinci araç için aynı düzeneğin bu depoya
  (`abidcan7/ferrini-panjurkesim`, dal `main`, giriş `PanjurKesim.html`) göre kurulması gerekiyor.
  Araç satır içi betik kullanır (Poz Çizer gibi); paralel arama için politikada `blob:` worker'a
  izin verilirse arama 8 kat hızlanır, verilmezse de çalışır.

## Açık konular

1. **KALANLAR çubuk sayısı tahmindir.** Usta farklı pozları aynı çubukta birleştirirse daha az,
   artıkları değerlendirirse daha da az tutar. Kesin sayı istenirse KALANLAR için ayrı (grupsuz,
   tek tek kesim) bir yerleştirme eklenebilir.
2. **Sınır sabit bir pay (250 mm).** Parça başına değiştirilebiliyor; adetleri dağınık projelerde
   sınırı düşürmek (ör. 6000) daha çok pozu gruba sokar.
3. **STANDART lamel ve K.Lİ alt parça (~3250 mm).** İki parça 6500'lük çubuğa testere payıyla
   sığmıyor (3239 + 3254 + 8 = 6501). Lamelde kural yüzünden hepsi KALANLAR'da; daha uzun çubuk
   boyu varsa parça tablosundan değiştirilebilir.
4. **Çubuğa iki kez sığan uzun parçalar** (kuralın kapalı olduğu parçalarda): "her satır tek poz,
   tam adet" kuralında demet poz adedi kadar çubukla açılıyor. "Bir poz aynı grupta iki satıra
   bölünebilir" seçeneği bunu çözer ama poz iki satırda görünür; varsayılan kapalı.
5. KALANLAR, başka grubun kenara ayrılan çubuklarından kesilirken adet sınırını dolaylı aşabilir.
6. Arama rastlantısal: aynı girdide koşudan koşuya birkaç poz ya da çubuk oynayabilir.
7. Baskı: kâğıt çıktısı ve %100 ölçekli bilgisayar denenmedi (yukarıda).

## Dosyalar

```
PanjurKesim.html                       araç (src/'den derlenir, elle düzenlenmez)
README.md                              kullanım, model, hazır ayarlar, Excel sayfaları, baskı düzeni
DURUM.md                               bu dosya
ÖRNEK ÇIKTI - 4 proje birlikte (araç).xlsx
ÖRNEK ÇIKTI - 21542 (araç).xlsx
örnek projeler/                        müşteri pozu sütunlu dört gerçek CSV
000000000021542_İmalat.csv / .xlsx     ağırlık sütunlu CSV ve Excel ikizi
İMALAT LİSTESİ.xls                     eski başlıklı düzen (19757)
src/
  optimizer.js    motor: grup derleyici, en az grup toplamı araması, artık planlayıcı, tavlama, doğrulayıcı
  parser.js       dosya okuma, sütun çıkarımı, proje birleştirme, kısa adlar
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
node src/test/run-node.js "iters=60000&xlsx=1"               bütün testler, tarayıcısız (≈ 8 sn)
bash src/test/run.sh "iters=60000&xlsx=1"                    aynı testler headless Chrome'da (birkaç dakika)
bash src/test/run.sh "only=real4&iters=150000"               dört gerçek proje: ayrı ayrı ve birlikte
bash src/test/run.sh "only=real4all&iters=300000&nocust=1"   dört projenin tam Excel'i
bash src/test/run.sh "only=csv&mat=lamel&iters=300000"       21542'nin tek parçası
```

Sorgu dizgisi iki koşucuda da aynıdır; `minSum=0` kuralı kapatır. `run.sh` takılan koşuyu `TIMEOUT`
(varsayılan 420 sn) dolunca kendi başlattığı tarayıcıyla birlikte sonlandırır. Arayüzde `?debug=1`
iç durumu `window.__panjur` olarak açar, `?demo=dosya|dosya` dosyaları kendiliğinden yükler,
`?selftest=1` worker yoluyla küçük bir örnek çözer (http üzerinden).

## Sürüm geçmişi

| Tarih | Değişiklik |
|---|---|
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
- Kayıtlı arayüz ayarları `PARAMS_VERSION` ile sürümlenir; öncelik varsayılanı değişince artırılmalı.
  Parça ayarlarında (`panjur.mats`) `minSum` alanı olmayan eski kayıtlara varsayılan uygulanır.
- Motor eski "aynı ölçüyü birleştir" yolunu hâlâ destekliyor (`mergeSameLength`), arayüzde kapalı;
  yalnızca birim testlerinde kullanılıyor.
- Sanal zamanlı headless Chrome (`--virtual-time-budget`) ana iş parçacığındaki süreye bağlı aramayı
  bitiremez (saat ilerlemez); gerçek zamanlı deneme için tarayıcı hata ayıklama ucundan sürülmeli.
- Excel'i otomasyonla açarken yalnızca kendi başlattığın gizli örneği kapat; kullanıcının açık
  Excel'ine dokunma.

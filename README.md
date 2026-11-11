# Panjur Kesim Optimizasyonu

`PanjurKesim.html` — çift tıklayıp açılan, kurulum ve internet gerektirmeyen tek dosyalık araç.
İmalat programından gelen proje dosyalarını okur; lamel, kutu, dikme, alt parça ve tambur borusu için
**demet kesim planı** üretir ve ustanın alıştığı düzende, yazdırılmaya hazır Excel verir.

Nerede kaldığımız, kararlar ve açık konular: `DURUM.md`.

## Kullanım

1. `PanjurKesim.html` dosyasını tarayıcıda açın (Chrome/Edge).
2. Proje dosyalarını sürükleyip bırakın — **birden fazla proje birlikte optimize edilir**:
   - `000000000021542_İmalat.csv` (imalat programının ham çıktısı; proje no dosya adından okunur)
   - aynı yapıdaki `.xlsx`
   - başlıklı, bölümlü Excel (`İMALAT LİSTESİ.xls`, `24576 OP.xls`)
   Aynı proje ikinci kez eklenirse atlanır.
3. **Müşteri adı, tarih ve not** elle girilir — bu bilgiler dosyada yoktur; bir kez girilen bilgiler
   aynı proje no için hatırlanır ve çıktının sağ üst köşesine yazılır.
4. **Parçalar** tablosunda ne kesileceğini seçin. Lamel, dikme, alt parça, tambur ve kutu profilleri
   (kutu, kutu kapağı, köşebent, pano U) otomatik işaretli gelir; fitil, strafor ve tanınmayan
   profiller kapalı gelir. Her parça için **çubuk boyları**, **demet** (tek seferde kesilen en fazla
   adet) ve **en az grup toplamı** ayrı ayrı ayarlanır ve hatırlanır.
5. **Optimize et** → her parça için ilerleme; ardından sonuç tabloları.
6. **Excel indir** → `MÜŞTERİ KESİM PLANI.xlsx`.

## Kesim modeli

- **Her satır tek poz.** Her poz tam adediyle tek satırda, tek kesimde kesilir; aynı ölçüdeki pozları
  tek satırda birleştirme yoktur. Bu yüzden gruplardaki kesim sayısı poz sayısına eşittir.
  (Adedi demet sınırını aşan poz zorunlu olarak dengeli parçalara bölünür: 60 adet, demet 50 → 30 + 30.)
- **Grup** = bir demetle yapılan sıralı kesimler. Demet, gruptaki en büyük adet kadar çubukla açılır
  (≤ demet sınırı). **Satırlar ölçüye göre büyükten küçüğe** sıralanır: uzun parça önce kesilir.
  Adedi demetten az olan satır kesilirken aradaki fark kadar çubuk kenarda bekler ("3 kenarda").
- **1. öncelik — adet yakınlığı.** Bir gruptaki pozların adetleri birbirine yakın olmalıdır: en büyük
  ile en küçük adet arasındaki fark en çok **4** olabilir (43–39 gibi; ayarlanır). İdeal olan
  hepsinin eşit olmasıdır (43/43/43/43); araç sınırın içinde de farkı sıfıra doğru iter.
- Sığma şartı: `Σ ölçü + kesim sayısı × testere payı ≤ çubuk boyu − emniyet payı`.
- **Çubuk boyları (6500, 5000, 4700).** Bir parçanın stokta birden fazla boyu varsa her grup
  **sığdığı en kısa boydan** kesilir; çubuğun maliyeti boyuyla orantılı sayılır. Sonuçta hangi boydan
  kaç çubuk kesileceği yazar ("Çubuk: 6500 × 592 · 5000 × 131") ve her grubun başlığında boyu durur
  ("GRUP 12 · 5000"). Boylar genel ayardan ve parça tablosundan parça başına değiştirilir; bir parça
  yalnızca tek boyda geliyorsa oraya yalnızca o boy yazılır.
- **En az grup toplamı (lamelde 6250).** Bir grubun ölçüleri toplamı (Excel'deki toplam satırı) bu
  değerin altında kalıyorsa o grup gerçek bir optimizasyon değildir: **yazılmaz**, pozları
  KALANLAR'a bırakılır. 6500'lük çubukta varsayılan 6250'dir (çubuk boyu − 250); kısa boylarda aynı
  pay geçerlidir (5000 → 4750, 4700 → 4450). Parça tablosundan parça başına değiştirilir, 0 yazılırsa
  kural kalkar. Dikme, alt parça, tambur ve kutuda varsayılan 0'dır. Araç yalnızca süzmez:
  olabildiğince çok pozu, toplamı bu pencerelere oturan ve adetleri uyumlu gruplara yerleştirecek
  biçimde arar.
- **KALANLAR**: hiçbir gruba giremeyen pozların listesi (sipariş · müşteri · poz · adet · ölçü).
  Usta bunları artıklardan ve gerekirse yeni çubuktan keser. Kenarda bekleyen çubuklardan
  kesilebilenler not sütununda ("artık G12×3") ve ARTIK PLANI sayfasında gösterilir. En az grup
  toplamı kuralı açıkken KALANLAR için ayrıca grup yazılmaz; gereken çubuk yalnızca tahmin edilir
  (her poz kendi başına, en az malzeme harcayan boydan, bir çubuğa sığdığı kadar kesilirse).

### Tanınan parçalar

Parça türü açıklamadan bulunur:

| Tür | Örnek açıklama | Demet | Varsayılan |
|---|---|---|---|
| Lamel | AS 55 EKO ALÜMINYUM LAMEL | 50 | açık, en az grup toplamı 6250 |
| Dikme | DİKMELİ U 62 LIK | 2 | açık |
| Alt parça | ALT PARÇA-55D K.SİZ | 1 | açık |
| Tambur | M.BORUSU SEKİZGEN GALV. 60MM | 1 | açık |
| Kutu | SK-165/ÖN 45 KUTU · SK-165/AR 90 KUTU · KUTU BİTİŞ ALÜMİNYUM | 1 | açık |
| Kutu kapağı | PANJUR KUTU KAPAK 220 MM · PANJUR KUTU ALT KAPAK | 1 | açık |
| Köşebent | KÖŞEBENT 20*40 | 1 | açık |
| Pano U | PANO U 17*17 | 1 | açık |
| Fitil, strafor | FİTİL 67*700 · STRAFOR 220'LİK | 1 | kapalı |

Her stok kodu + renk ayrı bir parçadır (ayrı optimize edilir, ayrı sayfa): kutunun ön (ÖN 45) ve
arka (AR 90) profili, 165 / 180 / 205'lik kutular ve farklı renkler birbirine karışmaz. Bütün pozları
çubuktan uzun olan parça (ör. toplam boy yazılmış kutu kapağı) kapalı gelir.

### Öncelikler ve hazır ayarlar

| Ayar | Adet farkı sınırı | Ne yapar |
|---|---|---|
| **Dengeli** (varsayılan) | ≤ 4 | Eşit adetli grupları tercih eder, çubuğu doldurmak gerekirse 4 farka kadar izin verir |
| **Adetler tam eşit** | 0 | Yalnızca eşit adetli pozlar aynı grupta; uymayanlar KALANLAR'a gider |
| **Malzeme öncelikli** | ≤ 4 | 4 farka kadar serbest: toleransı çubuğu doldurmak için sonuna kadar kullanır |
| **Adet serbest** | yok | Eski düzen: adetleri çok farklı pozlar da aynı gruba girebilir |

Sınırın içindeki dengeyi beş ağırlık kurar: **adet farkı** (her 1 adet fark), **çubuk** (en uzun
boydan bir çubuk; kısa boylar boyuyla orantılı), **demet bozma** (kesim sırasında adedin değiştiği
her geçiş), **KALANLAR** (gruba girmeyen her poz) ve **kesim**. Arayüz girilen değerleri cümlelere
çevirir; **Ağırlıkları karşılaştır** düğmesi en büyük parçayı her hazır ayarla kısa süre çözüp
sonuçları yan yana koyar.

İsteğe bağlı iki kural (varsayılan kapalı): *bir poz aynı grupta iki satıra bölünebilir* (34 → 17 + 17)
ve *poz adedi farklı gruplara bölünebilir*. Çubuk azaltır ama aynı poz birden fazla satırda görünür.

## Birden fazla proje

Yüklenen bütün projeler tek havuzda optimize edilir. Birleştirme anahtarı **stok kodu + renk**tir
(stok kodundaki noktalama yok sayılır: `3224.24` = `322424`):

- aynı stok kodu ve renkteki pozlar hangi projeden gelirse gelsin aynı gruplara girebilir,
- farklı renkler ve farklı profiller (EKO / STANDART lamel, SK-165 / SK-205 kutu) ayrı optimize edilir,
- adı aynı ama stok kodu farklı profiller karışmaz (P-1301/2072 ile P-1301/3072),
- renksiz parçalar (tambur borusu) bütün projelerde tek havuzdur.

Her satırda proje no ve müşteri yazar; POZ LİSTESİ sayfası her projenin her pozunun hangi grupta
olduğunu gösterir (müşteri pozu doluysa o da ayrı sütundur). Havuz büyüdükçe adetleri eşleşen ve
toplamı tutan poz bulmak kolaylaşır. Arama süresi poz sayısıyla orantılıdır: girilen süre 150 poz
içindir, birkaç pozluk projede saniyeler içinde biter, büyük havuzda en çok 4 katına uzar.

## Dosya biçimleri

ERP ham çıktısı başlıksızdır, noktalı virgülle ayrılır (Windows-1254 kodlaması) ve hep 7 sütundur,
ama sütun düzeni dışa aktarıma göre değişir. Görülen iki düzen:

```
1;;TAP.P.SD.V16.55E;AS 55 EKO ALÜMINYUM LAMEL;ANT.GRİ;35;1.664
poz;müşteri pozu;stok kodu;açıklama;renk;adet;ölçü

74;TAP.P.SD.B06.55E;AS 55 EKO ALÜMINYUM LAMEL;BEJ GRİ;39;1.274;6,59932
poz;stok kodu;açıklama;renk;adet;ölçü;ağırlık
```

Bu yüzden sütunlar sabit konumdan değil **içerikten** bulunur: çapa açıklama sütunudur (en uzun,
boşluklu metin), solundaki stok kodu, sağındaki renk, sonraki ilk "her satırda tam sayı" sütunu adet,
onun sağı ölçüdür. Bulunan düzen dosya kartında "Sütunlar: …" olarak yazar. Başlık satırlı Excel
dosyalarında (Poz no · Stok kodu · Açıklama · Renk · Adet · Ölçü; "Kutu", "Lamel" gibi bölüm
başlıklarıyla) sütunlar başlıktan okunur.

Ölçüdeki nokta **binlik ayırıcıdır** (`1.274` → 1274 mm). Ölçüsü olmayan satırlar (motor, kaset,
rulman, tapa, askı, yan kapak…) optimize edilmez; dosya kartında "ölçüsüz" olarak listelenir.
Çubuk boyundan uzun kalemler plana alınmaz, uyarıyla listelenir. Excel dosyalarındaki
`46143 → 1005`, `46296 → 1010` tarih bozulmaları otomatik düzeltilir ve uyarı olarak gösterilir.

## Excel çıktısı

| Sayfa | İçerik |
|---|---|
| LAMEL / DİKME / ALT PARÇA / TAMBUR / KUTU … | Başta boy başına kesilecek çubuk ("Çubuk: 6500 × 592 · 5000 × 131"). Gruplar: başlıkta grup no, kesileceği boy ve demetteki çubuk sayısı ("GRUP 3 · 5000", "46 çubuk"); her satır bir poz (Sipariş · Müşteri · POZ · ADET · ÖLÇÜ), ölçüye göre büyükten küçüğe; "3 kenarda" notu; `=SUM` satırı ve "adetler eşit" / "adet farkı 1"; sonda KALANLAR. Sağ üstte proje bloğu. Aynı türden birden fazla renk ya da profil varsa sayfa adı ayırt edicidir (LAMEL EKO ANT.GRİ, KUTU SK-165 AR 90). |
| ÖZET | Parça başına çubuk boyları, demet, en az grup toplamı, grup sayısı, gruplardaki poz, grup çubuğu (toplam ve boya göre), grup firesi, eşit adetli grup, en çok adet farkı, KALANLAR (poz, parça, tahmini çubuk), toplam çubuk, malzeme (m), fire; parametreler ve projeler. |
| POZ LİSTESİ | Her projenin her pozunun hangi grupta kesildiği ya da KALANLAR'da olduğu (filtrelenebilir). |
| ARTIK PLANI | KALANLAR'dan, kenarda bekleyen çubuklardan kesilebilenler: artık demeti → kesim eşleşmesi. |

### Baskı düzeni

Parça sayfaları A4 dikey ve **sayfa başına iki sütun** basılır: önce sol sütun, sonra sağ sütun dolar,
sonra yeni sayfaya geçilir. Hiçbir grup sütun ya da sayfa arasında bölünmez (uzun KALANLAR listesi
bölünebilir, "KALANLAR (devam)" başlığı alır). Gruplar çubuk boyuna göre uzundan kısaya, sonra
demete göre büyükten küçüğe dizilir. Parça adı her sayfanın başında yinelenir, altbilgide sayfa
numarası vardır. Baskı ölçeği sütun genişliklerinden hesaplanıp dosyaya sabit yazılır; biraz
küçültmek (en çok %85'e kadar) sayfa sayısını azaltıyorsa o ölçek seçilir. Sayfa sonları elle
konduğu için düzen her bilgisayarda aynıdır.

## Örnek sonuçlar

Hepsi varsayılan ayarlarla: üç çubuk boyu (6500 / 5000 / 4700), lamelde en az grup toplamı kuralı.

Dört proje birlikte (24714 + 23876 + 24221 + 24543, 94 poz) —
`ÖRNEK ÇIKTI - 4 proje birlikte (araç).xlsx`:

| Parça | Poz | Grup | Gruplardaki poz | Çubuk (boy × adet) | Grup firesi | KALANLAR |
|---|---|---|---|---|---|---|
| Lamel EKO | 88 | 18 | 74 | 6500 × 592 · 5000 × 131 | %1,4 | 14 poz (≈ 6500 × 64 · 4700 × 22) |
| Lamel STANDART | 6 | 0 | 0 | – | – | 6 poz (≈ 4700 × 230 · 6500 × 23) |
| Dikme | 94 | 37 | 94 | 6500 × 50 · 5000 × 2 · 4700 × 22 | %10,0 | – |
| Alt parça K.SİZ | 88 | 21 | 88 | 6500 × 17 · 5000 × 1 · 4700 × 3 | %1,3 | – |
| Alt parça K.Lİ | 6 | 6 | 6 | 4700 × 6 | %30,6 | – |
| Tambur | 94 | 28 | 94 | 6500 × 25 · 5000 × 1 · 4700 × 2 | %1,6 | – |

Lamel EKO'da 18 grubun 16'sı tam eşit adetli. STANDART lamelin altı pozu da ~3250 mm: iki poz
birlikte hiçbir boya sığmadığı için toplamı sınıra ulaşan grup kurulamaz, hepsi KALANLAR'dadır (her biri
4700'lük çubuktan tek tek kesilirse fire %27; yalnızca 6500 olsaydı %45). Dosyada ayrıca birer
pozluk kutu ve kutu kapağı sayfaları vardır.

21542 numaralı proje (156 poz, lamel adetleri 35–40) — `ÖRNEK ÇIKTI - 21542 (araç).xlsx`:

| Parça | Poz | Grup | Gruplardaki poz | Çubuk (boy × adet) | Grup firesi | KALANLAR | Eşit adetli grup |
|---|---|---|---|---|---|---|---|
| Lamel | 156 | 40 | 156 | 6500 × 1.181 · 5000 × 40 · 4700 × 297 | %2,3 | – | 33 / 40 (en çok fark 1) |
| Dikme | 156 | 52 | 156 | 6500 × 104 | %3,7 | – | 52 / 52 |
| Alt parça | 156 | 38 | 156 | 6500 × 36 · 5000 × 1 · 4700 × 1 | %2,0 | – | 38 / 38 |
| Tambur | 156 | 48 | 156 | 6500 × 45 · 5000 × 2 · 4700 × 1 | %7,7 | – | 48 / 48 |

Çubuk boylarının etkisi (lamel, kural açık): yalnızca 6500 ile 21542'de 156 pozun 154'ü gruba
giriyordu (37 grup, 1.407 çubuk, 2 poz KALANLAR); üç boyla 156'sı da giriyor. Dört projede 73 → 74 poz.
Kuralsız çözüp 6250'nin altındaki grupları sonradan atmak 21542'de yalnızca 139–140 poz bırakırdı.

Kutulu örnek 24576 (4 poz) — `ÖRNEK ÇIKTI - 24576 kutulu (araç).xlsx`: dört kutu profilinin
(SK-165 ve SK-205, ön ve arka) her birinde iki parça tek bir 4700'lük çubuktan çıkıyor. Bu projenin
dört lamel pozu ise (adetler 20 / 24 / 31 / 32) tek başına grup kuramıyor, KALANLAR'da; başka
projelerle birlikte yüklenince gruplara girer.

## Başka bir sayfanın içinde çalıştırma

`PanjurKesim.html` kendi kendine yeten tek dosyadır: dış betik, yazı tipi ya da ağ isteği yoktur,
dosyalar tarayıcıda okunur ve hiçbir yere gönderilmez. Bir portalın içinde kısıtlı çerçevede
(`<iframe sandbox="allow-scripts allow-modals allow-downloads">`, `allow-same-origin` olmadan,
`connect-src 'none'` ile) çalışır:

- `localStorage` kapalıysa ayarlar ve müşteri adları hatırlanmaz (her açılışta varsayılanlar gelir),
  başka bir şey değişmez;
- paralel arama Web Worker'larla yapılır (betik `blob:` adresinden); içerik güvenlik politikası
  bunu engelliyorsa araç aynı aramayı ana iş parçacığında yapar (daha yavaş, sonuç aynı nitelikte);
- Excel indirme için çerçevede `allow-downloads` gerekir.

`src/test/sandbox.html` bu düzeni dener (bir http sunucusu üzerinden açılır).

## Geliştirme

```
PanjurKesim.html   derlenmiş araç (src/'den üretilir, elle düzenlenmez)
src/
  optimizer.js   çekirdek motor (grup derleyici, stok boyu seçimi, en az grup toplamı araması,
                 artık planlayıcı, tavlama benzetimi, doğrulayıcı)
  parser.js      dosya ayrıştırıcı (CSV + Excel, sütun çıkarımı, parça türleri) ve proje birleştirme
  excel-out.js   Excel yazıcı (ExcelJS): iki sütunlu sayfalama, baskı ayarları
  app.js         arayüz, paralel Web Worker koşuları
  index.html     arayüz şablonu (geliştirme için; worker ve dosya okuma için http gerekir)
  build.py       tek dosyalık PanjurKesim.html üretir  →  py src/build.py
  test/test.js       testler (203 kontrol)
  test/run-node.js   tarayıcısız koşucu  →  node src/test/run-node.js "iters=60000&xlsx=1"   (≈ 10 sn)
  test/run.sh        headless Chrome koşucusu  →  bash src/test/run.sh "iters=60000&xlsx=1"
                     "only=real4" dört gerçek projeyi ayrı ve birlikte çözer ·
                     "only=real4all&nocust=1" dört projenin tam Excel'ini yazar ·
                     "only=csv&mat=lamel" 21542'nin tek parçası ·
                     "minSum=0" kuralı kapatır · "lengths=6500" tek çubuk boyu
  test/sandbox.html  kısıtlı çerçevede kendi kendini deneme
  test/000000000021999_İmalat.csv   birleştirme testleri için 21542'den türetilmiş deneme projesi
  lib/           xlsx.full.min.js (SheetJS 0.20.3), exceljs.min.js (4.4.0)
örnek projeler/  müşteri pozu sütunlu dört gerçek proje CSV'si ve kutulu örnek (24576 OP.xls)
```

Arayüz `PanjurKesim.html?selftest=1` ile kendi kendini test eder; `?debug=1` ile iç durum
`window.__panjur` üzerinden okunabilir. Motor eski "aynı ölçüyü birleştir" yolunu hâlâ destekler
(`mergeSameLength`), ama arayüzde kapalıdır ve yalnızca birim testlerinde kullanılır.

Elle yapılmış eski örnek dosya müşteri adları içerdiği için depoda yoktur; yerelde
`src/test/yerel/elle-ornek.xlsx` olarak duruyorsa testler insan çözümüyle karşılaştırmayı da koşar.

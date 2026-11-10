# Panjur Kesim Optimizasyonu

`PanjurKesim.html` — çift tıklayıp açılan, kurulum ve internet gerektirmeyen tek dosyalık araç.
İmalat programından gelen proje dosyalarını okur; lamel, dikme, alt parça ve tambur borusu için
**demet kesim planı** üretir ve ustanın alıştığı düzende, yazdırılmaya hazır Excel verir.

Nerede kaldığımız, kararlar ve açık konular: `DURUM.md`.

## Kullanım

1. `PanjurKesim.html` dosyasını tarayıcıda açın (Chrome/Edge).
2. Proje dosyalarını sürükleyip bırakın — **birden fazla proje birlikte optimize edilir**:
   - `000000000021542_İmalat.csv` (imalat programının ham çıktısı; proje no dosya adından okunur)
   - aynı yapıdaki `.xlsx`
   - elle düzenlenmiş, bölüm başlıklı `İMALAT LİSTESİ.xls`
   Aynı proje ikinci kez eklenirse atlanır.
3. **Müşteri adı, tarih ve not** elle girilir — bu bilgiler dosyada yoktur; bir kez girilen bilgiler
   aynı proje no için hatırlanır ve çıktının sağ üst köşesine yazılır.
4. **Parçalar** tablosunda ne kesileceğini seçin. Lamel / dikme / alt parça / tambur otomatik
   işaretli gelir; fitil ve tanınmayan profiller kapalı gelir. Her parça için **çubuk boyu**,
   **demet** (tek seferde kesilen en fazla adet) ve **en az grup toplamı** ayrı ayrı ayarlanır ve
   hatırlanır.
5. **Optimize et** → her parça için ilerleme; ardından sonuç tabloları.
6. **Excel indir** → `MÜŞTERİ KESİM PLANI.xlsx`.

## Kesim modeli

- **Her satır tek poz.** Her poz tam adediyle tek satırda, tek kesimde kesilir; aynı ölçüdeki pozları
  tek satırda birleştirme yoktur. Bu yüzden gruplardaki kesim sayısı poz sayısına eşittir.
  (Adedi demet sınırını aşan poz zorunlu olarak dengeli parçalara bölünür: 60 adet, demet 50 → 30 + 30.)
- **Grup** = bir demetle yapılan sıralı kesimler. Demet, gruptaki en büyük adetle başlar (≤ demet
  sınırı) ve yalnızca küçülür; adedi daha az olan poza gelince aradaki fark kadar çubuk kenara ayrılır.
- **1. öncelik — adet yakınlığı.** Bir gruptaki pozların adetleri birbirine yakın olmalıdır: en büyük
  ile en küçük adet arasındaki fark en çok **4** olabilir (43–39 gibi; ayarlanır). İdeal olan
  hepsinin eşit olmasıdır (43/43/43/43); araç sınırın içinde de farkı sıfıra doğru iter.
- Sığma şartı: `Σ ölçü + kesim sayısı × testere payı ≤ çubuk boyu − emniyet payı`.
- **En az grup toplamı (lamelde 6250).** Bir grubun ölçüleri toplamı (Excel'deki toplam satırı) bu
  değerin altında kalıyorsa o grup gerçek bir optimizasyon değildir: **yazılmaz**, pozları
  KALANLAR'a bırakılır. 6500'lük çubukta varsayılan 6250'dir (çubuk boyu − 250); parça tablosundan
  parça başına değiştirilir, 0 yazılırsa kural kalkar. Dikme, alt parça ve tamburda varsayılan 0'dır.
  Araç yalnızca süzmez: olabildiğince çok pozu, toplamı 6250 ile çubuk kapasitesi arasına oturan
  ve adetleri uyumlu gruplara yerleştirecek biçimde arar.
- **KALANLAR**: hiçbir gruba giremeyen pozların listesi (sipariş · müşteri · poz · adet · ölçü).
  Usta bunları artıklardan ve gerekirse yeni çubuktan keser. Kenara ayrılan çubuklardan
  kesilebilenler not sütununda ("artık G12×3") ve ARTIK PLANI sayfasında gösterilir. En az grup
  toplamı kuralı açıkken KALANLAR için ayrıca grup yazılmaz; gereken çubuk yalnızca tahmin edilir
  (her poz kendi başına, bir çubuğa sığdığı kadar kesilirse).

### Öncelikler ve hazır ayarlar

| Ayar | Adet farkı sınırı | Ne yapar |
|---|---|---|
| **Dengeli** (varsayılan) | ≤ 4 | Eşit adetli grupları tercih eder, çubuğu doldurmak gerekirse 4 farka kadar izin verir |
| **Adetler tam eşit** | 0 | Yalnızca eşit adetli pozlar aynı grupta; uymayanlar KALANLAR'a gider |
| **Malzeme öncelikli** | ≤ 4 | 4 farka kadar serbest: toleransı çubuğu doldurmak için sonuna kadar kullanır |
| **Adet serbest** | yok | Eski düzen: adetleri çok farklı pozlar da aynı gruba girebilir |

Sınırın içindeki dengeyi beş ağırlık kurar: **adet farkı** (her 1 adet fark), **çubuk** (her tam boy
çubuk), **demet bozma** (her kenara ayırma olayı), **KALANLAR** (gruba girmeyen her poz) ve
**kesim**. Arayüz girilen değerleri cümlelere çevirir; **Ağırlıkları karşılaştır** düğmesi en büyük
parçayı her hazır ayarla kısa süre çözüp sonuçları yan yana koyar.

İsteğe bağlı iki kural (varsayılan kapalı): *bir poz aynı grupta iki satıra bölünebilir* (34 → 17 + 17)
ve *poz adedi farklı gruplara bölünebilir*. Çubuk azaltır ama aynı poz birden fazla satırda görünür.

## Birden fazla proje

Yüklenen bütün projeler tek havuzda optimize edilir. Parça türü (lamel, dikme…) açıklamadan
belirlenir; birleştirme anahtarı **stok kodu + renk**tir (stok kodundaki noktalama yok sayılır:
`3224.24` = `322424`):

- aynı stok kodu ve renkteki pozlar hangi projeden gelirse gelsin aynı gruplara girebilir,
- farklı renkler ve farklı profiller (EKO / STANDART lamel) ayrı optimize edilir (ayrı sayfa),
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
onun sağı ölçüdür. Bulunan düzen dosya kartında "Sütunlar: …" olarak yazar.

Ölçüdeki nokta **binlik ayırıcıdır** (`1.274` → 1274 mm). Ölçüsü olmayan satırlar (motor, kaset,
rulman, tapa, askı…) optimize edilmez; dosya kartında "ölçüsüz" olarak listelenir. Çubuk boyundan
uzun kalemler (ör. 25.000 mm toplam boy yazılmış kutu kapağı) plana alınmaz, uyarıyla listelenir.
Eski Excel dosyalarındaki `46143 → 1005` tarih bozulmaları otomatik düzeltilir ve uyarı olarak gösterilir.

## Excel çıktısı

| Sayfa | İçerik |
|---|---|
| LAMEL / DİKME / ALT PARÇA / TAMBUR … | Gruplar: her satır bir poz (Sipariş · Müşteri · POZ · ADET · ÖLÇÜ), `=SUM` satırı, kısa notlar ("40 çubuk", "1 kenara → 39", "adetler eşit" / "adet farkı 1"); sonda KALANLAR. Sağ üstte proje bloğu. Aynı türden birden fazla renk ya da profil varsa sayfa adı ayırt edicidir (LAMEL EKO / LAMEL STANDART). |
| ÖZET | Parça başına çubuk boyu, demet, en az grup toplamı, grup sayısı, gruplardaki poz, grup çubuğu ve firesi, eşit adetli grup, en çok adet farkı, KALANLAR (poz, parça, tahmini çubuk), toplam çubuk, alt sınır; parametreler ve projeler. |
| POZ LİSTESİ | Her projenin her pozunun hangi grupta kesildiği ya da KALANLAR'da olduğu (filtrelenebilir). |
| ARTIK PLANI | KALANLAR'dan, kenara ayrılan çubuklardan kesilebilenler: artık demeti → kesim eşleşmesi. |

### Baskı düzeni

Parça sayfaları A4 dikey ve **sayfa başına iki sütun** basılır: önce sol sütun, sonra sağ sütun dolar,
sonra yeni sayfaya geçilir. Hiçbir grup sütun ya da sayfa arasında bölünmez (uzun KALANLAR listesi
bölünebilir, "KALANLAR (devam)" başlığı alır). Parça adı her sayfanın başında yinelenir, altbilgide
sayfa numarası vardır. Baskı ölçeği sütun genişliklerinden hesaplanıp dosyaya sabit yazılır; biraz
küçültmek (en çok %85'e kadar) sayfa sayısını azaltıyorsa o ölçek seçilir. Sayfa sonları elle
konduğu için düzen her bilgisayarda aynıdır.

## Örnek sonuçlar

Dört proje birlikte (24714 + 23876 + 24221 + 24543, 94 poz) —
`ÖRNEK ÇIKTI - 4 proje birlikte (araç).xlsx`:

| Parça | Poz | Grup | Gruplardaki poz | Grup çubuğu | Grup firesi | KALANLAR |
|---|---|---|---|---|---|---|
| Lamel EKO | 88 | 17 | 73 | 684 | %1,7 | 15 poz (≈ 93 çubuk) |
| Lamel STANDART | 6 | 0 | 0 | – | – | 6 poz (≈ 253 çubuk) |
| Dikme | 94 | 34 | 94 | 68 | %10,7 | – |
| Alt parça K.SİZ | 88 | 20 | 88 | 20 | %1,6 | – |
| Alt parça K.Lİ | 6 | 6 | 6 | 6 | %49,8 | – |
| Tambur | 94 | 28 | 94 | 28 | %4,4 | – |

Lamel EKO'da 17 grubun 13'ü tam eşit adetli, en küçük grup toplamı 6.322. STANDART lamelin altı
pozu da ~3250 mm: iki parça bir çubuğa sığmadığı için toplamı 6250'ye ulaşan grup kurulamaz,
hepsi KALANLAR'dadır. Aynı lamelin kuralsız bir çözümünde 21 grubun 6'sının toplamı 6250'nin
altındaydı (en küçüğü 564).

21542 numaralı proje (156 poz, lamel adetleri 35–40) — `ÖRNEK ÇIKTI - 21542 (araç).xlsx`:

| Parça | Poz | Grup | Gruplardaki poz | Grup çubuğu | Grup firesi | KALANLAR | Eşit adetli grup |
|---|---|---|---|---|---|---|---|
| Lamel | 156 | 37 | 154 | 1.407 | %2,3 | 2 poz (≈ 18 çubuk) | 29 / 37 (en çok fark 2) |
| Dikme | 156 | 52 | 156 | 104 | %3,7 | – | 52 / 52 |
| Alt parça | 156 | 38 | 156 | 38 | %3,3 | – | 38 / 38 |
| Tambur | 156 | 48 | 156 | 48 | %9,1 | – | 48 / 48 |

Lamelde toplam ≈ 1.425 çubuk (alt sınır 1.394). Aynı proje kuralsız çözülüp 6250'nin altındaki
gruplar sonradan atılsaydı 156 pozun 139–140'ı gruplarda kalırdı; kurala göre arayınca 154.

## Başka bir sayfanın içinde çalıştırma

`PanjurKesim.html` kendi kendine yeten tek dosyadır: dış betik, yazı tipi ya da ağ isteği yoktur,
dosyalar tarayıcıda okunur ve hiçbir yere gönderilmez. Bir portalın içinde kısıtlı çerçevede
(`<iframe sandbox="allow-scripts allow-modals allow-downloads">`, `allow-same-origin` olmadan,
`connect-src 'none'` ile) çalışır:

- `localStorage` kapalıysa ayarlar ve müşteri adları hatırlanmaz, başka bir şey değişmez;
- paralel arama Web Worker'larla yapılır (betik `blob:` adresinden); içerik güvenlik politikası
  bunu engelliyorsa araç aynı aramayı ana iş parçacığında yapar (daha yavaş, sonuç aynı nitelikte);
- Excel indirme için çerçevede `allow-downloads` gerekir.

`src/test/sandbox.html` bu düzeni dener (bir http sunucusu üzerinden açılır).

## Geliştirme

```
PanjurKesim.html   derlenmiş araç (src/'den üretilir, elle düzenlenmez)
src/
  optimizer.js   çekirdek motor (grup derleyici, en az grup toplamı araması, artık planlayıcı,
                 tavlama benzetimi, doğrulayıcı)
  parser.js      dosya ayrıştırıcı (CSV + Excel, sütun çıkarımı) ve proje birleştirme (mergeProjects)
  excel-out.js   Excel yazıcı (ExcelJS): iki sütunlu sayfalama, baskı ayarları
  app.js         arayüz, paralel Web Worker koşuları
  index.html     arayüz şablonu (geliştirme için; worker ve dosya okuma için http gerekir)
  build.py       tek dosyalık PanjurKesim.html üretir  →  py src/build.py
  test/test.js       testler (166 kontrol)
  test/run-node.js   tarayıcısız koşucu  →  node src/test/run-node.js "iters=60000&xlsx=1"   (≈ 8 sn)
  test/run.sh        headless Chrome koşucusu  →  bash src/test/run.sh "iters=60000&xlsx=1"
                     "only=real4" dört gerçek projeyi ayrı ve birlikte çözer ·
                     "only=real4all&nocust=1" dört projenin tam Excel'ini yazar ·
                     "only=csv&mat=lamel" 21542'nin tek parçası · "minSum=0" kuralı kapatır
  test/sandbox.html  kısıtlı çerçevede kendi kendini deneme
  test/000000000021999_İmalat.csv   birleştirme testleri için 21542'den türetilmiş deneme projesi
  lib/           xlsx.full.min.js (SheetJS 0.20.3), exceljs.min.js (4.4.0)
örnek projeler/  müşteri pozu sütunlu dört gerçek proje CSV'si
```

Arayüz `PanjurKesim.html?selftest=1` ile kendi kendini test eder; `?debug=1` ile iç durum
`window.__panjur` üzerinden okunabilir. Motor eski "aynı ölçüyü birleştir" yolunu hâlâ destekler
(`mergeSameLength`), ama arayüzde kapalıdır ve yalnızca birim testlerinde kullanılır.

Elle yapılmış eski örnek dosya müşteri adları içerdiği için depoda yoktur; yerelde
`src/test/yerel/elle-ornek.xlsx` olarak duruyorsa testler insan çözümüyle karşılaştırmayı da koşar.

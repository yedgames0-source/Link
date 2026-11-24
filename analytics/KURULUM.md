# Yedek ziyaretçi paneli (ücretsiz)

Cloudflare Workers + D1 ücretsiz planıyla çalışır. Kredi kartı gerekmez.
Günde 100.000 isteğe kadar ücretsizdir. Sınır aşılırsa para çekilmez, sayaç o gün durur.

## Dosyalar
- `worker.js`: sayaç ve şifreli admin paneli (tek dosya)
- `sayac-satiri.html`: siteye eklenecek satır (şimdilik EKLENMEDİ)

## Kurulum (Cloudflare panelinden, program kurmadan)
1. dash.cloudflare.com → **Storage & Databases → D1** → **Create database**. Adı: `yed-analytics`.
2. **Workers & Pages → Create → Create Worker**. Adı: örneğin `yed-sayac`. **Deploy**.
3. **Edit code**: içindeki her şeyi sil, `worker.js` içeriğini yapıştır, **Deploy**.
4. Worker'ın **Settings → Bindings → Add → D1 database**: Variable name `DB`, veritabanı `yed-analytics`.
5. **Settings → Variables and Secrets → Add**: tip **Secret**, adı `ADMIN_PASSWORD`, değeri kendi şifren.
6. `sayac-satiri.html` içindeki `WORKER_ADRESI` kısmını Worker adresinle değiştir ve satırı index.html'de `</body>`'nin üstüne ekle.

## Panel
`https://<worker-adresin>.workers.dev/admin`
Kullanıcı adı: `admin` (aslında ne yazdığın önemli değil), şifre: `ADMIN_PASSWORD`.
Gösterilenler: bugünkü ve seçili dönemdeki ziyaretçi, sayfa görüntüleme, günlük grafik, ülkeler, nereden gelindiği, cihaz (mobil/masaüstü).

Çerez kullanmaz, IP adresi saklanmaz.

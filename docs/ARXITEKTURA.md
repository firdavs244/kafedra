# Arxitektura: «Dalildan boshqaruv harakatiga»

```
Ma'lumot manbalari (Word, Excel, PDF, HEMIS eksporti*)
 ↓  importer.py — fayllarni o'qish
Ma'lumotlarni tekshirish (analytics.quality_issues, claims_check)
 ↓
Dalillar ombori (reyestr + PDF)  ·  Bilimlar bazasi (hujjat bo'laklari + metama'lumot: kirish huquqi, egasi, sanasi, manbasi)
 ↓
Foydalanuvchi → shaxsni aniqlash → huquqni tekshirish → faqat ruxsat etilgan ma'lumot
 ↓
Ma'lumot qidirish: BM25 → ruxsat filtri → qayta saralash (savolni qamrash darajasi, sarlavha, ibora, oy)
 ↓
Sun'iy intellekt tahlili: so'rov turini aniqlash, hisoblash, xavfni aniqlash (ixtiyoriy: Claude)
 ↓
Javob sifati nazorati: manba ✓ · ruxsat ✓ · dalil ✓ → aks holda «Yetarli tasdiqlangan ma'lumot topilmadi»
 ↓
Tushuntiriladigan xulosa (javob izi) → Tavsiya → Vazifa → Mas'ul → Muddat → Nazorat → Hisobot (inson tasdig'i)
```
\* HEMIS: integratsiya faqat ruxsat etilgan API yoki ma'lumotlarga kirish huquqi asosida.

## Hisoblash formulalari
- Faoliyat ko'rsatkichi = tasdiqlangan ball / maksimal ball × 100. Har bir element o'z maksimal bali bilan cheklanadi (D04).
- To'liqlik = to'ldirilgan majburiy maydonlar / jami majburiy maydonlar × 100.
- Dalillar bilan qamrab olinganlik = tasdiqlangan dalili bor ko'rsatkich elementlari / jami elementlar × 100.
- Ma'lumot yangiligi = oxirgi 30 kunda yangilangan manbalar / jami manbalar × 100.
- Ma'lumot sog'lomligi = (to'liqlik + qamrab olinganlik + yangilik) / 3.
- Erta ogohlantirish: qizil — reja bajarilishi 50% dan past va qolgan muddat 30 kun yoki kamroq, yoki vazifa muddati o'tgan. Sariq — 30 kundan ortiq rivojlanish yo'q, ko'rsatkich 35% dan past yoki yuklama me'yordan yuqori.
- Holat xaritasidagi har bir rang qoidasi interfeysda ko'rsatiladi (yo'nalishni bosing).

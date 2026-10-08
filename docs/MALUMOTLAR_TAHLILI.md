# Siz yuborgan ma'lumotlar paketining tahlili

KafedraAgent `data/manba/` papkasidagi fayllarni import qilib, quyidagi nomuvofiqliklarni avtomatik aniqladi.
Tizim ularni o'zgartirmaydi. Har biri «Tekshirish talab qilinadi» holatida turadi va vakolatli shaxs tomonidan aniqlashtirilishi kerak.

**Asosiy ma'lumot manbasi:** `03_KPI/KPI_va_Evidence_reyestri_DEMO.xlsx` (41 ta dalil: 39 tasdiqlangan, 1 kutilmoqda, 1 rad etilgan). Faoliyat ko'rsatkichlari shu reyestrdan hisoblanadi.

## 1. Hisobotlardagi raqamlar ↔ Excel reyestri

| Hujjat | Ko'rsatkich | Hujjatda | Reyestrda | Holat |
|---|---|---|---|---|
| D19 — AI Auditor — hisobot va dalillarni solishtirish | Tasdiqlangan maqolalar | 10 | 11 | Tekshirish talab qilinadi |
| D19 — AI Auditor — hisobot va dalillarni solishtirish | Kutilayotgan maqolalar | 2 | 1 | Tekshirish talab qilinadi |
| H15 — AI auditor hisoboti (07.10.2026) | Tasdiqlangan maqolalar | 10 | 11 | Tekshirish talab qilinadi |
| H18 — Ilmiy nashrlar hisoboti (2026-yil) | Tasdiqlangan maqolalar | 10 | 11 | Tekshirish talab qilinadi |
| H18 — Ilmiy nashrlar hisoboti (2026-yil) | Kutilayotgan maqolalar | 2 | 1 | Tekshirish talab qilinadi |
| H20 — Kafedra rahbari uchun boshqaruv hisoboti (07.10.2026) | Tasdiqlangan maqolalar | 10 | 11 | Tekshirish talab qilinadi |
| H06 — O‘qituvchilar faoliyati hisoboti (oktabr 2026) | Aliyev B. faoliyat ko'rsatkichi, % | 20 | 36 | Tekshirish talab qilinadi — 20% — ilmiy reja bajarilishi (1/5) bilan mos keladi; faoliyat ko'rsatkichi bilan aralashtirilgan bo'lishi mumkin |
| H06 — O‘qituvchilar faoliyati hisoboti (oktabr 2026) | Yusupov J. faoliyat ko'rsatkichi, % | 20 | 20 | Mos |
| H20 — Kafedra rahbari uchun boshqaruv hisoboti (07.10.2026) | Aliyev B. faoliyat ko'rsatkichi, % | 20 | 36 | Tekshirish talab qilinadi — 20% — ilmiy reja bajarilishi (1/5) bilan mos keladi; faoliyat ko'rsatkichi bilan aralashtirilgan bo'lishi mumkin |
| H20 — Kafedra rahbari uchun boshqaruv hisoboti (07.10.2026) | Yusupov J. faoliyat ko'rsatkichi, % | 20 | 20 | Mos |
| H07 — Evidence holati hisoboti (07.10.2026) | Jami dalillar | 41 | 41 | Mos |
| H07 — Evidence holati hisoboti (07.10.2026) | Tasdiqlangan dalillar | 39 | 39 | Mos |
| H07 — Evidence holati hisoboti (07.10.2026) | Kutilayotgan dalillar | 1 | 1 | Mos |
| H07 — Evidence holati hisoboti (07.10.2026) | Rad etilgan dalillar | 1 | 1 | Mos |
| H21 — Kafedra haftalik hisoboti (qisqa namuna) | Kutilayotgan dalillar | 2 | 1 | Tekshirish talab qilinadi |
| H08 — Grant loyihalari hisoboti (2026-yil) | Tasdiqlangan grantlar | 2 | 2 | Mos |
| H09 — Konferensiya va seminarlar hisoboti (2026-yil) | Tasdiqlangan konferensiyalar | 7 | 7 | Mos |
| H10 — Patent va dasturiy mahsulotlar hisoboti (2026-yil) | Patent/dasturiy guvohnomalar | 1 | 1 | Mos |

## 2. Yillik hisobot (D06) ↔ tasdiqlangan dalillar

| Ko'rsatkich | Hisobot | Tasdiqlangan | Holat |
|---|---|---|---|
| Ilmiy maqolalar | 12 | 11 | Tekshirish kerak |
| Konferensiya ma'ruzalari | 7 | 7 | Mos |
| Grant loyihalari | 3 | 2 | Mos emas |
| Patent va dasturiy guvohnomalar | 1 | 1 | Mos |

## 3. Ma'lumot sifati nazoratchisi topilmalari

| Turi | Obyekt | Tafsilot |
|---|---|---|
| Takroriy hujjat | D23 ↔ D06 | «Yillik hisobot 2025–2026 (qisqa namuna)» mazmunining 80% qismi «Kafedraning 2025–2026 o‘quv yili yillik hisoboti» da bor |
| Takroriy hujjat | D18 ↔ H14 | «Data Health va Data Lineage — kafedra ma’lumotlari» mazmunining 82% qismi «Data health hisoboti (07.10.2026)» da bor |
| Takroriy hujjat | D23 ↔ H02 | «Yillik hisobot 2025–2026 (qisqa namuna)» mazmunining 70% qismi «Oylik kafedra hisoboti (sentabr 2026)» da bor |
| Takroriy hujjat | D23 ↔ H04 | «Yillik hisobot 2025–2026 (qisqa namuna)» mazmunining 75% qismi «Ilmiy-tadqiqot faoliyati hisoboti (2025–2026 o‘quv yili)» da bor |
| Takroriy dalil | Dalil #15 | «Adaptiv o‘qitish tizimlarida tavsiya algoritmlari — qayta yuklangan dublikatmi?» — dalil #13 bilan bir xil DOI/sarlavha |
| Hisobot asosiy ma'lumotga mos emas | Ilmiy maqolalar (D06) | Hisobotda 12, tasdiqlangan dalil 11 |
| Hisobot asosiy ma'lumotga mos emas | Grant loyihalari (D06) | Hisobotda 3, tasdiqlangan dalil 2 |
| Hisobot asosiy ma'lumotga mos emas | Tasdiqlangan maqolalar (D19) | Hujjatda 10, reyestr bo'yicha 11 |
| Hisobot asosiy ma'lumotga mos emas | Kutilayotgan maqolalar (D19) | Hujjatda 2, reyestr bo'yicha 1 |
| Hisobot asosiy ma'lumotga mos emas | Tasdiqlangan maqolalar (H15) | Hujjatda 10, reyestr bo'yicha 11 |
| Hisobot asosiy ma'lumotga mos emas | Tasdiqlangan maqolalar (H18) | Hujjatda 10, reyestr bo'yicha 11 |
| Hisobot asosiy ma'lumotga mos emas | Kutilayotgan maqolalar (H18) | Hujjatda 2, reyestr bo'yicha 1 |
| Hisobot asosiy ma'lumotga mos emas | Tasdiqlangan maqolalar (H20) | Hujjatda 10, reyestr bo'yicha 11 |
| Hisobot asosiy ma'lumotga mos emas | Aliyev B. faoliyat ko'rsatkichi, % (H06) | Hujjatda 20, reyestr bo'yicha 36. 20% — ilmiy reja bajarilishi (1/5) bilan mos keladi; faoliyat ko'rsatkichi bilan aralashtirilgan bo'lishi mumkin |
| Hisobot asosiy ma'lumotga mos emas | Aliyev B. faoliyat ko'rsatkichi, % (H20) | Hujjatda 20, reyestr bo'yicha 36. 20% — ilmiy reja bajarilishi (1/5) bilan mos keladi; faoliyat ko'rsatkichi bilan aralashtirilgan bo'lishi mumkin |
| Hisobot asosiy ma'lumotga mos emas | Kutilayotgan dalillar (H21) | Hujjatda 2, reyestr bo'yicha 1 |
| Yuklama me'yordan oshgan | Rahimov S. | 1610 soat > 1540 soat (D07) |
| Yuklama me'yordan oshgan | Qodirov A. | 1580 soat > 1540 soat (D07) |

## 4. Boshqa kuzatuvlar

- `Yusupov_J__Kompyuter_tarmoqlarida_xavfsizlik_DEMO.pdf` faylida «Holat: Tasdiqlangan», «Tasdiqlovchi: Rad etilgan» deb yozilgan. Reyestrda esa dalil **rad etilgan**. Tizim reyestrga tayanadi, PDF faylni tuzatish tavsiya etiladi.
- Excel reyestrda Yusupov J.ning «Dasturiy guvohnoma» dalili «Grant» turida turibdi. Tizim uni sarlavhasi bo'yicha **patent/dasturiy guvohnoma** deb hisobladi (D06 jadvalidagi «Patent va dasturiy guvohnomalar» qatoriga mos).
- Excel reyestrda tasdiqlovchi ko'rsatilmagan. Tasdiqlovchi (Rasulov A.) PDF fayllardan olindi.
- Hisobotlarda inglizcha atamalar bor (Evidence, Data Health, AI Auditor, Scientific articles, pending). Ular sizning hujjat matningiz bo'lgani uchun o'zgartirilmadi. Tizim interfeysi esa to'liq o'zbekcha.

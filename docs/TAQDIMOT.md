# Taqdimot: tekshiruv ro'yxati, slaydlar tanqidi, hakamlar savollari

Asosiy qoida: **slayddagi har bir da'vo ilovada ko'rsatib berilishi mumkin bo'lishi kerak.**
Bo'lmasa — slayd o'zgaradi, ilova emas.

## 1. Taqdimotdan oldin (tartib bilan)

**Bir kun oldin**
- [ ] Yangi Groq kaliti (eski kalit 1 kunlik edi): console.groq.com/keys → Vercel → Settings →
      Environment Variables → `GROQ_API_KEY` ni yangilang → Deployments → Redeploy.
- [ ] `https://<sayt>/api/health?ping=1` → `keyConfigured: true`, `primary: true`, `fallback: true`.
- [ ] Iloji bo'lsa Groq **Dev tier**ga o'ting (karta kerak, xarajat sentlar): bepul tarifda butun zal
      bitta kalitni bo'lishadi — daqiqasiga ~2–3 savoldan keyin agent kutishga tushadi.
- [ ] Ikkinchi zaxira kalit (boshqa Groq akkaunt) — Sozlamalar → «Zaxira Groq API kaliti».
- [ ] 1–2 daqiqalik demo video yozib qo'ying (internet uzilsa).

**Taqdimot kuni ertalab**
- [ ] Saytni oching → Sozlamalar → **Namunani qayta tiklash** (sana bugunga moslanadi).
- [ ] **Agent sifati** → To'liq o'lchov (3–6 daqiqa). Natijani (sana, model bilan) 7-slaydga yozing.
- [ ] Tez so'rovlar panelidagi 4–5 savolni bir marta bosib chiqing — javoblar keshlanadi va taqdimotda
      darhol chiqadi (belgi: «keshdan»).
- [ ] Telefonda ham oching (QR kod asosiy manzilga: `ai-agent-ashy-theta.vercel.app`, uzun
      `…-xolovfirdavs9-…vercel.app` manzili himoyalangan — uni tarqatmang).

## 2. Slaydlar — tuzatish shart

> 2026-09-30: yangi 16 slaydli taqdimot tayyorlandi (claude.ai artifact, «KafedraAgent — taqdimot»):
> barcha raqamlar o'lchangan (17/17, 2,1 s, 5 ms, 24/24, 76 test), skrinshotlar jonli saytdan.
> Pastdagi jadval — eski PDF taqdimot uchun tanqid.

| Slayd | Muammo | Nima qilish |
|---|---|---|
| 1 | «Ilmiy rahbar: ____» bo'sh | To'ldiring yoki olib tashlang |
| 2 | 60%, «3–5 kun», «700+» — manbasi yo'q | Kichik so'rovnoma o'tkazing yoki «kafedra xodimlari bilan suhbat asosida, taxminan» deb yozing. Ilovada kontingent 670 talaba |
| 4 | «[1-analog nomi]», «[2-analog nomi]» to'ldirilmagan | «Excel / qog'oz jurnallar» va «HEMIS (hemis.uz)» |
| 5 | Texnologiyalar ilovaga mos emas: Django/DRF, PostgreSQL, Redis, Docker, Nginx, Scikit-learn, Transformers, «70/15/15», «epoch» | Haqiqiy stek: **React + Vite, Vercel Serverless, Groq API (Qwen 3.8 — matn/vosita/rasm, GPT-OSS-120B — zaxira, Whisper — ovoz), function calling, SheetJS, docx**. Model o'qitilmagan — «o'qitish» bloki o'rniga «Sifat o'lchovi: nazorat savollari» |
| 7 | «Aniqlik 92%», «6 sinf», «1200 ta sinalgan», «4 dala sinovi», «confusion matrix» — o'lchanmagan; «Rasmlar soni», «Sinflar» — rasm-klassifikatsiya shablonidan qolgan | O'lchangan raqamlar: `/sifat` natijasi (N/17 to'g'ri, o'rtacha X s, sana, model), 72 ta avtomatik test, qaydnoma rasmidan 24/24 qator. **Hakam «confusion matrix'ni ko'rsating» desa — ko'rsata olmaysiz** |
| 8 | «Sog'lom barg» — o'simlik kasalligi loyihasi shablonidan qolgan; «Makamlarga» — imlo | «Hisobotni saqlash»; «Hakamlarga». Maket rasmlar o'rniga ilovaning real skrinshotlari |
| 6 | Maketdagi raqamlar (28 o'qituvchi, 420 talaba, 36 fan, 12 guruh) ilovadan farq qiladi | Real skrinshot (18 / 670 / 23 / 25) |
| 10 | GitHub havolasi | `github.com/firdavs244/kafedra` (yoki qaysi biri asosiy bo'lsa) + sayt QR |

## 3. Jonli namoyish (2 daqiqa)

| Vaqt | Nima ko'rsatiladi | Qayerda |
|---|---|---|
| 0:00 | Bosh sahifa: 4 ko'rsatkich, «Diqqat talab qiladi», bugungi davomat | `/` |
| 0:20 | Hujjat tahlili: «Yakuniy nazorat qaydnomasi» namunasi → 3 s da 24 talaba, qarzdorlar, «tizimda 76% → rasmdan 83%» | `/hujjat` |
| 0:50 | AI agent: «Bu oy qaysi KPI bandlari bajarilmagan?» → jadval + «Manbalar» + tavsiyalar | `/agent` |
| 1:20 | Hisobot: Oylik hisobot → AI xulosa → **Word** yuklab olish | `/hisobotlar` |
| 1:40 | Tarix + Agent sifati (o'lchangan natija) | `/hisobotlar`, `/sifat` |

Vaqt qolsa: Yuklama → «Namuna reja» Excel yuklash → Avtomatik taqsimlash → «≈2 stavka yetishmaydi».

## 4. Hakamlar savollari — tayyor javoblar

- **«AI xato qilsa yoki raqam to'qisa-chi?»** — Raqamlarni AI hisoblamaydi: savolga qarab tizim
  vositasini chaqiradi, raqam koddan keladi; javob tepasida «Manbalar» ko'rinadi. «Agent sifati»
  sahifasida o'lchaymiz, «maosh» kabi yo'q ma'lumot so'ralsa «ma'lumot yo'q» deyishi ham tekshiriladi.
- **«Ma'lumotlar qayerda saqlanadi?»** — Namuna rejimida brauzerda (har foydalanuvchi o'z nusxasi).
  Ishlab chiqarishda universitet serveridagi bazaga ulanadi — saqlash qatlami alohida modul.
- **«HEMIS bilan bog'lanadimi?»** — Hozir HEMIS/Excel eksportlarini import qiladi; to'g'ridan-to'g'ri
  API — universitet ruxsati bilan keyingi bosqich.
- **«Internet bo'lmasa?»** — AI'dan boshqa barcha bo'limlar ishlaydi; AI uchun internet kerak.
- **«Nega o'z modelingizni o'qitmadingiz?»** — Vazifa tasniflash emas, tahlil va tushuntirish. Tayyor
  katta til modeli + tekshiriladigan vositalar aniqroq va har bir raqamni kuzatish mumkin.
- **«Xavfsizlik?»** — API kalit faqat serverda; AI yozuvni o'zi o'zgartirmaydi — faqat taklif,
  tasdiq mudirda; namunadagi ismlar to'qima.
- **«Narxi?»** — Groq bepul tarifi (limit bilan), Vercel bepul tarifi. Kafedra uchun oyiga bir necha dollar.
- **«O'zbek tilida qanday ishlaydi?»** — Qwen o'zbekcha javob beradi; ovoz — Whisper (o'zbek tili).

## 5. Ma'lum xavflar

- Bepul Groq limiti: bir vaqtda ko'p savol → «limit, N soniya kutilmoqda» (zaxira modelga o'tadi).
- Ovozli so'rov (Whisper) shovqinli zalda xato tanishi mumkin — matn bilan ham ko'rsating.
- Namuna ma'lumotlar brauzerda: hakam telefonida o'zgartirsa, sizning ekraningizda ko'rinmaydi.

# AGENTS.md — KafedraAgent ustida qanday ishlash

> Hujjat eskirishi mumkin: **ishlayotgan kod va testlar haq**. Ziddiyat bo'lsa — hujjatni tuzating.

## 0. TUZATILGAN QOIDALAR (jurnal — faqat qo'shiladi, o'chirilmaydi)

Firdavs'ning OnlyAlpha jurnalidan shu loyihaga o'tkazilganlari:

- **0.1 Butun so'rovni o'qing.** Har bir so'ralgan narsani alohida punkt qiling; javob oxirida nima qolganini ayting.
- **0.2 Reja kod yozishdan oldin ko'rinsin** (`docs/REJA.md`). Bitta puxta qadam — hammasini yuzaki qilgandan afzal.
- **0.3 G'oyani so'zma-so'z emas, NIYAT bo'yicha bajaring.** Keraksizini kesing (sababini ayting), keraklisini boyiting.
- **0.4 Oldin o'lchang, keyin quring.** Xarajat arifmetikasi birinchi (Groq limitlari — pastda).
- **0.5 Har bir cheklov — DA'VO.** "Model yo'q", "API bermaydi", "limit" — 3–5 muqobilni sinamay aytilmaydi.
- **0.6 HTTP 200 emas — MA'LUMOT.** Jonli sahifani oching, raqamni tekshiring. Commit/build — deploy emas.
- **0.7 Faylni grep qilmang, O'QING.** Foydalanuvchidan so'rash — oxirgi chora.
- **0.8 UI/UX professional bo'lsin** — skrinshot bilan tekshiring.
- **0.9 Foydalanuvchi qarshi chiqsa, odatda haq** — ma'no muammosi; o'lchab javob bering.

Shu loyihada topilgan (2026-09-29):

- **K.1 Statik demo sana taqdimotni buzadi.** Namuna `src/data/seed.js` da bugungi sanaga suriladi; `tests/seed.test.js` 6 xil sanada tekshiradi. Seed'ni o'zgartirsangiz — shu test o'tsin.
- **K.2 AI ichki id'ni "band raqami" deb ko'rsatdi.** Vosita jadvallarida `ichki_id` doim OXIRGI ustun.
- **K.3 AI qisqartirilgan ro'yxat qatorlarini o'zi sanab adashdi (174 ≠ 169).** Har jadvalda `jami_qatorlar`; prompt: "o'zing sanama". Sifat o'lchovi (`/sifat`) shunday xatolarni topadi — katta o'zgarishdan keyin ishga tushiring.
- **K.4 Groq modellari o'zgaradi.** 2026-09-29: faqat `qwen/qwen3.8-27b` (tool + rasm), `openai/gpt-oss-120b` (tool, rasmsiz), `gpt-oss-20b` (tool nomini buzadi — ishlatilmaydi), whisper.
- **K.5 Bepul tarif limiti:** har model 8000 TPM, 1000 RPD; qwen ~1000 chiqish token/daqiqa. Shuning uchun: vositalar savolga qarab tanlanadi, natijalar ixcham jadval, 429 da zaxira model + kutish taymeri.

## 1. Mahsulot

Kafedra mudiri uchun: yuklama taqsimoti (Excel ish rejadan), o'quv yuklama, o'qituvchilar, davomat, talabalar o'zlashtirishi, ilmiy ishlar, loyihalar, KPI, rasmiy hisobotlar (Word/Excel/PDF), AI agent (vositalar orqali), hujjat rasmi tahlili, agent sifatini o'lchash.

## 2. Arxitektura

- `src/lib/*` — sof mantiq (testlanadi). `src/ai/*` — agent, vositalar, rasm, o'lchov. `src/pages/*` — sahifalar.
- `api/*` — Vercel serverless: `chat` (Groq proksi, model zaxirasi), `transcribe` (ovoz), `health`.
- Ma'lumot — brauzer `localStorage` (`src/store/db.js`), server bazasiga shu API ortidan almashtiriladi.

## 3. Buyruqlar

```
npm install          # bir marta
npm run dev          # http://localhost:5173 (AI ham ishlaydi, .env.local kerak)
npm test             # unit testlar
npm run check        # testlar + build — deploydan oldin
GROQ_LIVE=1 npx vitest run tests/live   # jonli Groq testi (limit sarflaydi)
```

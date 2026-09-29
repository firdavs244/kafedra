# KafedraAgent

Kafedra mudiri uchun sun'iy intellekt yordamchisi: yuklama, o'qituvchilar, davomat, talabalar o'zlashtirishi, ilmiy ishlar, loyihalar va KPI — bitta tizimda. AI agent savollarga **tizim hisoblagan raqamlar** asosida javob beradi (raqam to'qimaydi), hujjat rasmini o'qiydi va rasmiy hisobot tayyorlaydi.

**Texnologiyalar:** React 19 + Vite, Vercel Serverless Functions, Groq API (Qwen 3.8 — matn, vositalar, rasm; GPT-OSS-120B — zaxira; Whisper — ovoz), SheetJS, docx.

## Mahalliy ishga tushirish

1. Node.js 20+ o'rnating.
2. `.env.example` ni `.env.local` nomi bilan nusxalang va `GROQ_API_KEY` ni yozing.
3. `npm install`
4. `npm run dev` → http://localhost:5173

## Vercel'ga joylash

1. Loyihani GitHub'ga yuklang (`.env.local` gitignore'da — kalit repoga tushmaydi).
2. vercel.com → New Project → repo'ni tanlang (Framework: Vite — avtomatik).
3. Settings → Environment Variables → `GROQ_API_KEY` = kalit.
4. Deploy. Tekshirish: `https://<sayt>/api/health?ping=1` — `"primary": true` bo'lishi kerak.

## Testlar

`npm test` — 70+ unit test (yuklama taqsimoti prototip bilan 100% mos, seed turli sanalarda, API proksi, vositalar, eksport, XSS).

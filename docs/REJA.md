# Reja va o'lchovlar

## So'rov (2026-09-29) — bandlar

1. KafedraAgent'ni KafedraAgent.pdf va kafedra.txt asosida qurish — **bajarildi**.
2. Aytilganidan kuchliroq: hakamlar o'ylamagan funksiyalar — **bajarildi** (pastda).
3. Ishdan keyin o'z-o'zini tanqid — **bajarildi** (`docs/TAQDIMOT.md`, o'lchov sahifasi).
4. Groq API — **bajarildi** (server proksi, zaxira model).
5. Vercel deploy — **bajarildi** (2026-09-30: kalit env'ga qo'shildi).
6. Firdavs qoidalarini moslab ko'chirish — **bajarildi** (`CLAUDE.md`, `AGENTS.md`, `.claude/`).
7. Dizaynerning bitta HTML faylini professional tuzilmaga — **bajarildi** (React + Vite, modullar, testlar).

## O'lchovlar (2026-09-29, Groq bepul tarif)

| Model | Holat | Izoh |
|---|---|---|
| `qwen/qwen3.8-27b` | asosiy | tool-calling (parallel), rasm qabul qiladi, o'zbekcha yaxshi, ~1.5 s |
| `openai/gpt-oss-120b` | zaxira | tool-calling (ketma-ket), rasmga 400 qaytaradi |
| `openai/gpt-oss-20b` | ishlatilmaydi | tool nomini buzdi (`maqola_rejasi<|channel|>commentary`) |
| `whisper-large-v3-turbo` | ovoz | `language=uz` |

Limitlar (har model, tashkilot bo'yicha): 1000 so'rov/kun, 8000 token/daqiqa; qwen'da
~1000 **chiqish** token/daqiqa. Bitta agent savoli ≈ 2.2–3.5K token, 1.5–3 s.

Rasm tahlili: namuna qaydnoma — 24/24 qator to'g'ri, 744 chiqish token, 1.8–3.3 s;
OCR "Algoritmalar" xatosi fuzzy moslash bilan tuzatiladi.

Sifat o'lchovi (to'liq to'plam, 17 savol, jonli Groq, `tests/live/bench.live.test.js`), 2026-09-30:
- 1-o'lchov: 14/17 — 3 ta javob uzildi (2 limit, 1 ixtiyoriy parametrga null → Groq sxemani rad etdi).
- 2-o'lchov: 14/17 — zaxira gpt-oss-120b 3 raqamni noto'g'ri o'qidi (685≠670 talaba, 5≠1 Scopus, grant rahbari «topilmadi»).
- Tuzatish: nullable sxema, kontingent jami, tur×holat sanog'i, `loyihalar.turi`, bo'sh filtr izohi, 2 marta qayta urinish.
- 3-o'lchov: **17/17**, o'rtacha 2.05 s (1.2–4.8 s); qwen 5/5, gpt-oss-120b 12/12.
Yuklama taqsimoti tezligi: 277 birlik → 18 o'qituvchi, median 5 ms (20 marta).

## Ongli ravishda qilinmaganlar

- **Real server bazasi va login** — demo uchun qo'shimcha nosozlik nuqtasi; ombor interfeysi
  (`src/store/db.js`) almashtirishga tayyor.
- **HEMIS API** — universitet ruxsati kerak; hozircha Excel import.
- **Telegram bot** — token/server kerak; `t.me/share` havolasi 80% ishni qiladi.
- **O'z modelini o'qitish** (slayd 5/7 dagi kabi) — bu vazifaga tayyor LLM + kod hisoblaydigan
  vositalar aniqroq va tekshiriladigan.

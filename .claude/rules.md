KAFEDRAAGENT QOIDALARI — har bir promptdan oldin. To'lig'i: AGENTS.md §0, CLAUDE.md.

1. Butun so'rovni o'qi: har bandni sanab chiq, javob oxirida nima qolganini ayt.
2. AI raqam to'qimaydi: har raqam src/ai/tools.js vositasidan (koddan) keladi.
3. O'lchanmagan natija va'da qilinmaydi: "aniqlik X%" faqat /sifat da o'lchangan bo'lsa.
4. Groq kaliti faqat serverda (.env.local / Vercel env). Repoga, chatga, logga — hech qachon.
5. Har bir cheklov — DA'VO: 3-5 muqobilni sinamay "mumkin emas" dema. Oldin o'lcha.
6. HTTP 200 emas — MA'LUMOT: jonli sahifani och, raqamni tekshir. Build/commit — deploy emas.
7. Seed'ni o'zgartirsang — tests/seed.test.js (6 xil sana) o'tsin. Deploydan oldin: npm run check.
8. Vosita jadvallarida ichki_id oxirgi ustun; jami son "jami_qatorlar"da (model o'zi sanamasin).
9. Taqdimotga oid ish docs/TAQDIMOT.md dan o'tadi: slayddagi har da'vo ilovada ko'rsatilishi kerak.
10. UI'ni skrinshot bilan tekshir. Muloqot — o'zbekcha, ishda chuqur, brifingda sodda.

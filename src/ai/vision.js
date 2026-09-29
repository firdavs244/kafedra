// Rasm/skanerdan jadval ajratish (qwen3.8 — rasm qabul qiladigan model).
// Model faqat JADVALNI ko'chiradi; qaysi ustun qaysi maydonga tushishi va
// o'qituvchi ismini bazaga bog'lash — kodda (src/lib/docmap.js), tekshiriladigan tarzda.
import { chatCompletion, withRetry, AIError } from './client.js';

export const DOC_TYPES = {
  auto: 'Avtomatik aniqlash',
  qaydnoma: "Baholash qaydnomasi (o'zlashtirish)",
  ilmiy_ishlar: "Ilmiy ishlar / maqolalar ro'yxati",
  boshqa: 'Boshqa jadval',
};

// Katta telefon rasmini 1600px gacha kichraytirib JPEG qilamiz: Vercel so'rov
// chegarasi 4.5 MB, model uchun esa bu o'lcham yetarli.
export function fileToDataUrl(file, maxSide = 1600, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Rasmni o'qib bo'lmadi (JPG yoki PNG yuklang)"));
    };
    img.src = url;
  });
}

const SYSTEM = "Sen rasmdagi rasmiy hujjatdan ma'lumot ko'chiruvchisan. FAQAT JSON qaytar. Matnni rasmda qanday yozilgan bo'lsa shunday ko'chir: tarjima qilma, tuzatma, o'ylab topma. O'qib bo'lmaydigan katakka null yoz. JSON'ni ixcham yoz (ortiqcha bo'sh joysiz).";

export function parseJSONLoose(text) {
  const s = String(text || '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new AIError('bad_json', "Model jadvalni qaytarmadi. Rasm aniqroq bo'lsin yoki qayta urinib ko'ring.");
  return JSON.parse(s.slice(a, b + 1));
}

export async function extractDocument(dataUrl, hint = 'auto', { signal, onWait } = {}) {
  const want = hint && hint !== 'auto' ? ` Kutilayotgan hujjat turi: ${DOC_TYPES[hint]}.` : '';
  const prompt = `Hujjatdagi asosiy jadvalni va sarlavhadagi ma'lumotlarni ajrat.${want}
JSON tuzilishi: {"hujjat_turi":"qaydnoma|ilmiy_ishlar|kpi|davomat|oqituvchilar|boshqa","sarlavha":"...","meta":{"fan":null,"guruh":null,"oqituvchi":null,"sana":null,"semestr":null},"ustunlar":["..."],"qatorlar":[["..."]]}
qatorlar — jadvalning har bir qatori, ustunlar tartibida, matn sifatida.`;
  const t0 = performance.now();
  const r = await withRetry(
    () =>
      chatCompletion({
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] },
        ],
        responseFormat: { type: 'json_object' },
        maxTokens: 1000,
        temperature: 0,
        stream: false,
        signal,
      }),
    { signal, onWait, maxWait: 75, retries: 3 },
  );
  const doc = parseJSONLoose(r.message.content);
  if (!Array.isArray(doc.ustunlar)) doc.ustunlar = [];
  if (!Array.isArray(doc.qatorlar)) doc.qatorlar = [];
  doc.qatorlar = doc.qatorlar.filter((row) => Array.isArray(row)).map((row) => row.map((c) => (c == null ? '' : String(c))));
  return { doc, model: r.model, ms: Math.round(performance.now() - t0), truncated: r.finish === 'length' };
}

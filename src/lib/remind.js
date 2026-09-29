// Eslatma matni va Telegram orqali ulashish (bot kerak emas: t.me/share
// Telegram'ni tayyor matn bilan ochadi, mudir kerakli odamni o'zi tanlaydi).
import { fmtShort } from './dates.js';
import { shortName } from './format.js';

export function reminderText({ teacher, subject, when, head, kafedra }) {
  const salom = teacher ? `Hurmatli ${shortName(teacher.name)}` : 'Hurmatli hamkasb';
  const lines = [
    `${salom}!`,
    '',
    `${subject}${when ? ` (muddat: ${fmtShort(when)})` : ''}.`,
    "Iltimos, holat bo'yicha qisqacha ma'lumot bering va zarur bo'lsa yangi muddatni kelishib olaylik.",
    '',
    'Hurmat bilan,',
    head ? `${head}, ${kafedra || 'kafedra'} mudiri` : `${kafedra || 'Kafedra'} mudiri`,
  ];
  return lines.join('\n');
}

export function telegramUrl(text) {
  const url = typeof window !== 'undefined' ? window.location.origin : '';
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

// Ovozli so'rov: mikrofondan yozib, Groq Whisper orqali o'zbekcha matnga aylantiradi.
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useUI } from './UIProvider.jsx';
import { errorText, transcribe } from '../ai/client.js';

const MAX_SEC = 45;

export default function VoiceButton({ onText, disabled }) {
  const { toast } = useUI();
  const [st, setSt] = useState('idle');
  const [sec, setSec] = useState(0);
  const rec = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);

  useEffect(() => () => {
    clearInterval(timer.current);
    if (rec.current?.state === 'recording') rec.current.stop();
  }, []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast("Bu brauzer ovoz yozishni qo'llamaydi", 'bad');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast('Mikrofonga ruxsat berilmadi', 'bad');
      return;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(timer.current);
      const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' });
      if (blob.size < 1500) {
        setSt('idle');
        toast('Yozuv juda qisqa');
        return;
      }
      setSt('busy');
      try {
        const text = await transcribe(blob);
        if (text) onText(text);
        else toast("Ovoz tanilmadi — qayta urinib ko'ring");
      } catch (e) {
        toast(errorText(e), 'bad');
      } finally {
        setSt('idle');
      }
    };
    mr.start();
    rec.current = mr;
    setSt('rec');
    setSec(0);
    timer.current = setInterval(() => {
      setSec((s) => {
        if (s + 1 >= MAX_SEC && mr.state === 'recording') mr.stop();
        return s + 1;
      });
    }, 1000);
  }

  const stop = () => rec.current?.state === 'recording' && rec.current.stop();

  if (st === 'busy') {
    return (
      <button type="button" className="icon-btn" disabled aria-label="Ovoz matnga aylantirilmoqda" title="Ovoz matnga aylantirilmoqda">
        <span className="thinking">
          <i />
        </span>
      </button>
    );
  }
  if (st === 'rec') {
    return (
      <button type="button" className="icon-btn rec" onClick={stop} aria-label={`Yozishni to'xtatish (${sec} s)`} title={`Yozilmoqda ${sec} s — to'xtatish uchun bosing`}>
        <Icon name="stop" />
      </button>
    );
  }
  return (
    <button type="button" className="icon-btn" onClick={start} disabled={disabled} aria-label="Ovoz bilan so'rash" title="Ovoz bilan so'rash (o'zbek tilida)">
      <Icon name="mic" />
    </button>
  );
}

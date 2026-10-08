# Serverga joylash

Loyiha faqat Python 3.10+ talab qiladi, qo'shimcha kutubxona kerak emas. Uchta yo'l:

## A. O'z VPS serveringiz (Ubuntu/Debian) — tavsiya etiladi
Universitet serveri yoki istalgan VPS (Hetzner, DigitalOcean, mahalliy hosting).

```bash
# 1) Kompyuteringizdan arxivni serverga yuboring
scp KafedraAgent_Professional_2_MVP_deploy.zip root@SERVER_IP:/root/

# 2) Serverga kiring va o'rnating
ssh root@SERVER_IP
apt-get install -y unzip
unzip KafedraAgent_Professional_2_MVP_deploy.zip && cd KafedraAgent_Professional_2_MVP
sudo bash deploy/install_ubuntu.sh              # http://SERVER_IP
# yoki domen bilan (DNS A-yozuvi server IP'siga yo'naltirilgan bo'lsin):
sudo bash deploy/install_ubuntu.sh kafedra.example.uz   # https:// avtomatik
```

Skript: ilovani `/opt/kafedra-agent` ga ko'chiradi, `systemd` xizmati qiladi (server qayta yonganda o'zi ishga tushadi), oldiga `nginx` qo'yadi, domen bo'lsa bepul HTTPS sertifikat oladi.

Foydali buyruqlar:
```bash
systemctl status kafedra-agent      # holat
journalctl -u kafedra-agent -f      # jurnal
systemctl restart kafedra-agent     # qayta ishga tushirish
```
Yangilash: yangi arxivni ochib, `sudo bash deploy/install_ubuntu.sh` ni qayta ishga tushiring.

## B. Docker
```bash
docker build -t kafedra-agent .
docker run -d --name kafedra -p 80:8000 --restart unless-stopped kafedra-agent
```

## B2. Boshqa loyihalar ishlab turgan umumiy server — alohida port
`install_ubuntu.sh` bunday serverda ishlatilmasin: u nginx'ning `default` saytini o'chiradi va 80-portni egallaydi, ya'ni boshqa loyihaning manzilini olib qo'yadi.
Uning o'rniga (root sifatida):
```bash
git clone https://github.com/firdavs244/kafedra.git /opt/kafedra/src
bash /opt/kafedra/src/deploy/server/bootstrap.sh      # -> http://SERVER_IP:8080
```
Alohida compose loyihasi (`kafedra`): ilova + o'zining nginx'i, bitta ochiq port — 8080. Host nginx'iga, 80/443-portlarga va firewall'ga tegilmaydi; skript o'rnatishdan oldin va keyin IP'ning javobini va boshqa konteynerlarni solishtiradi.
Namoyishni boshlang'ich holatga qaytarish / yangilash: `bash /opt/kafedra/deploy.sh`.

## C. Render.com (bepul, server kerak emas)
1. Loyihani GitHub'ga yuklang.
2. render.com → New → Blueprint → repozitoriyni tanlang (`render.yaml` avtomatik o'qiladi).
3. Bir necha daqiqada `https://kafedra-agent-xxxx.onrender.com` manzili beriladi.

Eslatma: bepul tarifda 15 daqiqa faolsizlikdan keyin ilova "uxlaydi" (birinchi ochilish ~1 daqiqa), va qayta ishga tushganda yuklangan hujjatlar/vazifalar o'chadi — namoyish uchun yetarli, doimiy ishlatish uchun A variant.

## ⚠️ Ochiq internetga chiqarishdan oldin
- Namuna parollar (`mudir123`, `admin123` ...) README'da ochiq yozilgan. Haqiqiy foydalanuvchilar uchun ularni `kafedra_agent/seed.py` da o'zgartiring.
- Tizim sanasi 06.10.2026 ga qotirilgan. Haqiqiy sana uchun `KA_TODAY=real` (systemd faylida `Environment=KA_TODAY=real`).
- Claude modeli bilan ishlash uchun: `pip install anthropic`, so'ng `Environment=KA_LLM=1` va `Environment=ANTHROPIC_API_KEY=...`.

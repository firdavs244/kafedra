"""Taqdimot uchun namuna hujjat rasmlari: telefon bilan olingan qog'oz hujjatga o'xshash.

Ishga tushirish:  python scripts/make-sample-docs.py
Natija:           public/namuna/qaydnoma-namuna.jpg, public/namuna/ilmiy-ishlar-namuna.jpg

Ismlar va ballar to'qima (namuna) — haqiqiy talabalar emas.
"""
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "namuna")
FONTS = "C:/Windows/Fonts"


def font(name, size, index=0):
    for cand in (name, "georgia.ttf", "arial.ttf"):
        p = os.path.join(FONTS, cand)
        if os.path.exists(p):
            return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()


REG = lambda s: font("cambria.ttc", s)
BOLD = lambda s: font("cambriab.ttf", s)


def page(w=1240, h=1754):
    return Image.new("RGB", (w, h), (252, 251, 247))


def center(d, y, text, f, w):
    tw = d.textlength(text, font=f)
    d.text(((w - tw) / 2, y), text, font=f, fill=(20, 20, 20))


def table(d, x, y, cols, rows, f, fb, row_h=46):
    widths = [c[1] for c in cols]
    total = sum(widths)
    # sarlavha
    cx = x
    for (title, wdt) in cols:
        d.rectangle([cx, y, cx + wdt, y + row_h + 8], outline=(30, 30, 30), width=2)
        d.text((cx + 8, y + 12), title, font=fb, fill=(15, 15, 15))
        cx += wdt
    y += row_h + 8
    for r in rows:
        cx = x
        for (val, wdt) in zip(r, widths):
            d.rectangle([cx, y, cx + wdt, y + row_h], outline=(40, 40, 40), width=1)
            d.text((cx + 8, y + 11), str(val), font=f, fill=(25, 25, 25))
            cx += wdt
        y += row_h
    return y, total


def photo(img, angle, seed):
    """Qog'ozni stol ustida telefon bilan olingandek ko'rsatish: fon, soya, burchak, shovqin."""
    rnd = random.Random(seed)
    W, H = img.size
    bg = Image.new("RGB", (W + 220, H + 220), (118, 104, 88))
    noise = Image.effect_noise((W + 220, H + 220), 22).convert("RGB")
    bg = Image.blend(bg, noise, 0.12)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 120)).filter(ImageFilter.GaussianBlur(4))
    bg.paste((40, 34, 28), (122, 126, 122 + W, 126 + H))
    bg = bg.filter(ImageFilter.GaussianBlur(3))
    paper = img.filter(ImageFilter.GaussianBlur(0.6))
    bg.paste(paper, (110, 110))
    # yorug'lik notekisligi
    grad = Image.linear_gradient("L").resize(bg.size).rotate(35, expand=False)
    shade = Image.new("RGB", bg.size, (0, 0, 0))
    bg = Image.composite(bg, Image.blend(bg, shade, 0.10), grad)
    bg = bg.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=(110, 96, 80))
    return bg.resize((int(bg.width * 0.78), int(bg.height * 0.78)), Image.LANCZOS)


def qaydnoma():
    img = page()
    d = ImageDraw.Draw(img)
    W = img.width
    center(d, 70, "BUXORO DAVLAT UNIVERSITETI", BOLD(30), W)
    center(d, 112, "Axborot tizimlari va texnologiyalari kafedrasi", REG(27), W)
    center(d, 175, "YAKUNIY NAZORAT QAYDNOMASI", BOLD(36), W)
    d.text((110, 245), "Fan: Algoritmlar va ma'lumotlar tuzilmasi", font=REG(27), fill=(20, 20, 20))
    d.text((110, 285), "Guruh: ATT-25-02            Semestr: 2", font=REG(27), fill=(20, 20, 20))
    d.text((110, 325), "O'qituvchi: Ismoilov A.R.            Sana: 16.06.2026", font=REG(27), fill=(20, 20, 20))
    names = [
        "Aliyev Aziz", "Karimova Madina", "Rashidov Bekzod", "Tursunova Sevara", "Sodiqov Jasur",
        "Nazarova Dilnoza", "Qodirov Sardor", "Ergasheva Nilufar", "Yusupov Otabek", "Hamroyeva Kamola",
        "Ismoilov Shoxrux", "Xolova Feruza", "Jumayev Javohir", "Sharipova Gulnoza", "To'rayev Umid",
        "Rahimova Shahzoda", "Karimov Sherzod", "Aliyeva Mohinur", "Tursunov Asliddin", "Sodiqova Malika",
        "Nazarov Farrux", "Qodirova Nodira", "Yusupova Zarina", "Hamroyev Islom",
    ]
    scores = [91, 78, 45, 88, 67, 73, 52, 95, 81, 69, 38, 76, 84, 62, 57, 90, 74, 49, 66, 87, 79, 71, 93, 58]

    def baho(s):
        return "a'lo" if s >= 86 else "yaxshi" if s >= 71 else "qoniqarli" if s >= 55 else "qoniqarsiz"

    rows = [[i + 1, n, s, baho(s)] for i, (n, s) in enumerate(zip(names, scores))]
    y, _ = table(d, 110, 385, [("No", 80), ("Talabaning F.I.Sh.", 520), ("Ball", 150), ("Baho", 270)], rows, REG(25), BOLD(25), row_h=44)
    d.text((110, y + 40), "O'qituvchi: ______________  Ismoilov A.R.", font=REG(27), fill=(20, 20, 20))
    d.text((110, y + 85), "Kafedra mudiri: ______________  Rahimov B.O.", font=REG(27), fill=(20, 20, 20))
    # qalam bilan qo'yilgan imzo chizig'i
    d.line([(345, y + 62), (420, y + 48), (470, y + 66), (520, y + 50)], fill=(30, 50, 140), width=3)
    return photo(img, -1.4, 7)


def ilmiy():
    img = page(1754, 860)
    d = ImageDraw.Draw(img)
    W = img.width
    center(d, 60, "Axborot tizimlari va texnologiyalari kafedrasi", REG(28), W)
    center(d, 105, "2026-2027 o'quv yili uchun ilmiy maqolalar rejasi (qo'shimcha)", BOLD(33), W)
    rows = [
        [1, "Hamroyeva Sh.I.", "Ta'lim platformalarida o'quvchi faolligini bashorat qilish", "Education and Information Technologies", "Scopus", "Yozilmoqda", "15.12.2026"],
        [2, "Jo'rayev B.N.", "Web ilovalarda autentifikatsiya zaifliklari tahlili", "Muhammad al-Xorazmiy avlodlari", "OAK jurnali", "Reja", "20.11.2026"],
        [3, "Rajabova F.O.", "Ma'lumotlar omborlarida indekslash strategiyalari", "Raqamli ta'lim konferensiyasi", "Respublika konferensiyasi", "Yuborilgan", "05.11.2026"],
        [4, "Qodirov A.M.", "Kichik tillar uchun matn tasniflash modellari", "Applied Sciences", "Scopus", "Reja", "28.02.2027"],
        [5, "Murodov S.B.", "Bulutli hisoblashda resurslarni rejalashtirish", "TATU xabarlari", "OAK jurnali", "Yozilmoqda", "30.01.2027"],
    ]
    table(d, 60, 175, [("No", 50), ("Muallif", 200), ("Maqola mavzusi", 520), ("Jurnal / nashr", 330), ("Turi", 250), ("Holati", 140), ("Muddat", 140)], rows, REG(19), BOLD(21), row_h=64)
    d.text((60, 620), "Kafedra mudiri: ______________  Rahimov B.O.", font=REG(26), fill=(20, 20, 20))
    return photo(img, 1.1, 11)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    qaydnoma().save(os.path.join(OUT, "qaydnoma-namuna.jpg"), quality=86, optimize=True)
    ilmiy().save(os.path.join(OUT, "ilmiy-ishlar-namuna.jpg"), quality=86, optimize=True)
    for f in os.listdir(OUT):
        print(f, os.path.getsize(os.path.join(OUT, f)))

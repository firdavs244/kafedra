"""O'zbek (lotin) matni uchun normallashtirish, tokenizatsiya, yengil stemming va sana tahlili."""
import re
from datetime import date

_APOS = re.compile(r"[‘’ʻʼ`´']")
_NON_WORD = re.compile(r"[^a-z0-9'\s]")

STOPWORDS = {
    "va", "bilan", "uchun", "bu", "u", "ham", "esa", "qanday", "qaysi", "nima", "necha",
    "nechta", "qancha", "bo'yicha", "haqida", "bor", "yo'q", "edi", "the", "da", "ga",
    "dan", "ni", "ning", "mi", "kim", "qachon", "ko'rsat", "ayt", "menga", "iltimos",
    "bo'lgan", "bo'ladi", "kerak", "hamda", "yoki", "har", "bir", "shu", "ushbu", "o'sha",
    "qilingan", "etilgan", "qilindi", "qilinadi", "oy", "oyida", "oyidagi", "oyi", "qabul",
    "nimalar", "kim", "qachongacha", "kiradi", "yil", "yilgi", "qayerda", "qayer", "o'tadi", "o'tkaziladi",
}

# Uzundan qisqaga — birinchi mos kelgani olib tashlanadi (bir necha marta).
SUFFIXES = sorted([
    "larining", "laridan", "larida", "lariga", "larini", "larni", "lardan", "larda", "larga",
    "lari", "lar", "ining", "idagi", "dagi", "ning", "dan", "tan", "ga", "ka", "qa", "da", "ta",
    "ni", "si", "ini", "imiz", "ingiz", "ish", "gan", "kan", "qan", "moqda", "yapti", "di",
    "ligi", "lik", "mi",
], key=len, reverse=True)


def normalize(text: str) -> str:
    text = text.lower()
    text = _APOS.sub("'", text)
    text = text.replace("o'", "o'").replace("g'", "g'")
    return text


def stem(token: str) -> str:
    for _ in range(3):
        for suf in SUFFIXES:
            if token.endswith(suf) and len(token) - len(suf) >= 4:
                token = token[: -len(suf)]
                break
        else:
            # egalik qo'shimchasi: yig'ilishi → yig'ilish
            if token.endswith("i") and len(token) >= 7 and not token[-2] in "aeiou":
                token = token[:-1]
                continue
            break
    return token


def tokenize(text: str, keep_stop: bool = False) -> list[str]:
    text = _NON_WORD.sub(" ", normalize(text))
    out = []
    for t in text.split():
        t = t.strip("'")
        if not t or (not keep_stop and t in STOPWORDS):
            continue
        st = stem(t)
        if not keep_stop and st in STOPWORDS:
            continue
        out.append(st)
    return out


MONTHS = {
    "yanvar": 1, "fevral": 2, "mart": 3, "aprel": 4, "may": 5, "iyun": 6, "iyul": 7,
    "avgust": 8, "sentabr": 9, "sentyabr": 9, "oktabr": 10, "oktyabr": 10, "noyabr": 11,
    "dekabr": 12,
}
_DATE_WORD = re.compile(r"(\d{1,2})\s*-?\s*(" + "|".join(MONTHS) + r")")
_DATE_NUM = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})")


def parse_date(text: str, ref: date) -> date | None:
    t = normalize(text)
    m = _DATE_NUM.search(t)
    if m:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    m = _DATE_WORD.search(t)
    if m:
        month = MONTHS[m.group(2)]
        year = ref.year if month >= ref.month - 1 else ref.year + 1
        return date(year, month, int(m.group(1)))
    return None


def fmt_date(d) -> str:
    if isinstance(d, str):
        d = date.fromisoformat(d[:10])
    return d.strftime("%d.%m.%Y")


def numbers_in(text: str) -> list[str]:
    return re.findall(r"\d+(?:[.,]\d+)?", text)

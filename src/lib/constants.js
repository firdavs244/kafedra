// Kafedra sohasiga oid barcha ro'yxatlar va CRUD sxemalari bir joyda.

export const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
export const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

export const POS = ['Professor', 'Dotsent', "Katta o'qituvchi", 'Assistent', "Stajyor-o'qituvchi"];
export const DEFAULT_NORMS = { Professor: 500, Dotsent: 550, "Katta o'qituvchi": 600, Assistent: 650, "Stajyor-o'qituvchi": 650 };
export const DEGREES = ['—', 'PhD', 'DSc', 'Fan nomzodi', 'Fan doktori'];

export const PUB_TYPES = ['Scopus', 'Web of Science', 'OAK jurnali', 'Xalqaro konferensiya', 'Respublika konferensiyasi', 'Monografiya', 'Darslik', "O'quv qo'llanma"];
export const PUB_STATUS = ['Reja', 'Yozilmoqda', 'Yuborilgan', 'Qabul qilingan', 'Chop etilgan'];
// Reyting balli: nashr turining og'irligi (Scopus/WoS eng yuqori)
export const PUB_W = { Scopus: 10, 'Web of Science': 10, 'OAK jurnali': 5, 'Xalqaro konferensiya': 3, 'Respublika konferensiyasi': 2, Monografiya: 8, Darslik: 7, "O'quv qo'llanma": 5 };

export const PROJ_TYPES = ['Davlat granti', 'Xalqaro grant', "Xo'jalik shartnoma", 'Innovatsion loyiha', 'Startap'];
export const PROJ_STATUS = ['Tayyorlanmoqda', 'Jarayonda', 'Yakunlangan', "To'xtatilgan"];

export const ST_KINDS = ['Kurs ishi', 'BMI', 'Magistrlik dissertatsiyasi', 'Olimpiada', "Ilmiy to'garak", 'Talaba maqolasi', 'Tanlov / startap'];
export const ST_STATUS = ['Rejada', 'Jarayonda', 'Yakunlandi'];

export const KPI_CATS = ["O'quv-uslubiy", 'Ilmiy', "Ma'naviy-ma'rifiy", 'Xalqaro hamkorlik', 'Talabalar bilan ish', 'Tashkiliy'];
export const LESSON = ["Ma'ruza", 'Amaliy', 'Laboratoriya', 'Seminar', 'Kurs ishi', 'Kurs loyihasi'];

export const ATT_REASONS = ['Kasallik varaqasi', 'Xizmat safari', "Mehnat ta'tili", 'Malaka oshirish', 'Boshqa sabab'];
export const ATT_CODE = { 'Kasallik varaqasi': 'B', 'Xizmat safari': 'X', "Mehnat ta'tili": 'T', 'Malaka oshirish': 'M', 'Boshqa sabab': 'S' };

// Baholash: 5 balli tizim. O'zlashtirish = 3 va undan yuqori, sifat = 4 va 5.
export const GRADE_KEYS = ['a', 'b', 'c', 'f'];
export const GRADE_LABELS = { a: "A'lo (5)", b: 'Yaxshi (4)', c: 'Qoniqarli (3)', f: 'Qoniqarsiz (2)' };
export const PASS_TARGET = 80; // o'zlashtirish me'yori, %

export const DEFAULT_SETTINGS = {
  name: 'Kafedra',
  faculty: '',
  university: '',
  head: '',
  year: '2026-2027',
  sem1Start: '2026-09-02',
  sem1End: '2026-12-26',
  sem2Start: '2027-01-19',
  sem2End: '2027-05-30',
  norms: DEFAULT_NORMS,
  workStart: '08:30',
  workEnd: '17:00',
  graceMin: 10,
  workWeek: '6',
  holidays: '2026-09-01, 2026-10-01, 2026-12-08, 2027-01-01, 2027-03-08, 2027-03-21, 2027-05-09, 2027-09-01',
};

// Har bir bo'lim uchun forma maydonlari. `t` — kiritish turi, `req` — majburiy.
export const SCHEMA = {
  teachers: {
    one: "O'qituvchi",
    fields: [
      { k: 'name', l: 'F.I.Sh.', t: 'text', req: 1, full: 1 },
      { k: 'position', l: 'Lavozim', t: 'select', o: POS },
      { k: 'degree', l: 'Ilmiy daraja', t: 'select', o: DEGREES },
      { k: 'rate', l: 'Stavka', t: 'number', step: 0.25, def: 1 },
      { k: 'pubPlan', l: 'Yillik maqola rejasi (dona)', t: 'number', def: 4 },
      { k: 'email', l: 'E-pochta', t: 'text' },
      { k: 'phone', l: 'Telefon', t: 'text' },
      { k: 'telegram', l: 'Telegram (@username)', t: 'text' },
    ],
  },
  subjects: {
    one: 'Fan yuklamasi',
    fields: [
      { k: 'name', l: 'Fan nomi', t: 'text', req: 1, full: 1 },
      { k: 'teacherId', l: "O'qituvchi", t: 'teacher', req: 1 },
      { k: 'kind', l: "Mashg'ulot turi", t: 'select', o: LESSON },
      { k: 'group', l: 'Guruh(lar)', t: 'text' },
      { k: 'semester', l: 'Semestr', t: 'select', o: ['1', '2'] },
      { k: 'planHours', l: 'Rejadagi soat', t: 'number', def: 0 },
      { k: 'doneHours', l: "O'tilgan soat", t: 'number', def: 0 },
    ],
  },
  pubs: {
    one: 'Ilmiy ish',
    fields: [
      { k: 'title', l: 'Mavzu / sarlavha', t: 'text', req: 1, full: 1 },
      { k: 'teacherId', l: "Mas'ul muallif", t: 'teacher', req: 1 },
      { k: 'coauthors', l: 'Hammualliflar', t: 'text' },
      { k: 'type', l: 'Turi', t: 'select', o: PUB_TYPES },
      { k: 'journal', l: 'Jurnal / nashr', t: 'text' },
      { k: 'status', l: 'Holati', t: 'select', o: PUB_STATUS },
      { k: 'quartile', l: 'Kvartil', t: 'select', o: ['—', 'Q1', 'Q2', 'Q3', 'Q4'] },
      { k: 'deadline', l: 'Reja muddati', t: 'date' },
      { k: 'pubDate', l: 'Chop etilgan sana', t: 'date' },
    ],
  },
  projects: {
    one: 'Loyiha',
    fields: [
      { k: 'title', l: 'Loyiha nomi', t: 'text', req: 1, full: 1 },
      { k: 'leaderId', l: 'Rahbar', t: 'teacher', req: 1 },
      { k: 'type', l: 'Turi', t: 'select', o: PROJ_TYPES },
      { k: 'members', l: 'Ijrochilar', t: 'teachers', full: 1 },
      { k: 'funding', l: "Moliyalashtirish (mln so'm)", t: 'number', def: 0 },
      { k: 'status', l: 'Holati', t: 'select', o: PROJ_STATUS },
      { k: 'start', l: 'Boshlanish', t: 'date' },
      { k: 'end', l: 'Tugash', t: 'date' },
      { k: 'progress', l: 'Bajarilish (%)', t: 'number', def: 0 },
    ],
  },
  stwork: {
    one: 'Talabalar bilan ish',
    fields: [
      { k: 'kind', l: 'Ish turi', t: 'select', o: ST_KINDS },
      { k: 'teacherId', l: "Rahbar o'qituvchi", t: 'teacher', req: 1 },
      { k: 'topic', l: 'Mavzu', t: 'text', req: 1, full: 1 },
      { k: 'student', l: 'Talaba(lar)', t: 'text' },
      { k: 'status', l: 'Holati', t: 'select', o: ST_STATUS },
      { k: 'deadline', l: 'Muddat', t: 'date' },
    ],
  },
  kpi: {
    one: 'KPI bandi',
    fields: [
      { k: 'code', l: 'Band raqami', t: 'text' },
      { k: 'category', l: "Yo'nalish", t: 'select', o: KPI_CATS },
      { k: 'title', l: "Ko'rsatkich", t: 'text', req: 1, full: 1 },
      { k: 'unit', l: "O'lchov birligi", t: 'text', def: 'dona' },
      { k: 'weight', l: 'Vazn (ball)', t: 'number', def: 5 },
      { k: 'target', l: 'Reja', t: 'number', def: 1 },
      { k: 'actual', l: 'Fakt', t: 'number', def: 0 },
      { k: 'period', l: 'Davr (oy)', t: 'month' },
      { k: 'deadline', l: 'Muddat', t: 'date' },
      { k: 'responsibleId', l: "Mas'ul", t: 'teacher' },
    ],
  },
  grades: {
    one: "O'zlashtirish qaydnomasi",
    fields: [
      { k: 'subject', l: 'Fan', t: 'text', req: 1, full: 1 },
      { k: 'group', l: 'Guruh', t: 'text', req: 1 },
      { k: 'teacherId', l: "O'qituvchi", t: 'teacher' },
      { k: 'students', l: 'Talabalar soni', t: 'number', def: 25 },
      { k: 'a', l: "A'lo (5)", t: 'number', def: 0 },
      { k: 'b', l: 'Yaxshi (4)', t: 'number', def: 0 },
      { k: 'c', l: 'Qoniqarli (3)', t: 'number', def: 0 },
      { k: 'f', l: 'Qoniqarsiz (2)', t: 'number', def: 0 },
      { k: 'retakeDeadline', l: 'Qayta topshirish muddati', t: 'date' },
    ],
  },
};

export const COLLS = ['teachers', 'subjects', 'pubs', 'projects', 'stwork', 'kpi', 'grades'];
export const TITLES = {
  teachers: "O'qituvchilar",
  subjects: "O'quv yuklama",
  pubs: 'Ilmiy ishlar',
  projects: 'Loyihalar',
  stwork: 'Talabalar bilan ish',
  kpi: 'KPI',
  grades: "O'zlashtirish",
  attendance: 'Davomat',
  plans: 'Ish rejalar',
};

// Ogohlantirishdagi `view` → sahifa manzili
export const VIEW_PATH = {
  home: '/',
  agent: '/agent',
  scan: '/hujjat',
  workload: '/yuklama',
  subjects: '/oquv-yuklama',
  teachers: '/oqituvchilar',
  attendance: '/davomat',
  students: '/talabalar',
  pubs: '/ilmiy',
  projects: '/loyihalar',
  stwork: '/talabalar-bilan-ish',
  kpi: '/kpi',
  reports: '/hisobotlar',
  quality: '/sifat',
  settings: '/sozlamalar',
};

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'very_secret_key_change_me';
const ROOT_DIR = __dirname;
const DB_PATH = path.join(ROOT_DIR, 'carzen.db');
const IMAGE_DIR = path.join(ROOT_DIR, 'image');
const MAIL_PREVIEW_DIR = path.join(ROOT_DIR, 'public', 'mail-previews');

fs.mkdirSync(IMAGE_DIR, { recursive: true });
fs.mkdirSync(MAIL_PREVIEW_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/public', express.static(path.join(ROOT_DIR, 'public')));
app.use('/image', express.static(IMAGE_DIR));

const db = new sqlite3.Database(DB_PATH);

const mailTransport = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: 'unix'
});

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function daysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  return diff;
}

function isValidDateRange(startDate, endDate) {
  if (!startDate || !endDate) return false;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end > start;
}

function bookingStatusesAffectAvailability() {
  return ['pending', 'payment_link_sent', 'paid'];
}

function formatDateRu(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ru-RU');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    login: row.login,
    firstName: row.firstName,
    lastName: row.lastName,
    middleName: row.middleName,
    phone: row.phone,
    email: row.email,
    birthDate: row.birthDate,
    role: row.role,
    createdAt: row.createdAt,
    avatarUrl: row.avatarUrl || '/image/avatar.png'
  };
}

function parseCarRow(row) {
  if (!row) return null;
  return {
    ...row,
    gallery: safeJsonParse(row.galleryJson, row.imageUrl ? [row.imageUrl] : []),
    specs: safeJsonParse(row.specsJson, {}),
    priceTiers: safeJsonParse(row.priceTiersJson, []),
    featuresList: String(row.features || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  };
}

async function logActivity(action, meta = {}) {
  try {
    await dbRun(
      'INSERT INTO activity_log (action, metaJson, createdAt) VALUES (?, ?, ?)',
      [action, JSON.stringify(meta), new Date().toISOString()]
    );
  } catch (error) {
    console.error('Activity log error:', error);
  }
}

async function addNotification({ channel, recipient, subject = '', content = '', status = 'created', externalId = '' }) {
  await dbRun(
    `INSERT INTO notifications (channel, recipient, subject, content, status, externalId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [channel, recipient, subject, content, status, externalId, new Date().toISOString()]
  );
}

async function sendBookingEmail(booking, car) {
  if (!booking.customerEmail) {
    return null;
  }

  const html = `
    <h1>Carzen: бронирование подтверждено</h1>
    <p>Здравствуйте, ${escapeHtml(booking.customerName)}.</p>
    <p>Ваше бронирование оплачено.</p>
    <ul>
      <li>Автомобиль: ${escapeHtml(car.title)}</li>
      <li>Даты: ${escapeHtml(booking.startDate)} - ${escapeHtml(booking.endDate)}</li>
      <li>Сумма: ${new Intl.NumberFormat('ru-RU').format(booking.totalPrice)} руб.</li>
      <li>Статус: оплачено</li>
    </ul>
    <p>Спасибо, что выбрали Carzen.</p>
  `;

  const info = await mailTransport.sendMail({
    from: 'no-reply@carzen.local',
    to: booking.customerEmail,
    subject: 'Carzen: бронирование подтверждено',
    html
  });

  const filename = `booking-${booking.id}-${Date.now()}.eml`;
  const filePath = path.join(MAIL_PREVIEW_DIR, filename);
  fs.writeFileSync(filePath, info.message);

  await addNotification({
    channel: 'email',
    recipient: booking.customerEmail,
    subject: 'Carzen: бронирование подтверждено',
    content: html,
    status: 'preview_saved',
    externalId: `/public/mail-previews/${filename}`
  });

  return `/public/mail-previews/${filename}`;
}

function generateSimplePdf(title, lines) {
  const pdfLines = [];
  const objects = [];

  function addObject(content) {
    objects.push(content);
  }

  function pdfText(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  let y = 800;
  pdfLines.push(`BT /F1 18 Tf 50 ${y} Td (${pdfText(title)}) Tj ET`);
  y -= 32;

  lines.forEach((line) => {
    if (y < 60) return;
    pdfLines.push(`BT /F1 11 Tf 50 ${y} Td (${pdfText(line)}) Tj ET`);
    y -= 16;
  });

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
  addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  addObject(`<< /Length ${Buffer.byteLength(pdfLines.join('\n'))} >>\nstream\n${pdfLines.join('\n')}\nendstream`);
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let output = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n`;
  output += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    output += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(output, 'utf8');
}

async function ensureColumn(tableName, columnName, sqlDefinition) {
  const columns = await dbAll(`PRAGMA table_info(${tableName})`);
  if (!columns.some((column) => column.name === columnName)) {
    await dbRun(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlDefinition}`);
  }
}

async function ensureDefaultData() {
  const adminExists = await dbGet('SELECT id FROM users WHERE login = ?', ['adminka']);
  if (!adminExists) {
    await dbRun(
      `INSERT INTO users (login, passwordHash, firstName, lastName, role, createdAt, email)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['adminka', bcrypt.hashSync('123adminka', 10), 'Админ', 'Carzen', 'admin', new Date().toISOString(), 'admin@carzen.local']
    );
  }

  const siteContentDefaults = {
    hero_title: 'Аренда автомобилей легко',
    hero_subtitle: 'Выберите идеальный автомобиль для ваших задач',
    support_phone: '+7 (999) 123-45-67',
    support_email: 'carzen@ya.ru',
    footer_address_1: 'Оренбург, ул. Победы, 157Б',
    footer_address_2: 'Екатеринбург, пр. Ленина, 68/1',
    footer_address_3: 'Казань, ул. Баумана, 23А',
    promo_label: 'Скидка 7% по промокоду',
    promo_code: 'FIRSTCARZEN'
  };

  for (const [key, value] of Object.entries(siteContentDefaults)) {
    await dbRun(
      `INSERT OR IGNORE INTO site_content (key, value, updatedAt) VALUES (?, ?, ?)`,
      [key, value, new Date().toISOString()]
    );
  }

  const extraOptionsCount = await dbGet('SELECT COUNT(*) as total FROM extra_options');
  if (!extraOptionsCount || !extraOptionsCount.total) {
    const now = new Date().toISOString();
    const defaults = [
      ['child-seat', 'Детское кресло', 600, 'once', 1, 1, now],
      ['navigator', 'GPS-навигатор', 350, 'day', 1, 2, now],
      ['second-driver', 'Второй водитель', 1200, 'once', 1, 3, now],
      ['full-insurance', 'Расширенная защита', 900, 'day', 1, 4, now]
    ];
    for (const option of defaults) {
      await dbRun(
        `INSERT INTO extra_options (code, title, price, chargeType, isActive, sortOrder, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        option
      );
    }
  }

  const promoCount = await dbGet('SELECT COUNT(*) as total FROM promo_codes');
  if (!promoCount || !promoCount.total) {
    await dbRun(
      `INSERT INTO promo_codes (code, title, discountPercent, isActive, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      ['FIRSTCARZEN', 'Приветственный промокод', 7, 1, new Date().toISOString()]
    );
  }

  const carCount = await dbGet('SELECT COUNT(*) as total FROM cars');
  if (!carCount || !carCount.total) {
    const now = new Date().toISOString();
    const cars = [
      {
        title: 'BMW M440 Coupe',
        brand: 'BMW',
        model: 'M440 Coupe',
        year: 2022,
        pricePerDay: 10000,
        mileage: 12000,
        fuelType: 'Бензин',
        transmission: 'АКПП',
        driveType: 'Полный',
        seats: 5,
        bodyType: 'Купе',
        city: 'Екатеринбург',
        description: 'Спортивное купе для тех, кто хочет эмоций и комфортной повседневной езды.',
        features: 'Климат-контроль,Камера 360,CarPlay',
        imageUrl: '/image/bmw_m440-2.png',
        galleryJson: JSON.stringify(['/image/bmw_m440-2.png']),
        specsJson: JSON.stringify({ category: 'Премиум', power: '387 л.с.', engineVolume: '3.0 литра', color: 'Синий' }),
        priceTiersJson: JSON.stringify([
          { label: '1-8 суток', price: 10000 },
          { label: '9-15 суток', price: 9500 },
          { label: '16-30 суток', price: 9000 },
          { label: 'от 31 суток', price: 8600 }
        ])
      },
      {
        title: 'Hyundai Solaris',
        brand: 'Hyundai',
        model: 'Solaris',
        year: 2021,
        pricePerDay: 3500,
        mileage: 14000,
        fuelType: 'Бензин',
        transmission: 'АКПП',
        driveType: 'Передний',
        seats: 5,
        bodyType: 'Седан',
        city: 'Оренбург',
        description: 'Экономичный городской автомобиль с простым и понятным управлением.',
        features: 'Кондиционер,Подогрев сидений,USB',
        imageUrl: '/image/hyundai.png',
        galleryJson: JSON.stringify(['/image/hyundai.png']),
        specsJson: JSON.stringify({ category: 'Комфорт', power: '123 л.с.', engineVolume: '1.6 литра', color: 'Белый' }),
        priceTiersJson: JSON.stringify([
          { label: '1-8 суток', price: 3500 },
          { label: '9-15 суток', price: 3300 },
          { label: '16-30 суток', price: 3100 },
          { label: 'от 31 суток', price: 2900 }
        ])
      },
      {
        title: 'Kia K5',
        brand: 'Kia',
        model: 'K5',
        year: 2020,
        pricePerDay: 8000,
        mileage: 17000,
        fuelType: 'Бензин',
        transmission: 'АКПП',
        driveType: 'Передний',
        seats: 5,
        bodyType: 'Седан',
        city: 'Казань',
        description: 'Стильный бизнес-седан для города и трассы. Подходит для деловых поездок и аренды на каждый день.',
        features: 'Климат-контроль,Подогрев сидений,CarPlay,Камера заднего вида',
        imageUrl: '/image/kia-k5.png',
        galleryJson: JSON.stringify(['/image/kia-k5.png', '/image/kia-k5-2.png', '/image/kia-cabin.png']),
        specsJson: JSON.stringify({ category: 'Комфорт', power: '150 л.с.', engineVolume: '2.0 литра', color: 'Черный', minRentPeriod: '1 сутки' }),
        priceTiersJson: JSON.stringify([
          { label: '1-8 суток', price: 8000 },
          { label: '9-15 суток', price: 7500 },
          { label: '16-30 суток', price: 7000 },
          { label: 'от 31 суток', price: 6500 }
        ])
      },
      {
        title: 'Toyota RAV4',
        brand: 'Toyota',
        model: 'RAV4',
        year: 2023,
        pricePerDay: 7000,
        mileage: 12000,
        fuelType: 'Бензин',
        transmission: 'АКПП',
        driveType: 'Полный',
        seats: 5,
        bodyType: 'Кроссовер',
        city: 'Москва',
        description: 'Практичный кроссовер для поездок по городу и за его пределы.',
        features: 'Полный привод,Круиз-контроль,Большой багажник',
        imageUrl: '/image/toyota-rav4.png',
        galleryJson: JSON.stringify(['/image/toyota-rav4.png']),
        specsJson: JSON.stringify({ category: 'SUV', power: '199 л.с.', engineVolume: '2.5 литра', color: 'Серый' }),
        priceTiersJson: JSON.stringify([
          { label: '1-8 суток', price: 7000 },
          { label: '9-15 суток', price: 6700 },
          { label: '16-30 суток', price: 6300 },
          { label: 'от 31 суток', price: 5900 }
        ])
      }
    ];

    for (const car of cars) {
      await dbRun(
        `INSERT INTO cars (
          title, brand, model, year, pricePerDay, mileage, fuelType, transmission, driveType,
          seats, bodyType, city, description, features, imageUrl, status, createdAt, galleryJson, specsJson, priceTiersJson
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          car.title, car.brand, car.model, car.year, car.pricePerDay, car.mileage, car.fuelType, car.transmission,
          car.driveType, car.seats, car.bodyType, car.city, car.description, car.features, car.imageUrl,
          'available', now, car.galleryJson, car.specsJson, car.priceTiersJson
        ]
      );
    }
  }
}

async function initDb() {
  await dbRun(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    middleName TEXT,
    phone TEXT,
    email TEXT,
    birthDate TEXT,
    avatarUrl TEXT DEFAULT '/image/avatar.png',
    role TEXT DEFAULT 'user',
    createdAt TEXT NOT NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS consultations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    carId TEXT NOT NULL,
    userId INTEGER,
    authorName TEXT NOT NULL,
    rating INTEGER NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt TEXT NOT NULL,
    publishedAt TEXT,
    moderatedAt TEXT,
    moderatorId INTEGER,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (moderatorId) REFERENCES users(id)
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    pricePerDay INTEGER NOT NULL,
    mileage INTEGER,
    fuelType TEXT,
    transmission TEXT,
    driveType TEXT,
    seats INTEGER,
    bodyType TEXT,
    city TEXT,
    description TEXT,
    features TEXT,
    imageUrl TEXT,
    status TEXT DEFAULT 'available',
    createdAt TEXT NOT NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    carId INTEGER NOT NULL,
    userId INTEGER,
    customerName TEXT NOT NULL,
    customerEmail TEXT NOT NULL,
    customerPhone TEXT NOT NULL,
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    daysCount INTEGER NOT NULL,
    totalPrice INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    paymentToken TEXT,
    paymentUrl TEXT,
    paymentSmsText TEXT,
    paymentSentAt TEXT,
    paidAt TEXT,
    adminComment TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    selectedOptionsJson TEXT,
    promoCode TEXT,
    discountPercent INTEGER DEFAULT 0,
    discountAmount INTEGER DEFAULT 0,
    basePrice INTEGER DEFAULT 0,
    optionsPrice INTEGER DEFAULT 0,
    depositAmount INTEGER DEFAULT 0,
    FOREIGN KEY (carId) REFERENCES cars(id),
    FOREIGN KEY (userId) REFERENCES users(id)
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    title TEXT,
    discountPercent INTEGER NOT NULL,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    expiresAt TEXT
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS extra_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    chargeType TEXT NOT NULL DEFAULT 'once',
    isActive INTEGER NOT NULL DEFAULT 1,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS site_content (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT,
    content TEXT,
    status TEXT NOT NULL,
    externalId TEXT,
    createdAt TEXT NOT NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    metaJson TEXT,
    createdAt TEXT NOT NULL
  )`);

  await ensureColumn('cars', 'galleryJson', 'TEXT');
  await ensureColumn('cars', 'specsJson', 'TEXT');
  await ensureColumn('cars', 'priceTiersJson', 'TEXT');
  await ensureColumn('users', 'avatarUrl', "TEXT DEFAULT '/image/avatar.png'");

  await ensureDefaultData();
}

function generateToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Нет заголовка' });
  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer' || !token) return res.status(401).json({ error: 'Неверный формат' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    db.get('SELECT id, role FROM users WHERE id = ?', [payload.id], (err, row) => {
      if (err || !row) return res.status(401).json({ error: 'Пользователь не найден' });
      req.userId = row.id;
      req.userRole = row.role;
      next();
    });
  } catch (error) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

function adminOnly(req, res, next) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Доступ только для администраторов' });
  }
  return next();
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, IMAGE_DIR);
  },
  filename(req, file, cb) {
    const prefix = file.fieldname === 'avatar' ? 'avatar' : 'car';
    cb(null, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    return cb(new Error('Только изображения'));
  }
});

async function getSiteContentMap() {
  const rows = await dbAll('SELECT key, value FROM site_content');
  const content = {};
  rows.forEach((row) => {
    content[row.key] = row.value;
  });
  return content;
}

async function getBookingByPaymentToken(token) {
  const row = await dbGet('SELECT * FROM bookings WHERE paymentToken = ?', [token]);
  return row;
}

async function getActiveOptionsByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await dbAll(
    `SELECT * FROM extra_options WHERE id IN (${placeholders}) AND isActive = 1 ORDER BY sortOrder ASC, id ASC`,
    ids
  );
  return rows;
}

async function getPromoByCode(code) {
  if (!code) return null;
  const row = await dbGet(
    `SELECT * FROM promo_codes
     WHERE UPPER(code) = UPPER(?) AND isActive = 1
     AND (expiresAt IS NULL OR expiresAt = '' OR expiresAt >= ?)`,
    [code.trim(), new Date().toISOString()]
  );
  return row;
}

async function carIsAvailable(carId, startDate, endDate, excludeBookingId = null) {
  const params = [carId, startDate, endDate, ...bookingStatusesAffectAvailability()];
  let sql = `
    SELECT COUNT(*) as total
    FROM bookings
    WHERE carId = ?
      AND startDate < ?
      AND endDate > ?
      AND status IN (${bookingStatusesAffectAvailability().map(() => '?').join(', ')})
  `;

  if (excludeBookingId) {
    sql += ' AND id != ?';
    params.push(excludeBookingId);
  }

  const row = await dbGet(sql, params);
  return !row || !row.total;
}

async function calculateBookingPrice({ car, startDate, endDate, selectedOptionIds, promoCode }) {
  const daysCount = daysBetween(startDate, endDate);
  const basePrice = daysCount * toInt(car.pricePerDay);
  const options = await getActiveOptionsByIds(selectedOptionIds);
  const optionsPrice = options.reduce((sum, option) => {
    if (option.chargeType === 'day') {
      return sum + toInt(option.price) * daysCount;
    }
    return sum + toInt(option.price);
  }, 0);

  const promo = await getPromoByCode(promoCode);
  const subtotal = basePrice + optionsPrice;
  const discountPercent = promo ? toInt(promo.discountPercent) : 0;
  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  const totalPrice = Math.max(0, subtotal - discountAmount);
  const depositAmount = Math.round(totalPrice * 0.1);

  return {
    daysCount,
    basePrice,
    optionsPrice,
    discountPercent,
    discountAmount,
    totalPrice,
    depositAmount,
    selectedOptions: options,
    promo
  };
}

app.get('/', (req, res) => {
  res.redirect('/public/html/menu.html');
});

app.get('/payment/:token', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'html', 'payment.html'));
});

app.post('/api/register', async (req, res) => {
  try {
    const { login, password, passwordConfirm, firstName, lastName, middleName, phone, email, birthDate } = req.body;
    if (!login || !password || !passwordConfirm || !firstName || !lastName || !email || !birthDate) {
      return res.status(400).json({ error: 'Заполнены не все обязательные поля' });
    }
    if (password !== passwordConfirm) {
      return res.status(400).json({ error: 'Пароли не совпадают' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    }

    const createdAt = new Date().toISOString();
    const result = await dbRun(
      `INSERT INTO users (login, passwordHash, firstName, lastName, middleName, phone, email, birthDate, role, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', ?)`,
      [login, bcrypt.hashSync(password, 10), firstName, lastName, middleName || null, phone || null, email, birthDate, createdAt]
    );
    const user = { id: result.lastID, login, firstName, lastName, middleName, phone, email, birthDate, role: 'user', createdAt };
    await logActivity('user_register', { userId: result.lastID, login });
    return res.json({ token: generateToken(user), user: mapUserRow(user) });
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
    }
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Ошибка сервера при регистрации' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль' });
    }
    const userRow = await dbGet('SELECT * FROM users WHERE login = ?', [login]);
    if (!userRow || !bcrypt.compareSync(password, userRow.passwordHash)) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const user = mapUserRow(userRow);
    await logActivity('user_login', { userId: user.id });
    return res.json({ token: generateToken(user), user });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Ошибка сервера при входе' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const row = await dbGet('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!row) return res.status(404).json({ error: 'Пользователь не найден' });
    return res.json({ user: mapUserRow(row) });
  } catch (error) {
    console.error('Me error:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.put('/api/me', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const current = await dbGet('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!current) return res.status(404).json({ error: 'User not found' });

    const firstName = String(req.body.firstName ?? current.firstName).trim();
    const lastName = String(req.body.lastName ?? current.lastName).trim();
    const middleName = String(req.body.middleName ?? current.middleName ?? '').trim() || null;
    const phone = String(req.body.phone ?? current.phone ?? '').trim() || null;
    const email = String(req.body.email ?? current.email ?? '').trim();
    const birthDate = String(req.body.birthDate ?? current.birthDate ?? '').trim() || null;
    const avatarUrl = req.file ? `/image/${req.file.filename}` : (current.avatarUrl || '/image/avatar.png');

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'First name, last name and email are required' });
    }

    await dbRun(
      `UPDATE users
       SET firstName = ?, lastName = ?, middleName = ?, phone = ?, email = ?, birthDate = ?, avatarUrl = ?
       WHERE id = ?`,
      [firstName, lastName, middleName, phone, email, birthDate, avatarUrl, req.userId]
    );

    await logActivity('user_profile_update', { userId: req.userId });
    const updated = await dbGet('SELECT * FROM users WHERE id = ?', [req.userId]);
    return res.json({ success: true, user: mapUserRow(updated) });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ error: 'Не удалось обновить профиль' });
  }
});

app.get('/api/site-content', async (req, res) => {
  try {
    return res.json({ content: await getSiteContentMap() });
  } catch (error) {
    console.error('Site content error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить контент сайта' });
  }
});

app.post('/api/consultation', async (req, res) => {
  try {
    const { city, name, phone } = req.body;
    if (!city || !name || !phone) {
      return res.status(400).json({ error: 'Заполните все поля' });
    }
    const createdAt = new Date().toISOString();
    const result = await dbRun(
      'INSERT INTO consultations (city, name, phone, createdAt) VALUES (?, ?, ?, ?)',
      [city, name, phone, createdAt]
    );
    await logActivity('consultation_create', { consultationId: result.lastID, city, phone });
    await addNotification({
      channel: 'admin',
      recipient: 'admin',
      subject: 'Новая заявка на консультацию',
      content: `${name}, ${phone}, ${city}`,
      status: 'created'
    });
    return res.json({ success: true, message: 'Заявка отправлена!' });
  } catch (error) {
    console.error('Consultation error:', error);
    return res.status(500).json({ error: 'Ошибка БД' });
  }
});

app.get('/api/cars/:carId/reviews', async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT id, carId, authorName, rating, text, createdAt, publishedAt
       FROM reviews
       WHERE carId = ? AND status = 'published'
       ORDER BY publishedAt DESC, createdAt DESC`,
      [req.params.carId]
    );
    return res.json({ reviews: rows });
  } catch (error) {
    console.error('Get reviews error:', error);
    return res.status(500).json({ error: 'Ошибка сервера при загрузке отзывов' });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { carId, authorName, rating, text } = req.body;
    const normalizedName = String(authorName || '').trim();
    const normalizedText = String(text || '').trim();
    const normalizedRating = Number(rating);

    if (!carId || !normalizedName || !normalizedText || !Number.isInteger(normalizedRating)) {
      return res.status(400).json({ error: 'Заполните все поля формы отзыва' });
    }
    if (normalizedName.length < 2 || normalizedName.length > 60) {
      return res.status(400).json({ error: 'Имя должно содержать от 2 до 60 символов' });
    }
    if (normalizedText.length < 20 || normalizedText.length > 1000) {
      return res.status(400).json({ error: 'Текст отзыва должен содержать от 20 до 1000 символов' });
    }
    if (normalizedRating < 1 || normalizedRating > 5) {
      return res.status(400).json({ error: 'Оценка должна быть от 1 до 5' });
    }

    const authHeader = req.headers.authorization;
    let userId = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const user = await dbGet('SELECT id FROM users WHERE id = ?', [payload.id]);
        userId = user?.id || null;
      } catch (error) {
        userId = null;
      }
    }

    const result = await dbRun(
      `INSERT INTO reviews (carId, userId, authorName, rating, text, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [String(carId), userId, normalizedName, normalizedRating, normalizedText, new Date().toISOString()]
    );
    await logActivity('review_create', { reviewId: result.lastID, carId });
    return res.status(201).json({ success: true, message: 'Отзыв отправлен на модерацию', reviewId: result.lastID });
  } catch (error) {
    console.error('Create review error:', error);
    return res.status(500).json({ error: 'Не удалось отправить отзыв' });
  }
});

app.get('/api/extra-options', async (req, res) => {
  try {
    const rows = await dbAll(
      'SELECT id, code, title, price, chargeType FROM extra_options WHERE isActive = 1 ORDER BY sortOrder ASC, id ASC'
    );
    return res.json({ options: rows });
  } catch (error) {
    console.error('Extra options error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить дополнительные опции' });
  }
});

app.get('/api/promo-codes/validate', async (req, res) => {
  try {
    const promo = await getPromoByCode(req.query.code);
    if (!promo) {
      return res.status(404).json({ valid: false, error: 'Промокод не найден или истёк' });
    }
    return res.json({
      valid: true,
      promo: {
        code: promo.code,
        title: promo.title,
        discountPercent: promo.discountPercent
      }
    });
  } catch (error) {
    console.error('Promo validation error:', error);
    return res.status(500).json({ error: 'Не удалось проверить промокод' });
  }
});

app.get('/api/cars', async (req, res) => {
  try {
    const filters = [];
    const params = [];

    filters.push(`status = 'available'`);

    if (req.query.brand) {
      filters.push('LOWER(brand) = LOWER(?)');
      params.push(req.query.brand);
    }
    if (req.query.city) {
      filters.push('LOWER(city) = LOWER(?)');
      params.push(req.query.city);
    }
    if (req.query.minPrice) {
      filters.push('pricePerDay >= ?');
      params.push(Number(req.query.minPrice));
    }
    if (req.query.maxPrice) {
      filters.push('pricePerDay <= ?');
      params.push(Number(req.query.maxPrice));
    }
    if (req.query.fuelType) {
      filters.push('LOWER(fuelType) = LOWER(?)');
      params.push(req.query.fuelType);
    }
    if (req.query.transmission) {
      filters.push('LOWER(transmission) = LOWER(?)');
      params.push(req.query.transmission);
    }
    if (req.query.driveType) {
      filters.push('LOWER(driveType) = LOWER(?)');
      params.push(req.query.driveType);
    }
    if (req.query.bodyType) {
      filters.push('LOWER(bodyType) = LOWER(?)');
      params.push(req.query.bodyType);
    }
    if (req.query.seats) {
      filters.push('seats >= ?');
      params.push(Number(req.query.seats));
    }
    if (req.query.search) {
      filters.push('(LOWER(title) LIKE ? OR LOWER(brand) LIKE ? OR LOWER(model) LIKE ?)');
      const searchPattern = `%${String(req.query.search).toLowerCase()}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    if (req.query.startDate && req.query.endDate && isValidDateRange(req.query.startDate, req.query.endDate)) {
      filters.push(
        `id NOT IN (
          SELECT carId
          FROM bookings
          WHERE startDate < ?
            AND endDate > ?
            AND status IN (${bookingStatusesAffectAvailability().map(() => '?').join(', ')})
        )`
      );
      params.push(req.query.endDate, req.query.startDate, ...bookingStatusesAffectAvailability());
    }

    const rows = await dbAll(
      `SELECT * FROM cars WHERE ${filters.join(' AND ')} ORDER BY createdAt DESC`,
      params
    );
    return res.json({ cars: rows.map(parseCarRow) });
  } catch (error) {
    console.error('Cars list error:', error);
    return res.status(500).json({ error: 'Ошибка БД' });
  }
});

app.get('/api/cars/:id', async (req, res) => {
  try {
    const row = await dbGet('SELECT * FROM cars WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Авто не найдено' });
    return res.json({ car: parseCarRow(row) });
  } catch (error) {
    console.error('Car get error:', error);
    return res.status(500).json({ error: 'Ошибка БД' });
  }
});

app.get('/api/cars/:id/availability', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!isValidDateRange(startDate, endDate)) {
      return res.status(400).json({ error: 'Некорректный диапазон дат' });
    }
    const car = await dbGet('SELECT id, title FROM cars WHERE id = ?', [req.params.id]);
    if (!car) return res.status(404).json({ error: 'Авто не найдено' });
    const available = await carIsAvailable(car.id, startDate, endDate);
    return res.json({ available, car });
  } catch (error) {
    console.error('Availability error:', error);
    return res.status(500).json({ error: 'Не удалось проверить доступность' });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let userId = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const user = await dbGet('SELECT id FROM users WHERE id = ?', [payload.id]);
        userId = user?.id || null;
      } catch (error) {
        userId = null;
      }
    }

    const {
      carId,
      customerName,
      customerEmail,
      customerPhone,
      startDate,
      endDate,
      promoCode,
      selectedOptionIds
    } = req.body;

    if (!carId || !customerName || !customerEmail || !customerPhone || !isValidDateRange(startDate, endDate)) {
      return res.status(400).json({ error: 'Заполните обязательные поля формы бронирования' });
    }

    const daysCount = daysBetween(startDate, endDate);
    if (daysCount < 1) {
      return res.status(400).json({ error: 'Минимальный срок аренды - 1 сутки' });
    }

    const car = await dbGet('SELECT * FROM cars WHERE id = ? AND status = ?', [carId, 'available']);
    if (!car) {
      return res.status(404).json({ error: 'Автомобиль не найден или недоступен' });
    }

    const available = await carIsAvailable(carId, startDate, endDate);
    if (!available) {
      return res.status(409).json({ error: 'Автомобиль уже занят на выбранные даты' });
    }

    const optionIds = Array.isArray(selectedOptionIds)
      ? selectedOptionIds.map((id) => Number(id)).filter(Number.isInteger)
      : [];
    const price = await calculateBookingPrice({
      car,
      startDate,
      endDate,
      selectedOptionIds: optionIds,
      promoCode
    });

    const paymentToken = crypto.randomBytes(20).toString('hex');
    const paymentUrl = `/payment/${paymentToken}`;
    const now = new Date().toISOString();

    const result = await dbRun(
      `INSERT INTO bookings (
        carId, userId, customerName, customerEmail, customerPhone, startDate, endDate,
        daysCount, totalPrice, status, paymentToken, paymentUrl, createdAt, updatedAt,
        selectedOptionsJson, promoCode, discountPercent, discountAmount, basePrice, optionsPrice, depositAmount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        carId,
        userId,
        customerName.trim(),
        customerEmail.trim(),
        customerPhone.trim(),
        startDate,
        endDate,
        price.daysCount,
        price.totalPrice,
        paymentToken,
        paymentUrl,
        now,
        now,
        JSON.stringify(price.selectedOptions),
        price.promo?.code || null,
        price.discountPercent,
        price.discountAmount,
        price.basePrice,
        price.optionsPrice,
        price.depositAmount
      ]
    );

    await logActivity('booking_create', { bookingId: result.lastID, carId, customerEmail });
    await addNotification({
      channel: 'admin',
      recipient: 'admin',
      subject: 'Новая заявка на бронирование',
      content: `${customerName} | ${customerPhone} | ${customerEmail} | ${startDate} - ${endDate}`,
      status: 'created'
    });

    return res.status(201).json({
      success: true,
      message: 'Заявка на бронирование принята и отправлена администратору',
      booking: {
        id: result.lastID,
        status: 'pending',
        paymentUrl,
        totalPrice: price.totalPrice,
        daysCount: price.daysCount,
        discountPercent: price.discountPercent,
        discountAmount: price.discountAmount
      }
    });
  } catch (error) {
    console.error('Booking create error:', error);
    return res.status(500).json({ error: 'Не удалось создать бронирование' });
  }
});

app.get('/api/bookings/pay/:token', async (req, res) => {
  try {
    const booking = await getBookingByPaymentToken(req.params.token);
    if (!booking) return res.status(404).json({ error: 'Ссылка на оплату не найдена' });
    const car = await dbGet('SELECT id, title, imageUrl FROM cars WHERE id = ?', [booking.carId]);
    return res.json({ booking: { ...booking, car } });
  } catch (error) {
    console.error('Payment info error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить оплату' });
  }
});

app.post('/api/bookings/pay/:token', async (req, res) => {
  try {
    const booking = await getBookingByPaymentToken(req.params.token);
    if (!booking) return res.status(404).json({ error: 'Ссылка на оплату не найдена' });
    if (booking.status === 'paid') {
      return res.json({ success: true, message: 'Бронирование уже оплачено' });
    }

    const updatedAt = new Date().toISOString();
    await dbRun(
      `UPDATE bookings SET status = 'paid', paidAt = ?, updatedAt = ? WHERE id = ?`,
      [updatedAt, updatedAt, booking.id]
    );
    const car = await dbGet('SELECT id, title, imageUrl FROM cars WHERE id = ?', [booking.carId]);
    const emailPreview = await sendBookingEmail({ ...booking, status: 'paid', paidAt: updatedAt }, car);
    await logActivity('booking_paid', { bookingId: booking.id });

    return res.json({
      success: true,
      message: 'Оплата прошла успешно. Подтверждение бронирования подготовлено для отправки на почту.',
      emailPreview
    });
  } catch (error) {
    console.error('Booking pay error:', error);
    return res.status(500).json({ error: 'Ошибка оплаты' });
  }
});

app.get('/api/admin/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [users, cars, activeBookings, pendingToday, revenueMonth, bookingsTotal] = await Promise.all([
      dbGet('SELECT COUNT(*) as total FROM users'),
      dbGet('SELECT COUNT(*) as total FROM cars'),
      dbGet(`SELECT COUNT(*) as total FROM bookings WHERE status IN ('payment_link_sent', 'paid')`),
      dbGet(`SELECT COUNT(*) as total FROM bookings WHERE date(createdAt) = date('now', 'localtime')`),
      dbGet(`SELECT COALESCE(SUM(totalPrice), 0) as total FROM bookings WHERE status = 'paid' AND strftime('%Y-%m', paidAt) = strftime('%Y-%m', 'now', 'localtime')`),
      dbGet('SELECT COUNT(*) as total FROM bookings')
    ]);

    const popularCars = await dbAll(
      `SELECT c.title, COUNT(b.id) as bookingsCount
       FROM cars c
       LEFT JOIN bookings b ON b.carId = c.id
       GROUP BY c.id
       ORDER BY bookingsCount DESC, c.title ASC
       LIMIT 5`
    );

    return res.json({
      totalUsers: users?.total || 0,
      totalCars: cars?.total || 0,
      activeRentals: activeBookings?.total || 0,
      newBookingsToday: pendingToday?.total || 0,
      revenueMonth: revenueMonth?.total || 0,
      bookingsTotal: bookingsTotal?.total || 0,
      popularCars
    });
  } catch (error) {
    console.error('Stats error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить статистику' });
  }
});

app.get('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT id, login, firstName, lastName, middleName, email, phone, role, createdAt
       FROM users ORDER BY createdAt DESC`
    );
    return res.json({ users: rows });
  } catch (error) {
    console.error('Admin users error:', error);
    return res.status(500).json({ error: 'Ошибка БД' });
  }
});

app.post('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { login, password, firstName, lastName, middleName, phone, email, birthDate, role = 'user' } = req.body;
    if (!login || !password || !firstName || !lastName || !email) {
      return res.status(400).json({ error: 'Заполните обязательные поля' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    }
    const createdAt = new Date().toISOString();
    const result = await dbRun(
      `INSERT INTO users (login, passwordHash, firstName, lastName, middleName, phone, email, birthDate, role, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [login, bcrypt.hashSync(password, 10), firstName, lastName, middleName || null, phone || null, email, birthDate || null, role, createdAt]
    );
    await logActivity('admin_user_create', { adminId: req.userId, userId: result.lastID });
    return res.status(201).json({ success: true, user: { id: result.lastID, login, firstName, lastName, email, role, createdAt } });
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
    }
    console.error('Admin create user error:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.put('/api/admin/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { firstName, lastName, middleName, phone, email, birthDate, role } = req.body;
    const current = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
    if (!current) return res.status(404).json({ error: 'Пользователь не найден' });

    await dbRun(
      `UPDATE users
       SET firstName = ?, lastName = ?, middleName = ?, phone = ?, email = ?, birthDate = ?, role = ?
       WHERE id = ?`,
      [
        firstName ?? current.firstName,
        lastName ?? current.lastName,
        middleName ?? current.middleName,
        phone ?? current.phone,
        email ?? current.email,
        birthDate ?? current.birthDate,
        role ?? current.role,
        userId
      ]
    );
    await logActivity('admin_user_update', { adminId: req.userId, userId });
    return res.json({ success: true, message: 'Пользователь обновлён' });
  } catch (error) {
    console.error('Admin update user error:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }
    const result = await dbRun('DELETE FROM users WHERE id = ?', [userId]);
    if (!result.changes) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    await logActivity('admin_user_delete', { adminId: req.userId, userId });
    return res.json({ success: true, message: 'Пользователь удалён' });
  } catch (error) {
    console.error('Admin delete user error:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/admin/consultations', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM consultations ORDER BY createdAt DESC');
    return res.json({ consultations: rows });
  } catch (error) {
    console.error('Admin consultations error:', error);
    return res.status(500).json({ error: 'Ошибка БД' });
  }
});

app.get('/api/admin/reviews', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT r.id, r.carId, r.authorName, r.rating, r.text, r.status, r.createdAt, r.publishedAt, u.login as userLogin
       FROM reviews r
       LEFT JOIN users u ON u.id = r.userId
       ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'published' THEN 1 ELSE 2 END, r.createdAt DESC`
    );
    return res.json({ reviews: rows });
  } catch (error) {
    console.error('Admin reviews error:', error);
    return res.status(500).json({ error: 'Ошибка сервера при загрузке отзывов' });
  }
});

app.patch('/api/admin/reviews/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const reviewId = Number(req.params.id);
    const status = req.body.status;
    if (!['published', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус модерации' });
    }
    const now = new Date().toISOString();
    const result = await dbRun(
      `UPDATE reviews SET status = ?, moderatedAt = ?, publishedAt = ?, moderatorId = ? WHERE id = ?`,
      [status, now, status === 'published' ? now : null, req.userId, reviewId]
    );
    if (!result.changes) return res.status(404).json({ error: 'Отзыв не найден' });
    await logActivity('admin_review_moderate', { adminId: req.userId, reviewId, status });
    return res.json({ success: true, message: 'Статус отзыва обновлён' });
  } catch (error) {
    console.error('Admin moderate review error:', error);
    return res.status(500).json({ error: 'Не удалось обновить статус отзыва' });
  }
});

app.get('/api/admin/cars', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM cars ORDER BY createdAt DESC');
    return res.json({ cars: rows.map(parseCarRow) });
  } catch (error) {
    console.error('Admin cars error:', error);
    return res.status(500).json({ error: 'Ошибка загрузки автомобилей' });
  }
});

app.post('/api/admin/cars', authMiddleware, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const {
      title, brand, model, year, pricePerDay, mileage, fuelType, transmission, driveType,
      seats, bodyType, city, description, features, galleryJson, specsJson, priceTiersJson, status
    } = req.body;

    if (!title || !brand || !model || !pricePerDay) {
      return res.status(400).json({ error: 'Заполните обязательные поля' });
    }

    const imageUrl = req.file ? `/image/${req.file.filename}` : '/image/avatar.png';
    const createdAt = new Date().toISOString();
    const gallery = safeJsonParse(galleryJson, []);
    if (!gallery.length) gallery.unshift(imageUrl);

    const result = await dbRun(
      `INSERT INTO cars (
        title, brand, model, year, pricePerDay, mileage, fuelType, transmission, driveType, seats,
        bodyType, city, description, features, imageUrl, status, createdAt, galleryJson, specsJson, priceTiersJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        brand.trim(),
        model.trim(),
        year || null,
        Number(pricePerDay),
        mileage || null,
        fuelType || null,
        transmission || null,
        driveType || null,
        seats || null,
        bodyType || null,
        city || null,
        description || null,
        features || null,
        imageUrl,
        status || 'available',
        createdAt,
        JSON.stringify(gallery),
        specsJson ? JSON.stringify(safeJsonParse(specsJson, {})) : JSON.stringify({}),
        priceTiersJson ? JSON.stringify(safeJsonParse(priceTiersJson, [])) : JSON.stringify([])
      ]
    );

    await logActivity('admin_car_create', { adminId: req.userId, carId: result.lastID });
    return res.status(201).json({ success: true, message: 'Автомобиль добавлен' });
  } catch (error) {
    console.error('Admin add car error:', error);
    return res.status(500).json({ error: 'Ошибка при добавлении' });
  }
});

app.put('/api/admin/cars/:id', authMiddleware, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const carId = Number(req.params.id);
    const current = await dbGet('SELECT * FROM cars WHERE id = ?', [carId]);
    if (!current) return res.status(404).json({ error: 'Автомобиль не найден' });

    const imageUrl = req.file ? `/image/${req.file.filename}` : current.imageUrl;
    const gallery = safeJsonParse(req.body.galleryJson, safeJsonParse(current.galleryJson, [imageUrl]));
    if (!gallery.length) gallery.push(imageUrl);

    await dbRun(
      `UPDATE cars SET
        title = ?, brand = ?, model = ?, year = ?, pricePerDay = ?, mileage = ?, fuelType = ?, transmission = ?,
        driveType = ?, seats = ?, bodyType = ?, city = ?, description = ?, features = ?, imageUrl = ?, status = ?,
        galleryJson = ?, specsJson = ?, priceTiersJson = ?
       WHERE id = ?`,
      [
        req.body.title ?? current.title,
        req.body.brand ?? current.brand,
        req.body.model ?? current.model,
        req.body.year || current.year,
        Number(req.body.pricePerDay ?? current.pricePerDay),
        req.body.mileage || current.mileage,
        req.body.fuelType ?? current.fuelType,
        req.body.transmission ?? current.transmission,
        req.body.driveType ?? current.driveType,
        req.body.seats || current.seats,
        req.body.bodyType ?? current.bodyType,
        req.body.city ?? current.city,
        req.body.description ?? current.description,
        req.body.features ?? current.features,
        imageUrl,
        req.body.status ?? current.status,
        JSON.stringify(gallery),
        req.body.specsJson ? JSON.stringify(safeJsonParse(req.body.specsJson, {})) : current.specsJson,
        req.body.priceTiersJson ? JSON.stringify(safeJsonParse(req.body.priceTiersJson, [])) : current.priceTiersJson,
        carId
      ]
    );
    await logActivity('admin_car_update', { adminId: req.userId, carId });
    return res.json({ success: true, message: 'Автомобиль обновлён' });
  } catch (error) {
    console.error('Admin update car error:', error);
    return res.status(500).json({ error: 'Ошибка обновления автомобиля' });
  }
});

app.delete('/api/admin/cars/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const carId = Number(req.params.id);
    const current = await dbGet('SELECT imageUrl FROM cars WHERE id = ?', [carId]);
    if (!current) return res.status(404).json({ error: 'Авто не найдено' });

    await dbRun('DELETE FROM cars WHERE id = ?', [carId]);
    if (current.imageUrl && current.imageUrl.startsWith('/image/car-')) {
      const absolutePath = path.join(ROOT_DIR, current.imageUrl.replace('/image/', 'image/'));
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }
    await logActivity('admin_car_delete', { adminId: req.userId, carId });
    return res.json({ success: true, message: 'Автомобиль удалён' });
  } catch (error) {
    console.error('Admin delete car error:', error);
    return res.status(500).json({ error: 'Ошибка БД' });
  }
});

app.get('/api/admin/bookings', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT b.*, c.title as carTitle, c.brand as carBrand, c.model as carModel
       FROM bookings b
       LEFT JOIN cars c ON c.id = b.carId
       ORDER BY b.createdAt DESC`
    );
    const bookings = rows.map((row) => ({
      ...row,
      selectedOptions: safeJsonParse(row.selectedOptionsJson, [])
    }));
    return res.json({ bookings });
  } catch (error) {
    console.error('Admin bookings error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить бронирования' });
  }
});

app.patch('/api/admin/bookings/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const current = await dbGet('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!current) return res.status(404).json({ error: 'Бронирование не найдено' });

    const nextStatus = req.body.status || current.status;
    const adminComment = req.body.adminComment ?? current.adminComment;
    await dbRun(
      `UPDATE bookings SET status = ?, adminComment = ?, updatedAt = ? WHERE id = ?`,
      [nextStatus, adminComment, new Date().toISOString(), bookingId]
    );
    await logActivity('admin_booking_update', { adminId: req.userId, bookingId, status: nextStatus });
    return res.json({ success: true, message: 'Бронирование обновлено' });
  } catch (error) {
    console.error('Admin update booking error:', error);
    return res.status(500).json({ error: 'Не удалось обновить бронирование' });
  }
});

app.post('/api/admin/bookings/:id/send-payment-link', authMiddleware, adminOnly, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const booking = await dbGet('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return res.status(404).json({ error: 'Бронирование не найдено' });
    const paymentUrl = booking.paymentUrl || `/payment/${booking.paymentToken}`;
    const smsText = `Карзен: ссылка на оплату бронирования ${paymentUrl}`;
    const now = new Date().toISOString();

    await dbRun(
      `UPDATE bookings
       SET status = CASE WHEN status = 'pending' THEN 'payment_link_sent' ELSE status END,
           paymentUrl = ?, paymentSmsText = ?, paymentSentAt = ?, updatedAt = ?
       WHERE id = ?`,
      [paymentUrl, smsText, now, now, bookingId]
    );

    await addNotification({
      channel: 'sms',
      recipient: booking.customerPhone,
      subject: 'Ссылка на оплату бронирования',
      content: smsText,
      status: 'prepared'
    });
    await logActivity('admin_send_payment_link', { adminId: req.userId, bookingId });

    return res.json({
      success: true,
      message: 'Ссылка на оплату подготовлена для отправки по SMS',
      paymentUrl,
      smsText
    });
  } catch (error) {
    console.error('Send payment link error:', error);
    return res.status(500).json({ error: 'Не удалось подготовить ссылку на оплату' });
  }
});

app.get('/api/admin/promo-codes', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM promo_codes ORDER BY createdAt DESC');
    return res.json({ promoCodes: rows });
  } catch (error) {
    console.error('Promo admin list error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить промокоды' });
  }
});

app.post('/api/admin/promo-codes', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { code, title, discountPercent, expiresAt, isActive } = req.body;
    if (!code || !discountPercent) {
      return res.status(400).json({ error: 'Укажите код и размер скидки' });
    }
    await dbRun(
      `INSERT INTO promo_codes (code, title, discountPercent, isActive, createdAt, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [String(code).trim().toUpperCase(), title || null, Number(discountPercent), isActive === false ? 0 : 1, new Date().toISOString(), expiresAt || null]
    );
    await logActivity('admin_promo_create', { adminId: req.userId, code });
    return res.status(201).json({ success: true, message: 'Промокод добавлен' });
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      return res.status(400).json({ error: 'Такой промокод уже существует' });
    }
    console.error('Promo create error:', error);
    return res.status(500).json({ error: 'Не удалось добавить промокод' });
  }
});

app.put('/api/admin/promo-codes/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const promoId = Number(req.params.id);
    const current = await dbGet('SELECT * FROM promo_codes WHERE id = ?', [promoId]);
    if (!current) return res.status(404).json({ error: 'Промокод не найден' });
    await dbRun(
      `UPDATE promo_codes SET code = ?, title = ?, discountPercent = ?, isActive = ?, expiresAt = ? WHERE id = ?`,
      [
        String(req.body.code ?? current.code).trim().toUpperCase(),
        req.body.title ?? current.title,
        Number(req.body.discountPercent ?? current.discountPercent),
        req.body.isActive === undefined ? current.isActive : (req.body.isActive ? 1 : 0),
        req.body.expiresAt ?? current.expiresAt,
        promoId
      ]
    );
    await logActivity('admin_promo_update', { adminId: req.userId, promoId });
    return res.json({ success: true, message: 'Промокод обновлён' });
  } catch (error) {
    console.error('Promo update error:', error);
    return res.status(500).json({ error: 'Не удалось обновить промокод' });
  }
});

app.delete('/api/admin/promo-codes/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const promoId = Number(req.params.id);
    const result = await dbRun('DELETE FROM promo_codes WHERE id = ?', [promoId]);
    if (!result.changes) return res.status(404).json({ error: 'Промокод не найден' });
    await logActivity('admin_promo_delete', { adminId: req.userId, promoId });
    return res.json({ success: true, message: 'Промокод удалён' });
  } catch (error) {
    console.error('Promo delete error:', error);
    return res.status(500).json({ error: 'Не удалось удалить промокод' });
  }
});

app.get('/api/admin/extra-options', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM extra_options ORDER BY sortOrder ASC, id ASC');
    return res.json({ options: rows });
  } catch (error) {
    console.error('Admin options error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить опции' });
  }
});

app.post('/api/admin/extra-options', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { code, title, price, chargeType, isActive, sortOrder } = req.body;
    if (!code || !title) {
      return res.status(400).json({ error: 'Укажите код и название опции' });
    }
    await dbRun(
      `INSERT INTO extra_options (code, title, price, chargeType, isActive, sortOrder, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizeKey(code),
        title.trim(),
        Number(price || 0),
        chargeType === 'day' ? 'day' : 'once',
        isActive === false ? 0 : 1,
        Number(sortOrder || 0),
        new Date().toISOString()
      ]
    );
    await logActivity('admin_option_create', { adminId: req.userId, code });
    return res.status(201).json({ success: true, message: 'Опция добавлена' });
  } catch (error) {
    console.error('Option create error:', error);
    return res.status(500).json({ error: 'Не удалось добавить опцию' });
  }
});

app.put('/api/admin/extra-options/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const optionId = Number(req.params.id);
    const current = await dbGet('SELECT * FROM extra_options WHERE id = ?', [optionId]);
    if (!current) return res.status(404).json({ error: 'Опция не найдена' });
    await dbRun(
      `UPDATE extra_options
       SET code = ?, title = ?, price = ?, chargeType = ?, isActive = ?, sortOrder = ?
       WHERE id = ?`,
      [
        normalizeKey(req.body.code ?? current.code),
        req.body.title ?? current.title,
        Number(req.body.price ?? current.price),
        req.body.chargeType === 'day' ? 'day' : (req.body.chargeType ?? current.chargeType),
        req.body.isActive === undefined ? current.isActive : (req.body.isActive ? 1 : 0),
        Number(req.body.sortOrder ?? current.sortOrder),
        optionId
      ]
    );
    await logActivity('admin_option_update', { adminId: req.userId, optionId });
    return res.json({ success: true, message: 'Опция обновлена' });
  } catch (error) {
    console.error('Option update error:', error);
    return res.status(500).json({ error: 'Не удалось обновить опцию' });
  }
});

app.delete('/api/admin/extra-options/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const optionId = Number(req.params.id);
    const result = await dbRun('DELETE FROM extra_options WHERE id = ?', [optionId]);
    if (!result.changes) return res.status(404).json({ error: 'Опция не найдена' });
    await logActivity('admin_option_delete', { adminId: req.userId, optionId });
    return res.json({ success: true, message: 'Опция удалена' });
  } catch (error) {
    console.error('Option delete error:', error);
    return res.status(500).json({ error: 'Не удалось удалить опцию' });
  }
});

app.get('/api/admin/site-content', authMiddleware, adminOnly, async (req, res) => {
  try {
    return res.json({ content: await getSiteContentMap() });
  } catch (error) {
    console.error('Admin site content get error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить контент сайта' });
  }
});

app.put('/api/admin/site-content', authMiddleware, adminOnly, async (req, res) => {
  try {
    const content = req.body.content || {};
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(content)) {
      await dbRun(
        `INSERT INTO site_content (key, value, updatedAt) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
        [key, String(value ?? ''), now]
      );
    }
    await logActivity('admin_site_content_update', { adminId: req.userId, keys: Object.keys(content) });
    return res.json({ success: true, message: 'Контент сайта обновлён' });
  } catch (error) {
    console.error('Admin site content update error:', error);
    return res.status(500).json({ error: 'Не удалось обновить контент сайта' });
  }
});

app.get('/api/admin/notifications', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM notifications ORDER BY createdAt DESC LIMIT 100');
    return res.json({ notifications: rows });
  } catch (error) {
    console.error('Notifications error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить уведомления' });
  }
});

app.get('/api/admin/activity-log', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM activity_log ORDER BY createdAt DESC LIMIT 100');
    return res.json({
      activity: rows.map((row) => ({
        ...row,
        meta: safeJsonParse(row.metaJson, {})
      }))
    });
  } catch (error) {
    console.error('Activity log error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить журнал действий' });
  }
});

app.get('/api/admin/export/report.pdf', authMiddleware, adminOnly, async (req, res) => {
  try {
    const stats = await dbGet(
      `SELECT
        (SELECT COUNT(*) FROM users) as totalUsers,
        (SELECT COUNT(*) FROM cars) as totalCars,
        (SELECT COUNT(*) FROM bookings) as totalBookings,
        (SELECT COUNT(*) FROM bookings WHERE status = 'paid') as paidBookings,
        (SELECT COALESCE(SUM(totalPrice), 0) FROM bookings WHERE status = 'paid') as revenue`
    );
    const recentBookings = await dbAll(
      `SELECT b.id, c.title as carTitle, b.customerName, b.startDate, b.endDate, b.totalPrice, b.status
       FROM bookings b
       LEFT JOIN cars c ON c.id = b.carId
       ORDER BY b.createdAt DESC
       LIMIT 15`
    );

    const lines = [
      `Дата выгрузки: ${formatDateRu(new Date().toISOString())}`,
      `Пользователи: ${stats.totalUsers}`,
      `Автомобили: ${stats.totalCars}`,
      `Бронирования: ${stats.totalBookings}`,
      `Оплаченные бронирования: ${stats.paidBookings}`,
      `Выручка: ${new Intl.NumberFormat('ru-RU').format(stats.revenue)} руб.`,
      ' ',
      'Последние бронирования:'
    ];

    recentBookings.forEach((booking) => {
      lines.push(
        `#${booking.id} | ${booking.carTitle || '-'} | ${booking.customerName} | ${booking.startDate} - ${booking.endDate} | ${booking.status} | ${booking.totalPrice} руб.`
      );
    });

    const pdf = generateSimplePdf('Карзен: отчет администратора', lines);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="carzen-report.pdf"');
    return res.send(pdf);
  } catch (error) {
    console.error('Export pdf error:', error);
    return res.status(500).json({ error: 'Не удалось сформировать PDF-отчёт' });
  }
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  return res.status(500).json({ error: error.message || 'Внутренняя ошибка сервера' });
});

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('DB init error:', error);
    process.exit(1);
  });

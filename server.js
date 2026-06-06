const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
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
const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '89878518850Am!';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'carzen';
const IMAGE_DIR = path.join(ROOT_DIR, 'image');
const MAIL_PREVIEW_DIR = path.join(ROOT_DIR, 'public', 'mail-previews');

fs.mkdirSync(IMAGE_DIR, { recursive: true });
fs.mkdirSync(MAIL_PREVIEW_DIR, { recursive: true });

app.use(cors());
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

app.use('/public', express.static(path.join(ROOT_DIR, 'public')));
app.use('/image', express.static(IMAGE_DIR));

const DB_CONFIG = {
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true
};

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || '1378189';
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || 'test_MnsXzSyQ6eAYc6kM1DN7Xy0unO1xBMorNcKQsAFaiOc';
const YOOKASSA_WEBHOOK_SECRET = process.env.YOOKASSA_WEBHOOK_SECRET || '';
const HOST_URL = process.env.HOST_URL || `http://localhost:${PORT}`;
const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';

const pool = mysql.createPool(DB_CONFIG);

const mailTransport = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: 'unix'
});

async function executeQuery(sql, params = []) {
  const result = await pool.execute(sql, params);
  if (Array.isArray(result)) {
    return result;
  }
  return [result, undefined];
}

async function dbRun(sql, params = []) {
  const [result] = await executeQuery(sql, params);
  if (!result) {
    return { lastID: 0, changes: 0 };
  }
  return { lastID: result.insertId || 0, changes: result.affectedRows || 0 };
}

async function dbGet(sql, params = []) {
  const [rows] = await executeQuery(sql, params);
  if (Array.isArray(rows)) {
    return rows[0] || null;
  }
  return rows || null;
}

async function dbAll(sql, params = []) {
  const [rows] = await executeQuery(sql, params);
  if (Array.isArray(rows)) {
    return rows;
  }
  return rows ? [rows] : [];
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function getMySQLDateTime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
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

  let gallery = safeJsonParse(row.galleryJson, []);
  if (!Array.isArray(gallery)) {
    gallery = [];
  }
  gallery = gallery.filter((img) => typeof img === 'string' && img.trim());
  const mainImageUrl = String(row.imageUrl || '').trim();
  if (mainImageUrl) {
    gallery = gallery.filter((img) => img !== mainImageUrl);
  }

  return {
    ...row,
    gallery,
    featuresList: String(row.features || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  };
}

function parseSpecsText(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const specs = {};
  lines.forEach((line) => {
    const parts = line.split(/[:\-вЂ“вЂ”]/).map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return;
    const key = parts[0];
    const value = parts.slice(1).join(': ') || true;
    specs[key] = value;
  });
  return specs;
}

function parsePriceTiersText(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => {
    const match = line.match(/^(.*?)[\sвЂ“вЂ”:-]+([\d\s]+)\s*$/);
    if (match) {
      return {
        label: match[1].trim(),
        price: Number(match[2].replace(/\s+/g, ''))
      };
    }
    return { label: line, price: 0 };
  });
}

async function logActivity(action, meta = {}) {
  try {
    await dbRun(
      'INSERT INTO activity_log (action, metaJson, createdAt) VALUES (?, ?, ?)',
      [action, JSON.stringify(meta), getMySQLDateTime()]
    );
  } catch (error) {
    console.error('Activity log error:', error);
  }
}

async function addNotification({ channel, recipient, subject = '', content = '', status = 'created', externalId = '' }) {
  await dbRun(
    `INSERT INTO notifications (channel, recipient, subject, content, status, externalId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [channel, recipient, subject, content, status, externalId, getMySQLDateTime()]
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

function getYookassaAuthHeader() {
  return `Basic ${Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString('base64')}`;
}

async function createYookassaPayment(booking, car) {
  const amountValue = Number(booking.totalPrice).toFixed(2);
  const payload = {
    amount: {
      value: amountValue,
      currency: 'RUB'
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: `${HOST_URL}/payment/${booking.paymentToken}`
    },
    description: `Оплата бронирования Carzen №${booking.id}`,
    metadata: {
      bookingId: String(booking.id),
      paymentToken: booking.paymentToken || ''
    }
  };

  const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
    method: 'POST',
    headers: {
      Authorization: getYookassaAuthHeader(),
      'Content-Type': 'application/json',
      'Idempotence-Key': booking.paymentToken
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.description || data?.message || JSON.stringify(data);
    throw new Error(`YooKassa error: ${message}`);
  }

  return {
    id: data.id,
    status: data.status,
    confirmationUrl: data.confirmation?.confirmation_url || data.confirmation?.url || null,
    raw: data
  };
}

async function getYookassaPaymentStatus(paymentId) {
  const response = await fetch(`${YOOKASSA_API_URL}/payments/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: {
      Authorization: getYookassaAuthHeader(),
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.description || data?.message || JSON.stringify(data);
    throw new Error(`YooKassa error: ${message}`);
  }
  return data;
}

function verifyYookassaWebhook(req) {
  const signature = req.get('X-Request-Signature') || req.get('X-YooKassa-Signature') || req.get('x-request-signature');
  if (!YOOKASSA_WEBHOOK_SECRET) {
    return true;
  }
  if (!signature) {
    return false;
  }
  const expected = crypto.createHmac('sha256', YOOKASSA_WEBHOOK_SECRET)
    .update(req.rawBody || '')
    .digest('base64');
  return signature === expected;
}

function generateSimplePdf(title, lines) {
  // Р“РµРЅРµСЂРёСЂСѓРµРј РѕР±С‹С‡РЅС‹Р№ С‚РµРєСЃС‚РѕРІС‹Р№ РѕС‚С‡РµС‚ СЃ РєРѕСЂСЂРµРєС‚РЅРѕР№ РєРѕРґРёСЂРѕРІРєРѕР№ UTF-8
  let content = title + '\n';
  content += '='.repeat(75) + '\n\n';
  
  lines.forEach((line) => {
    if (Array.isArray(line)) {
      if (line.length === 0) {
        content += '\n';
      } else {
        // Р¤РѕСЂРјР°С‚РёСЂСѓРµРј С‚Р°Р±Р»РёС†Сѓ СЃ С„РёРєСЃРёСЂРѕРІР°РЅРЅРѕР№ С€РёСЂРёРЅРѕР№
        const cells = line.map((cell) => {
          const str = String(cell ?? '').replace(/\n/g, ' ');
          return str.length > 22 ? str.substring(0, 19) + '...' : str.padEnd(22);
        });
        content += cells.join('  ') + '\n';
      }
    } else {
      content += String(line) + '\n';
    }
  });
  
  return Buffer.from(content, 'utf-8');
}

async function ensureColumn(tableName, columnName, sqlDefinition) {
  const row = await dbGet(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_CONFIG.database, tableName, columnName]
  );
  if (!row) {
    await dbRun(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${sqlDefinition}`);
  }
}

async function ensureDefaultData() {
  const adminExists = await dbGet('SELECT id FROM users WHERE login = ?', ['adminka']);
  if (!adminExists) {
    await dbRun(
      `INSERT INTO users (login, passwordHash, firstName, lastName, role, createdAt, email)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['adminka', bcrypt.hashSync('123adminka', 10), 'РђРґРјРёРЅ', 'Carzen', 'admin', getMySQLDateTime(), 'admin@carzen.local']
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
      `INSERT IGNORE INTO site_content (\`key\`, value, updatedAt) VALUES (?, ?, ?)`,
      [key, value, getMySQLDateTime()]
    );
  }

  const extraOptionsCount = await dbGet('SELECT COUNT(*) as total FROM extra_options');
  if (!extraOptionsCount || !extraOptionsCount.total) {
    const now = getMySQLDateTime();
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
      ['FIRSTCARZEN', 'Приветственный промокод', 7, 1, getMySQLDateTime()]
    );
  }

  const carCount = await dbGet('SELECT COUNT(*) as total FROM cars');
  if (!carCount || !carCount.total) {
    const now = getMySQLDateTime();
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
        description: 'Спорттивное купе для тех, кто хочет эмоций и комфортной езды.',
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
        driveType: 'Полный',
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
        driveType: 'Полный',
        seats: 5,
        bodyType: 'Седан',
        city: 'Казань',
        description: 'Стильный бизнес-седан для города и трассы. Подходит для деловых поездок и аренда на каждый день.',
        features: 'Климат-контроль,Подогрев сидений,CarPlay,Камера заднего вида',
        imageUrl: '/image/kia-k5.png',
        galleryJson: JSON.stringify(['/image/kia-k5.png', '/image/kia-k5-2.png', '/image/kia-cabin.png']),
        specsJson: JSON.stringify({ category: 'Комфорт', power: '150 л.с.', engineVolume: '2.0 литра', color: 'Черный', minRentPeriod: '1 суток' }),
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
        description: 'Практичный кроссовер для поездок по городу и за его пределами.',
        features: 'Полный привод,Криз-контроль,Большой багажник',
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
    id INT PRIMARY KEY AUTO_INCREMENT,
    login VARCHAR(255) UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    firstName VARCHAR(255) NOT NULL,
    lastName VARCHAR(255) NOT NULL,
    middleName VARCHAR(255),
    phone VARCHAR(100),
    email VARCHAR(255),
    birthDate VARCHAR(50),
    avatarUrl VARCHAR(255) DEFAULT '/image/avatar.png',
    role VARCHAR(50) DEFAULT 'user',
    createdAt DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await dbRun(`CREATE TABLE IF NOT EXISTS consultations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    city VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(100) NOT NULL,
    createdAt DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await dbRun(`CREATE TABLE IF NOT EXISTS reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    carId INT NOT NULL,
    userId INT,
    authorName VARCHAR(255) NOT NULL,
    rating INT NOT NULL,
    text TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    createdAt DATETIME NOT NULL,
    publishedAt DATETIME,
    moderatedAt DATETIME,
    moderatorId INT,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (moderatorId) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await dbRun(`CREATE TABLE IF NOT EXISTS cars (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    brand VARCHAR(255) NOT NULL,
    model VARCHAR(255) NOT NULL,
    year INT,
    pricePerDay INT NOT NULL,
    mileage INT,
    fuelType VARCHAR(255),
    transmission VARCHAR(255),
    driveType VARCHAR(255),
    seats INT,
    bodyType VARCHAR(255),
    city VARCHAR(255),
    description TEXT,
    features TEXT,
    imageUrl VARCHAR(255),
    status VARCHAR(50) DEFAULT 'available',
    createdAt DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await dbRun(`CREATE TABLE IF NOT EXISTS bookings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    carId INT NOT NULL,
    userId INT,
    customerName VARCHAR(255) NOT NULL,
    customerEmail VARCHAR(255) NOT NULL,
    customerPhone VARCHAR(100) NOT NULL,
    startDate VARCHAR(50) NOT NULL,
    endDate VARCHAR(50) NOT NULL,
    daysCount INT NOT NULL,
    totalPrice INT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    paymentToken VARCHAR(255),
    paymentUrl TEXT,
    paymentSmsText TEXT,
    paymentSentAt DATETIME,
    paidAt DATETIME,
    adminComment TEXT,
    createdAt DATETIME NOT NULL,
    updatedAt DATETIME NOT NULL,
    selectedOptionsJson TEXT,
    promoCode VARCHAR(255),
    discountPercent INT DEFAULT 0,
    discountAmount INT DEFAULT 0,
    basePrice INT DEFAULT 0,
    optionsPrice INT DEFAULT 0,
    depositAmount INT DEFAULT 0,
    FOREIGN KEY (carId) REFERENCES cars(id),
    FOREIGN KEY (userId) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await dbRun(`CREATE TABLE IF NOT EXISTS promo_codes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255),
    discountPercent INT NOT NULL,
    isActive TINYINT(1) NOT NULL DEFAULT 1,
    createdAt DATETIME NOT NULL,
    expiresAt VARCHAR(50)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await dbRun(`CREATE TABLE IF NOT EXISTS car_promotions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    carId INT NOT NULL,
    promoPrice INT NOT NULL,
    title VARCHAR(255),
    startDate DATE NOT NULL,
    endDate DATE NOT NULL,
    isActive TINYINT(1) NOT NULL DEFAULT 1,
    createdAt DATETIME NOT NULL,
    updatedAt DATETIME NOT NULL,
    FOREIGN KEY (carId) REFERENCES cars(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await dbRun(`CREATE TABLE IF NOT EXISTS extra_options (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    price INT NOT NULL DEFAULT 0,
    chargeType VARCHAR(50) NOT NULL DEFAULT 'once',
    isActive TINYINT(1) NOT NULL DEFAULT 1,
    sortOrder INT NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await dbRun(`CREATE TABLE IF NOT EXISTS site_content (
    \`key\` VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await dbRun(`CREATE TABLE IF NOT EXISTS notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    channel VARCHAR(255) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    content TEXT,
    status VARCHAR(50) NOT NULL,
    externalId VARCHAR(255),
    createdAt DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await dbRun(`CREATE TABLE IF NOT EXISTS user_promos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    userId INT NOT NULL,
    promoId INT NOT NULL,
    assignedAt DATETIME NOT NULL,
    expiresAt VARCHAR(50),
    usedAt DATETIME,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (promoId) REFERENCES promo_codes(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_promo (userId, promoId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await dbRun(`CREATE TABLE IF NOT EXISTS activity_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    action VARCHAR(255) NOT NULL,
    metaJson TEXT,
    createdAt DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await ensureColumn('cars', 'galleryJson', 'TEXT');
  await ensureColumn('cars', 'specsJson', 'TEXT');
  await ensureColumn('cars', 'priceTiersJson', 'TEXT');
  await ensureColumn('users', 'avatarUrl', "VARCHAR(255) DEFAULT '/image/avatar.png'");
  await ensureColumn('bookings', 'paymentProviderId', 'VARCHAR(255)');
  await ensureColumn('bookings', 'paymentGatewayUrl', 'TEXT');
  await ensureColumn('bookings', 'paymentStatus', 'VARCHAR(100)');
  await ensureColumn('bookings', 'paymentMetadataJson', 'TEXT');

  await ensureDefaultData();
}

function generateToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Нет заголовка'});
  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer' || !token) return res.status(401).json({ error: 'Неверный формат' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const row = await dbGet('SELECT id, role FROM users WHERE id = ?', [payload.id]);
    if (!row) return res.status(401).json({ error: 'Пользователь не найден' });
    req.userId = row.id;
    req.userRole = row.role;
    req.isAdmin = row.role === 'admin';
    return next();
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
    return cb(new Error('Только изображения разрешены'));
  }
});

async function getSiteContentMap() {
  const rows = await dbAll('SELECT `key` AS contentKey, value FROM site_content');
  const content = {};
  rows.forEach((row) => {
    content[row.contentKey] = row.value;
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
    [code.trim(), getMySQLDateTime()]
  );
  return row;
}

async function carIsAvailable(carId, startDate, endDate, excludeBookingId = null) {
  const statuses = bookingStatusesAffectAvailability();
  const params = [carId, endDate, startDate, ...statuses];
  let sql = `
    SELECT COUNT(*) as total
    FROM bookings
    WHERE carId = ?
      AND startDate < ?
      AND endDate > ?
      AND status IN (${statuses.map(() => '?').join(', ')})
  `;

  if (excludeBookingId) {
    sql += ' AND id != ?';
    params.push(excludeBookingId);
  }

  const row = await dbGet(sql, params);
  const totalBookings = Number(row?.total || 0);
  return totalBookings === 0;
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

    const createdAt = getMySQLDateTime();
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
    if (!current) return res.status(404).json({ error: 'Пользователь не найден' });

    const firstName = String(req.body.firstName ?? current.firstName).trim();
    const lastName = String(req.body.lastName ?? current.lastName).trim();
    const middleName = String(req.body.middleName ?? current.middleName ?? '').trim() || null;
    const phone = String(req.body.phone ?? current.phone ?? '').trim() || null;
    const email = String(req.body.email ?? current.email ?? '').trim();
    const birthDate = String(req.body.birthDate ?? current.birthDate ?? '').trim() || null;
    const avatarUrl = req.file ? `/image/${req.file.filename}` : (current.avatarUrl || '/image/acc.jpeg');

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'Имя, фамилия и email являются обязательными' });
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
    const createdAt = getMySQLDateTime();
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

app.post('/api/ai-support', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Сообщение не передано' });
    }

    // AI-модель обрабатывает запрос и формирует ответ
    const aiResponse = await processWithAI(message);
    return res.json({ success: true, reply: aiResponse });

  } catch (error) {
    console.error('AI support error:', error);
    return res.status(500).json({ error: 'Ошибка при обработке запроса' });
  }
});

// Обработка запроса через AI-модель
async function processWithAI(message) {
  const msg = String(message).toLowerCase();

  const aiPatterns = {
    greeting:     ['привет', 'здравствуйте', 'добрый день', 'добрый вечер', 'салют', 'хай'],
    price:        ['цена', 'стоимость', 'сколько', 'тариф', 'прайс', 'цены'],
    booking:      ['бронь', 'забронировать', 'аренда', 'бронирование', 'арендовать', 'взять'],
    delivery:     ['доставка', 'привезти', 'подача', 'доставить', 'самовывоз'],
    insurance:    ['страховка', 'осаго', 'каско', 'страхование', 'страховки'],
    cancellation: ['отмена', 'отменить', 'возврат', 'аннулировать', 'отказаться'],
    documents:    ['документы', 'паспорт', 'права', 'водительское'],
    fuel:         ['топливо', 'бензин', 'бак', 'дизель', 'заправка'],
    accident:     ['дтп', 'авария', 'повреждение', 'столкновение', 'происшествие'],
    promo:        ['промокод', 'скидка', 'купон', 'акция'],
  };

  const aiMatch = (keys) => keys.some((word) => msg.includes(word));

  // Анализ намерения пользователя и генерация ответа
  if (aiMatch(aiPatterns.greeting)) {
    return 'Привет! Это Carzen. Чем могу помочь?';
  } else if (aiMatch(aiPatterns.price)) {
    return 'Цены зависят от выбранного автомобиля и срока аренды. Подробнее — на странице каждого авто.\nЕсли нужна консультация: +79123420973';
  } else if (aiMatch(aiPatterns.booking)) {
    return 'Чтобы забронировать автомобиль:\n1. Выберите авто на сайте\n2. Нажмите "Забронировать"\n3. Укажите даты и данные\n\nИли позвоните нам: +79123420973';
  } else if (aiMatch(aiPatterns.delivery)) {
    return 'Мы доставляем автомобиль по адресу клиента.\nАдрес офиса: ул. Пушкина, д. 42\nТелефон: +79123420973';
  } else if (aiMatch(aiPatterns.insurance)) {
    return 'Информация о страховке:\n— ОСАГО включено в стоимость аренды\n— КАСКО — опционально\n\nПодробности: +79123420973';
  } else if (aiMatch(aiPatterns.cancellation)) {
    return 'Условия отмены бронирования:\n— За 24 часа и более: возврат 100%\n— За 6–24 часа: возврат 50%\n— Менее чем за 6 часов: без возврата\n\nТелефон: +79123420973';
  } else if (aiMatch(aiPatterns.documents)) {
    return 'Для аренды нужны:\n— Паспорт гражданина РФ\n— Водительские права категории B\n\nВодительский стаж — от 2 лет.';
  } else if (aiMatch(aiPatterns.fuel)) {
    return 'Автомобиль выдаётся с полным баком. Вернуть необходимо тоже с полным баком.\nТип топлива указан в карточке автомобиля.';
  } else if (aiMatch(aiPatterns.accident)) {
    return 'При ДТП:\n1. Сразу позвоните нам: +79123420973\n2. Не покидайте место ДТП\n3. Вызовите ГИБДД\n4. Сфотографируйте повреждения';
  } else if (aiMatch(aiPatterns.promo)) {
    return 'Актуальный промокод: FIRSTCARZEN — скидка 7% на первую аренду.\nВведите его при оформлении бронирования.';
  }

  return 'Извините, я не смог найти ответ на ваш вопрос. Пожалуйста, свяжитесь с нами по телефону: +79123420973';
}


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
      [String(carId), userId, normalizedName, normalizedRating, normalizedText, getMySQLDateTime()]
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
      return res.status(404).json({ valid: false, error: 'Промокод не найден или истек' });
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
    if (!row) return res.status(404).json({ error: 'Автомобиль не найден' });
    const car = parseCarRow(row);
    const promotion = await dbGet(
      `SELECT id, promoPrice, title, startDate, endDate
       FROM car_promotions
       WHERE carId = ?
         AND isActive = 1
         AND startDate <= CURRENT_DATE()
         AND endDate >= CURRENT_DATE()
       ORDER BY startDate DESC
       LIMIT 1`,
      [req.params.id]
    );
    if (promotion) {
      car.currentPromotion = {
        id: promotion.id,
        promoPrice: promotion.promoPrice,
        title: promotion.title,
        startDate: promotion.startDate,
        endDate: promotion.endDate
      };
    }
    return res.json({ car });
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
    if (!car) return res.status(404).json({ error: 'Автомобиль не найден' });
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
      return res.status(409).json({ error: 'Автомобиль уже забронирован на выбранные даты' });
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
    const now = getMySQLDateTime();

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

    if (booking.paymentProviderId && booking.status !== 'paid') {
      try {
        const paymentData = await getYookassaPaymentStatus(booking.paymentProviderId);
        const newStatus = paymentData.status;
        if (newStatus !== booking.paymentStatus) {
          await dbRun(
            `UPDATE bookings SET paymentStatus = ?, updatedAt = ? WHERE id = ?`,
            [newStatus, getMySQLDateTime(), booking.id]
          );
          booking.paymentStatus = newStatus;
        }
        if (newStatus === 'succeeded') {
          const updatedAt = getMySQLDateTime();
          await dbRun(
            `UPDATE bookings SET status = 'paid', paidAt = ?, updatedAt = ? WHERE id = ?`,
            [updatedAt, updatedAt, booking.id]
          );
          booking.status = 'paid';
          booking.paidAt = updatedAt;
          await sendBookingEmail({ ...booking, status: 'paid', paidAt: updatedAt }, car);
          await logActivity('booking_paid', { bookingId: booking.id, paymentProviderId: booking.paymentProviderId });
        }
      } catch (paymentError) {
        console.warn('YooKassa payment status check failed:', paymentError.message || paymentError);
      }
    }

    return res.json({ booking: { ...booking, car } });
  } catch (error) {
    console.error('Payment info error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить информацию об оплате' });
  }
});

app.post('/api/bookings/pay/:token', async (req, res) => {
  try {
    const booking = await getBookingByPaymentToken(req.params.token);
    if (!booking) return res.status(404).json({ error: 'Ссылка на оплату не найдена' });
    if (booking.status === 'paid') {
      return res.json({ success: true, message: 'Бронирование уже оплачено' });
    }

    const car = await dbGet('SELECT id, title, imageUrl FROM cars WHERE id = ?', [booking.carId]);
    if (!car) {
      return res.status(404).json({ error: 'Автомобиль не найден' });
    }

    if (booking.paymentGatewayUrl) {
      return res.json({
        success: true,
        message: 'Ссылка на оплату уже создана. Перенаправляем на платёжный шлюз.',
        paymentUrl: booking.paymentGatewayUrl
      });
    }

    const ykPayment = await createYookassaPayment(booking, car);
    const updatedAt = getMySQLDateTime();

    await dbRun(
      `UPDATE bookings SET
         paymentProviderId = ?,
         paymentGatewayUrl = ?,
         paymentStatus = ?,
         status = 'payment_link_sent',
         updatedAt = ?
       WHERE id = ?`,
      [
        ykPayment.id,
        ykPayment.confirmationUrl,
        ykPayment.status,
        updatedAt,
        booking.id
      ]
    );

    await logActivity('booking_payment_link_created', {
      bookingId: booking.id,
      yookassaPaymentId: ykPayment.id,
      paymentStatus: ykPayment.status
    });

    return res.json({
      success: true,
      message: 'Платёж создан. Перенаправляем на безопасную страницу оплаты.',
      paymentUrl: ykPayment.confirmationUrl
    });
  } catch (error) {
    console.error('Booking pay error:', error);
    return res.status(500).json({ error: error.message || 'Ошибка оплаты' });
  }
});

app.post('/api/payments/yookassa-webhook', async (req, res) => {
  try {
    if (!verifyYookassaWebhook(req)) {
      console.warn('YooKassa webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    if (!event || event.type !== 'payment.succeeded') {
      return res.json({ received: true });
    }

    const payment = event.object;
    const bookingId = Number(payment?.metadata?.bookingId || 0);
    const booking = bookingId ? await dbGet('SELECT * FROM bookings WHERE id = ?', [bookingId]) : null;

    if (!booking) {
      console.warn('YooKassa webhook: booking not found', payment?.metadata);
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status === 'paid') {
      return res.json({ received: true, message: 'Booking already paid' });
    }

    const updatedAt = getMySQLDateTime();
    await dbRun(
      `UPDATE bookings
       SET status = 'paid', paidAt = ?, paymentStatus = ?, updatedAt = ?
       WHERE id = ?`,
      [updatedAt, payment.status, updatedAt, booking.id]
    );

    const car = await dbGet('SELECT id, title, imageUrl FROM cars WHERE id = ?', [booking.carId]);
    await sendBookingEmail({ ...booking, status: 'paid', paidAt: updatedAt }, car);
    await logActivity('booking_paid', { bookingId: booking.id, paymentProviderId: payment.id });

    return res.json({ received: true });
  } catch (error) {
    console.error('YooKassa webhook error:', error);
    return res.status(500).json({ error: 'Webhook handling failed' });
  }
});

app.get('/api/admin/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [users, cars, activeBookings, pendingToday, revenueMonth, bookingsTotal] = await Promise.all([
      dbGet('SELECT COUNT(*) as total FROM users'),
      dbGet('SELECT COUNT(*) as total FROM cars'),
      dbGet(`SELECT COUNT(*) as total FROM bookings WHERE status IN ('payment_link_sent', 'paid')`),
      dbGet(`SELECT COUNT(*) as total FROM bookings WHERE DATE(createdAt) = CURRENT_DATE()`),
      dbGet(`SELECT COALESCE(SUM(totalPrice), 0) as total FROM bookings WHERE status = 'paid' AND DATE_FORMAT(paidAt, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`),
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
    const createdAt = getMySQLDateTime();
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
    return res.json({ success: true, message: 'Пользователь обновлен' });
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
    return res.json({ success: true, message: 'Пользователь удален' });
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
    const now = getMySQLDateTime();
    const result = await dbRun(
      `UPDATE reviews SET status = ?, moderatedAt = ?, publishedAt = ?, moderatorId = ? WHERE id = ?`,
      [status, now, status === 'published' ? now : null, req.userId, reviewId]
    );
    if (!result.changes) return res.status(404).json({ error: 'Отзыв не найден' });
    await logActivity('admin_review_moderate', { adminId: req.userId, reviewId, status });
    return res.json({ success: true, message: 'Статус отзыва обновлен' });
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

app.get('/api/admin/car-promotions', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT cp.*, c.title AS carTitle, c.brand, c.model, c.pricePerDay, c.imageUrl, c.city, c.status
       FROM car_promotions cp
       JOIN cars c ON cp.carId = c.id
       ORDER BY cp.createdAt DESC`
    );
    const promotions = rows.map((row) => ({
      id: row.id,
      carId: row.carId,
      promoPrice: row.promoPrice,
      title: row.title,
      startDate: row.startDate,
      endDate: row.endDate,
      isActive: Boolean(row.isActive),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      car: {
        id: row.carId,
        title: row.carTitle,
        brand: row.brand,
        model: row.model,
        pricePerDay: row.pricePerDay,
        imageUrl: row.imageUrl,
        city: row.city,
        status: row.status
      }
    }));
    return res.json({ promotions });
  } catch (error) {
    console.error('Admin car promotions error:', error);
    return res.status(500).json({ error: 'Ошибка загрузки акций' });
  }
});

app.post('/api/admin/car-promotions', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { carId, promoPrice, title, startDate, endDate, isActive } = req.body;
    if (!carId || !promoPrice || !startDate || !endDate) {
      return res.status(400).json({ error: 'Заполните все обязательные поля акции' });
    }
    if (!isValidDateRange(startDate, endDate)) {
      return res.status(400).json({ error: 'Некорректный период акции' });
    }
    const car = await dbGet('SELECT id FROM cars WHERE id = ?', [carId]);
    if (!car) {
      return res.status(404).json({ error: 'Автомобиль не найден' });
    }
    const now = getMySQLDateTime();
    await dbRun(
      `INSERT INTO car_promotions (carId, promoPrice, title, startDate, endDate, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [carId, Number(promoPrice), title || null, startDate, endDate, isActive ? 1 : 0, now, now]
    );
    await logActivity('admin_car_promotion_create', { adminId: req.userId, carId, promoPrice, startDate, endDate });
    return res.status(201).json({ success: true, message: 'Акция на автомобиль создана' });
  } catch (error) {
    console.error('Admin create car promotion error:', error);
    return res.status(500).json({ error: 'Не удалось создать акцию' });
  }
});

app.put('/api/admin/car-promotions/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const promoId = Number(req.params.id);
    const { carId, promoPrice, title, startDate, endDate, isActive } = req.body;
    if (!carId || !promoPrice || !startDate || !endDate) {
      return res.status(400).json({ error: 'Заполните все обязательные поля акции' });
    }
    if (!isValidDateRange(startDate, endDate)) {
      return res.status(400).json({ error: 'Некорректный период акции' });
    }
    const promo = await dbGet('SELECT * FROM car_promotions WHERE id = ?', [promoId]);
    if (!promo) {
      return res.status(404).json({ error: 'Акция не найдена' });
    }
    const car = await dbGet('SELECT id FROM cars WHERE id = ?', [carId]);
    if (!car) {
      return res.status(404).json({ error: 'Автомобиль не найден' });
    }
    const now = getMySQLDateTime();
    await dbRun(
      `UPDATE car_promotions
       SET carId = ?, promoPrice = ?, title = ?, startDate = ?, endDate = ?, isActive = ?, updatedAt = ?
       WHERE id = ?`,
      [carId, Number(promoPrice), title || null, startDate, endDate, isActive ? 1 : 0, now, promoId]
    );
    await logActivity('admin_car_promotion_update', { adminId: req.userId, promoId, carId, promoPrice, startDate, endDate });
    return res.json({ success: true, message: 'Акция обновлена' });
  } catch (error) {
    console.error('Admin update car promotion error:', error);
    return res.status(500).json({ error: 'Не удалось обновить акцию' });
  }
});

app.delete('/api/admin/car-promotions/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const promoId = Number(req.params.id);
    const result = await dbRun('DELETE FROM car_promotions WHERE id = ?', [promoId]);
    if (!result.changes) return res.status(404).json({ error: 'Акция не найдена' });
    await logActivity('admin_car_promotion_delete', { adminId: req.userId, promoId });
    return res.json({ success: true, message: 'Акция удалена' });
  } catch (error) {
    console.error('Admin delete car promotion error:', error);
    return res.status(500).json({ error: 'Не удалось удалить акцию' });
  }
});

app.get('/api/stock/promotions', async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT cp.id, cp.carId, cp.promoPrice, cp.title, cp.startDate, cp.endDate,
              c.title AS carTitle, c.brand, c.model, c.pricePerDay, c.imageUrl, c.mileage,
              c.fuelType, c.transmission, c.driveType, c.seats, c.bodyType, c.city
       FROM car_promotions cp
       JOIN cars c ON cp.carId = c.id
       WHERE cp.isActive = 1
         AND cp.startDate <= CURRENT_DATE()
         AND cp.endDate >= CURRENT_DATE()
         AND c.status = 'available'
       ORDER BY cp.startDate DESC`
    );
    const promotions = rows.map((row) => ({
      id: row.id,
      carId: row.carId,
      promoPrice: row.promoPrice,
      title: row.title,
      startDate: row.startDate,
      endDate: row.endDate,
      car: {
        id: row.carId,
        title: row.carTitle,
        brand: row.brand,
        model: row.model,
        pricePerDay: row.pricePerDay,
        imageUrl: row.imageUrl,
        mileage: row.mileage,
        fuelType: row.fuelType,
        transmission: row.transmission,
        driveType: row.driveType,
        seats: row.seats,
        bodyType: row.bodyType,
        city: row.city
      }
    }));
    return res.json({ promotions });
  } catch (error) {
    console.error('Stock promotions error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить акции' });
  }
});

app.post('/api/admin/cars', authMiddleware, adminOnly, upload.fields([
  { name: 'previewImage', maxCount: 1 },
  { name: 'galleryImages', maxCount: 10 }
]), async (req, res) => {
  try {
    const {
      title, brand, model, year, pricePerDay, mileage, fuelType, transmission, driveType,
      seats, bodyType, city, description, features, galleryJson, specsJson, priceTiersJson, status,
      specsText, priceTiersText
    } = req.body;

    if (!title || !brand || !model || !pricePerDay) {
      return res.status(400).json({ error: 'Заполните обязательные поля' });
    }

    const previewFile = req.files?.previewImage?.[0];
    const galleryFiles = req.files?.galleryImages || [];
    const uploadedGallery = galleryFiles.map((file) => `/image/${file.filename}`);
    const gallery = safeJsonParse(galleryJson, []);

   
    if (uploadedGallery.length) {
      uploadedGallery.forEach((imageUrl) => {
        if (!gallery.includes(imageUrl)) gallery.push(imageUrl);
      });
    }

    // Р•СЃР»Рё Р·Р°РіСЂСѓР¶РµРЅРѕ РїСЂРµРІСЊСЋ РёР·РѕР±СЂР°Р¶РµРЅРёРµ, РґРѕР±Р°РІР»СЏРµРј РµРіРѕ РІ РЅР°С‡Р°Р»Рѕ РіР°Р»РµСЂРµРё
    const previewImageUrl = previewFile ? `/image/${previewFile.filename}` : null;

    // Preview РѕСЃС‚Р°РµС‚СЃСЏ РѕС‚РґРµР»СЊРЅС‹Рј РѕСЃРЅРѕРІРЅС‹Рј РёР·РѕР±СЂР°Р¶РµРЅРёРµРј, Р° РІ РіР°Р»РµСЂРµРµ С…СЂР°РЅСЏС‚СЃСЏ С‚РѕР»СЊРєРѕ РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ С„РѕС‚Рѕ
    const imageUrl = previewImageUrl || (gallery.length ? gallery[0] : '/image/avatar.png');
    const createdAt = getMySQLDateTime();

    // РЈР±РµРґРёРјСЃСЏ С‡С‚Рѕ gallery СЌС‚Рѕ РјР°СЃСЃРёРІ Рё РѕРЅР° СЃРѕРґРµСЂР¶РёС‚ СЃС‚СЂРѕРєРё
    const finalGallery = Array.isArray(gallery) ? gallery.filter(img => typeof img === 'string' && img.trim()) : [];

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
        JSON.stringify(finalGallery),
        specsText ? JSON.stringify(parseSpecsText(specsText)) : specsJson ? JSON.stringify(safeJsonParse(specsJson, {})) : JSON.stringify({}),
        priceTiersText ? JSON.stringify(parsePriceTiersText(priceTiersText)) : priceTiersJson ? JSON.stringify(safeJsonParse(priceTiersJson, [])) : JSON.stringify([])
      ]
    );

    await logActivity('admin_car_create', { adminId: req.userId, carId: result.lastID });
    return res.status(201).json({ success: true, message: 'Автомобиль успешно добавлен на сайт' });
  } catch (error) {
    console.error('Admin add car error:', error);
    return res.status(500).json({ error: 'Ошибка при добавлении автомобиля' });
  }
});

app.put('/api/admin/cars/:id', authMiddleware, adminOnly, upload.fields([
  { name: 'previewImage', maxCount: 1 },
  { name: 'galleryImages', maxCount: 10 }
]), async (req, res) => {
  try {
    const carId = Number(req.params.id);
    const current = await dbGet('SELECT * FROM cars WHERE id = ?', [carId]);
    if (!current) return res.status(404).json({ error: 'Автомобиль не найден' });

    const previewFile = req.files?.previewImage?.[0];
    const galleryFiles = req.files?.galleryImages || [];
    const uploadedGallery = galleryFiles.map((file) => `/image/${file.filename}`);
    const currentGallery = safeJsonParse(current.galleryJson, [current.imageUrl]).filter(Boolean);
    const gallery = req.body.galleryJson ? safeJsonParse(req.body.galleryJson, currentGallery) : currentGallery;
    
    // Р”РѕР±Р°РІР»СЏРµРј РЅРѕРІС‹Рµ Р·Р°РіСЂСѓР¶РµРЅРЅС‹Рµ С„РѕС‚Рѕ РІ РЅР°С‡Р°Р»Рѕ РіР°Р»РµСЂРµРё
    if (uploadedGallery.length) {
      uploadedGallery.forEach((imageUrl) => {
        if (!gallery.includes(imageUrl)) gallery.unshift(imageUrl);
      });
    }

    // Р•СЃР»Рё Р·Р°РіСЂСѓР¶РµРЅРѕ РЅРѕРІРѕРµ РїСЂРµРІСЊСЋ, РґРѕР±Р°РІР»СЏРµРј РµРіРѕ
    const previewImageUrl = previewFile ? `/image/${previewFile.filename}` : null;
    if (previewImageUrl && !gallery.includes(previewImageUrl)) {
      gallery.unshift(previewImageUrl);
    }

    const imageUrl = previewFile ? `/image/${previewFile.filename}` : current.imageUrl;
    if (!gallery.length) gallery.push(imageUrl);

    // РћС‡РёС‰Р°РµРј РіР°Р»РµСЂРµСЋ РѕС‚ РґСѓР±Р»РёРєР°С‚РѕРІ Рё РїСѓСЃС‚С‹С… Р·РЅР°С‡РµРЅРёР№
    const finalGallery = [...new Set(gallery.filter(img => typeof img === 'string' && img.trim()))];

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
        JSON.stringify(finalGallery),
        req.body.specsText ? JSON.stringify(parseSpecsText(req.body.specsText)) : req.body.specsJson ? JSON.stringify(safeJsonParse(req.body.specsJson, {})) : current.specsJson,
        req.body.priceTiersText ? JSON.stringify(parsePriceTiersText(req.body.priceTiersText)) : req.body.priceTiersJson ? JSON.stringify(safeJsonParse(req.body.priceTiersJson, [])) : current.priceTiersJson,
        carId
      ]
    );
    await logActivity('admin_car_update', { adminId: req.userId, carId });
    return res.json({ success: true, message: 'Автомобиль обновлен' });
  } catch (error) {
    console.error('Admin update car error:', error);
    return res.status(500).json({ error: 'Ошибка обновления автомобиля' });
  }
});

app.delete('/api/admin/cars/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const carId = Number(req.params.id);
    const current = await dbGet('SELECT imageUrl FROM cars WHERE id = ?', [carId]);
    if (!current) return res.status(404).json({ error: 'Автомобиль не найден' });

    await dbRun('DELETE FROM cars WHERE id = ?', [carId]);
    if (current.imageUrl && current.imageUrl.startsWith('/image/car-')) {
      const absolutePath = path.join(ROOT_DIR, current.imageUrl.replace('/image/', 'image/'));
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }
    await logActivity('admin_car_delete', { adminId: req.userId, carId });
    return res.json({ success: true, message: 'Автомобиль удален' });
  } catch (error) {
    console.error('Admin delete car error:', error);
    return res.status(500).json({ error: 'Ошибка удаления автомобиля' });
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
      [nextStatus, adminComment, getMySQLDateTime(), bookingId]
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
    if (booking.status === 'paid') {
      return res.json({ success: true, message: 'Бронирование уже оплачено' });
    }

    const car = await dbGet('SELECT id, title FROM cars WHERE id = ?', [booking.carId]);
    if (!car) return res.status(404).json({ error: 'Автомобиль не найден' });

    let paymentLink = booking.paymentGatewayUrl;
    let paymentProviderId = booking.paymentProviderId;
    let paymentStatus = booking.paymentStatus;

    if (!paymentLink) {
      const ykPayment = await createYookassaPayment(booking, car);
      paymentProviderId = ykPayment.id;
      paymentLink = ykPayment.confirmationUrl;
      paymentStatus = ykPayment.status;

      await dbRun(
        `UPDATE bookings
         SET paymentProviderId = ?, paymentGatewayUrl = ?, paymentStatus = ?, status = 'payment_link_sent', updatedAt = ?
         WHERE id = ?`,
        [paymentProviderId, paymentLink, paymentStatus, getMySQLDateTime(), bookingId]
      );
    } else {
      await dbRun(
        `UPDATE bookings
         SET status = CASE WHEN status = 'pending' THEN 'payment_link_sent' ELSE status END,
             updatedAt = ?
         WHERE id = ?`,
        [getMySQLDateTime(), bookingId]
      );
    }

    const smsText = `Карзен: ссылка на оплату бронирования ${paymentLink}`;
    await addNotification({
      channel: 'sms',
      recipient: booking.customerPhone,
      subject: 'Ссылка на оплату бронирования',
      content: smsText,
      status: 'prepared'
    });
    await logActivity('admin_send_payment_link', { adminId: req.userId, bookingId, paymentProviderId, paymentStatus });

    return res.json({
      success: true,
      message: 'Ссылка на оплату подтверждена для отправки по SMS',
      paymentUrl: paymentLink,
      smsText
    });
  } catch (error) {
    console.error('Send payment link error:', error);
    return res.status(500).json({ error: error.message || 'Не удалось подтвердить ссылку на оплату' });
  }
});

// Get user's current and past bookings
app.get('/api/bookings/my', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const rows = await dbAll(
      `SELECT b.*, c.title as carTitle, c.brand as carBrand, c.model as carModel, c.imageUrl as carImage
       FROM bookings b
       LEFT JOIN cars c ON c.id = b.carId
       WHERE b.userId = ?
       ORDER BY b.startDate DESC`,
      [userId]
    );
    const bookings = rows.map((row) => ({
      ...row,
      selectedOptions: safeJsonParse(row.selectedOptionsJson, [])
    }));
    return res.json({ bookings });
  } catch (error) {
    console.error('Get user bookings error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить бронирования' });
  }
});

// Get booking details
app.get('/api/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const booking = await dbGet(
      `SELECT b.*, c.title as carTitle, c.brand as carBrand, c.model as carModel, c.imageUrl as carImage,
              c.fuelType, c.transmission, c.driveType, c.seats, c.bodyType, c.features
       FROM bookings b
       LEFT JOIN cars c ON c.id = b.carId
       WHERE b.id = ? AND (b.userId = ? OR ? = 1)`,
      [bookingId, req.userId, req.userRole === 'admin' ? 1 : 0]
    );
    if (!booking) {
      return res.status(404).json({ error: 'Бронирование не найдено' });
    }
    booking.selectedOptions = safeJsonParse(booking.selectedOptionsJson, []);
    return res.json({ booking });
  } catch (error) {
    console.error('Get booking details error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить детали бронирования' });
  }
});

// Cancel booking (user)
app.post('/api/bookings/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const booking = await dbGet('SELECT * FROM bookings WHERE id = ? AND userId = ?', [bookingId, req.userId]);
    
    if (!booking) {
      return res.status(404).json({ error: 'Бронирование не найдено' });
    }
    
    if (!['pending', 'payment_link_sent'].includes(booking.status)) {
      return res.status(400).json({ error: 'Невозможно отменить бронирование с таким статусом' });
    }
    
    await dbRun(
      'UPDATE bookings SET status = ?, updatedAt = ? WHERE id = ?',
      ['cancelled', getMySQLDateTime(), bookingId]
    );
    
    await logActivity('user_booking_cancelled', { userId: req.userId, bookingId });
    return res.json({ success: true, message: 'Бронирование отменено' });
  } catch (error) {
    console.error('Cancel booking error:', error);
    return res.status(500).json({ error: 'Не удалось отменить бронирование' });
  }
});

// Admin: Delete booking
app.delete('/api/admin/bookings/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const result = await dbRun('DELETE FROM bookings WHERE id = ?', [bookingId]);
    if (!result.changes) {
      return res.status(404).json({ error: 'Бронирование не найдено' });
    }
    await logActivity('admin_booking_delete', { adminId: req.userId, bookingId });
    return res.json({ success: true, message: 'Бронирование удалено' });
  } catch (error) {
    console.error('Admin delete booking error:', error);
    return res.status(500).json({ error: 'Не удалось удалить бронирование' });
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
      [String(code).trim().toUpperCase(), title || null, Number(discountPercent), isActive === false ? 0 : 1, getMySQLDateTime(), expiresAt || null]
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
    return res.json({ success: true, message: 'Промокод обновлен' });
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
    return res.json({ success: true, message: 'Промокод удален' });
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
        getMySQLDateTime()
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
    const now = getMySQLDateTime();
    for (const [key, value] of Object.entries(content)) {
      await dbRun(
        'INSERT INTO site_content (`key`, value, updatedAt) VALUES (?, ?, ?)'
        + ' ON DUPLICATE KEY UPDATE value = VALUES(value), updatedAt = VALUES(updatedAt)',
        [key, String(value ?? ''), now]
      );
    }
    await logActivity('admin_site_content_update', { adminId: req.userId, keys: Object.keys(content) });
    return res.json({ success: true, message: 'Контент сайта обновлен' });
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
        (SELECT COUNT(*) FROM bookings WHERE status = 'pending') as pendingBookings,
        (SELECT COUNT(*) FROM bookings WHERE status = 'cancelled') as cancelledBookings,
        (SELECT COALESCE(SUM(totalPrice), 0) FROM bookings WHERE status = 'paid') as revenue,
        (SELECT COALESCE(SUM(totalPrice), 0) FROM bookings WHERE status = 'pending') as pendingRevenue`
    );

    const recentBookings = await dbAll(
      `SELECT b.id, c.title as carTitle, b.customerName, b.startDate, b.endDate, b.totalPrice, b.status
       FROM bookings b
       LEFT JOIN cars c ON c.id = b.carId
       ORDER BY b.createdAt DESC
       LIMIT 10`
    );

    const popularCars = await dbAll(
      `SELECT c.id, c.title, COUNT(b.id) as bookingsCount, COALESCE(SUM(b.totalPrice), 0) as earnings
       FROM cars c
       LEFT JOIN bookings b ON b.carId = c.id AND b.status = 'paid'
       GROUP BY c.id
       ORDER BY bookingsCount DESC, c.title ASC
       LIMIT 6`
    );

    const statusStats = await dbAll(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(totalPrice), 0) as sum
       FROM bookings
       GROUP BY status
       ORDER BY status`
    );

    const lines = [
      'ОСНОВНЫЕ ПОКАЗАТЕЛИ',
      '---------------------------------------------------------------------',
      ['Дата выгрузки:', formatDateRu(getMySQLDateTime())],
      [],
      'СТАТИСТИКА ПОЛЬЗОВАТЕЛЕЙ И АВТОПАРКА',
      ['Всего пользователей:', String(stats.totalUsers)],
      ['Активных автомобилей:', String(stats.totalCars)],
      [],
      'СТАТИСТИКА ПО БРОНИРОВАНИЯМ',
      ['Всего бронирований:', String(stats.totalBookings)],
      ['  - Оплачено:', `${stats.paidBookings} (${new Intl.NumberFormat('ru-RU').format(stats.revenue)} Руб.)`],
      ['  - В ожидании оплаты:', `${stats.pendingBookings} (${new Intl.NumberFormat('ru-RU').format(stats.pendingRevenue)} Руб.)`],
      ['  - Отменено:', String(stats.cancelledBookings)],
      [],
      'СТАТИСТИКА ПО СТАТУСАМ БРОНИРОВАНИЙ',
      ...statusStats.map((s) => [`${s.status}:`, `${s.count} бр. (${new Intl.NumberFormat('ru-RU').format(s.sum)} Руб.)`]),
      [],
      'ФИНАНСОВЫЙ ОТЧЕТ',
      ['Получено (оплачено):', `${new Intl.NumberFormat('ru-RU').format(stats.revenue)} Руб.`],
      ['В ожидании оплаты:', `${new Intl.NumberFormat('ru-RU').format(stats.pendingRevenue)} Руб.`],
      ['Потенциальный доход:', `${new Intl.NumberFormat('ru-RU').format(stats.revenue + stats.pendingRevenue)} Руб.`],
      [],
      'ПОСЛЕДНИЕ БРОНИРОВАНИЯ (10 шт)',
      '---------------------------------------------------------------------',
      ['ID', 'Автомобиль', 'Клиент', 'Даты', 'Статус', 'Сумма']
    ];

    recentBookings.forEach((booking) => {
      lines.push([
        `#${booking.id}`,
        (booking.carTitle || 'N/A').substring(0, 15),
        (booking.customerName || 'N/A').substring(0, 12),
        `${booking.startDate}`,
        booking.status.substring(0, 10),
        `${new Intl.NumberFormat('ru-RU').format(booking.totalPrice)} Рублей`
      ]);
    });

    lines.push(
      [],
      'ПОПУЛЯРНЫЕ АВТОМОБИЛИ (топ 6)',
      '---------------------------------------------------------------------',
      ['Автомобиль', 'Бронирований', 'Выручка']
    );

    popularCars.forEach((car) => {
      lines.push([
        (car.title || 'N/A').substring(0, 20),
        String(car.bookingsCount),
        `${new Intl.NumberFormat('ru-RU').format(car.earnings)} Рублей`
      ]);
    });

    const report = generateSimplePdf('ОТЧЕТ АДМИНИСТРАТОРА Карзен', lines);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="carzen-report.txt"');
    return res.send(report);
  } catch (error) {
    console.error('Export txt error:', error);
    return res.status(500).json({ error: 'Не удалось сформировать отчет' });
  }
});

// Get user's promos
app.get('/api/user/promos', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const rows = await dbAll(
      `SELECT p.id, p.code, p.title, p.discountPercent, p.expiresAt, up.assignedAt, up.expiresAt as userPromoExpires
       FROM user_promos up
       JOIN promo_codes p ON up.promoId = p.id
       WHERE up.userId = ? AND up.usedAt IS NULL
       ORDER BY up.assignedAt DESC`,
      [userId]
    );
    return res.json({ promos: rows });
  } catch (error) {
    console.error('User promos load error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить промокоды' });
  }
});

// Admin: assign promo to user
app.post('/api/admin/users/:userId/promos', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const { promoId } = req.body;
    
    if (!promoId) {
      return res.status(400).json({ error: 'Укажите промокод' });
    }
    
    const promo = await dbGet('SELECT * FROM promo_codes WHERE id = ?', [promoId]);
    if (!promo) {
      return res.status(404).json({ error: 'Промокод не найден' });
    }
    
    const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Check if user already has this promo
    const existing = await dbGet(
      'SELECT id FROM user_promos WHERE userId = ? AND promoId = ? AND usedAt IS NULL',
      [userId, promoId]
    );
    if (existing) {
      return res.status(400).json({ error: 'Этот промокод уже выдан пользователю' });
    }
    
    await dbRun(
      `INSERT INTO user_promos (userId, promoId, assignedAt, expiresAt)
       VALUES (?, ?, ?, ?)`,
      [userId, promoId, getMySQLDateTime(), promo.expiresAt || null]
    );
    
    await logActivity('admin_assign_promo_to_user', { adminId: req.userId, userId, promoId });
    return res.status(201).json({ success: true, message: 'Промокод выдан пользователю' });
  } catch (error) {
    console.error('Assign promo error:', error);
    return res.status(500).json({ error: 'Не удалось выдать промокод' });
  }
});

// Admin: remove promo from user
app.delete('/api/admin/users/:userId/promos/:userPromoId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { userId, userPromoId } = req.params;
    
    const userPromo = await dbGet(
      'SELECT * FROM user_promos WHERE id = ? AND userId = ?',
      [userPromoId, userId]
    );
    if (!userPromo) {
      return res.status(404).json({ error: 'Промокод пользователя не найден' });
    }
    
    await dbRun('DELETE FROM user_promos WHERE id = ?', [userPromoId]);
    await logActivity('admin_revoke_promo_from_user', { adminId: req.userId, userId, userPromoId });
    return res.json({ success: true, message: 'Промокод отозван' });
  } catch (error) {
    console.error('Revoke promo error:', error);
    return res.status(500).json({ error: 'Не удалось отозвать промокод' });
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





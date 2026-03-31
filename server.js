const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'very_secret_key_change_me'; 

// CORS и JSON
app.use(cors());
app.use(express.json());

// Раздача статики
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/image', express.static(path.join(__dirname, 'image')));
// Инициализация БД
const db = new sqlite3.Database(path.join(__dirname, 'carzen.db'));

db.serialize(() => {
  // 1. Таблица пользователей С РОЛЬЮ
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    middleName TEXT,
    phone TEXT,
    email TEXT,
    birthDate TEXT,
    role TEXT DEFAULT 'user',
    createdAt TEXT NOT NULL
  )`);

  // 2. Таблица консультаций
  db.run(`CREATE TABLE IF NOT EXISTS consultations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`);

  // 3. Создаём админа ПОСЛЕ таблиц
  setTimeout(() => {
    const adminLogin = 'adminka';
    const adminPassword = bcrypt.hashSync('123adminka', 10);
    db.run(
      `INSERT OR IGNORE INTO users (login, passwordHash, firstName, lastName, role, createdAt) 
       VALUES (?, ?, 'Админ', 'Админ', 'admin', ?)`,
      [adminLogin, adminPassword, new Date().toISOString()],
      (err) => {
        if (err) {
          console.error('Ошибка создания админа:', err);
        } else {
          console.log('✅ Админ создан!');
        }
      }
    );
  }, 100);
});



function generateToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
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
    createdAt: row.createdAt
  };
}


// Middleware авторизации
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Нет заголовка Authorization' });

  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Неверный формат Authorization' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    // ДОБАВЬ ПОЛУЧЕНИЕ РОЛИ
    db.get('SELECT role FROM users WHERE id = ?', [payload.id], (err, row) => {
      if (err || !row) return res.status(401).json({ error: 'Пользователь не найден' });
      req.userRole = row.role;
      next();
    });
  } catch (e) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

// РЕГИСТРАЦИЯ 
app.post('/api/register', (req, res) => {
  const {
    login,
    password,
    passwordConfirm,
    firstName,
    lastName,
    middleName,
    phone,
    email,
    birthDate
  } = req.body;

  if (
    !login ||
    !password ||
    !passwordConfirm ||
    !firstName ||
    !lastName ||
    !email ||
    !birthDate
  ) {
    return res
      .status(400)
      .json({ error: 'Заполнены не все обязательные поля' });
  }

  if (password !== passwordConfirm) {
    return res.status(400).json({ error: 'Пароли не совпадают' });
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: 'Пароль должен содержать минимум 6 символов' });
  }

  const createdAt = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(password, 10);

  const stmt = db.prepare(
    `INSERT INTO users (login, passwordHash, firstName, lastName, middleName, phone, email, birthDate, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  stmt.run(
    login,
    passwordHash,
    firstName,
    lastName,
    middleName || null,
    phone || null,
    email || null,
    birthDate || null,
    createdAt,
    function (err) {
      if (err) {
        if (err.message && err.message.includes('UNIQUE')) {
          return res
            .status(400)
            .json({ error: 'Пользователь с таким логином уже существует' });
        }
        console.error('DB error on register:', err);
        return res
          .status(500)
          .json({ error: 'Ошибка сервера при регистрации' });
      }

      const userRow = {
        id: this.lastID,
        login,
        firstName,
        lastName,
        middleName: middleName || null,
        phone: phone || null,
        email: email || null,
        birthDate: birthDate || null,
        createdAt
      };

      const token = generateToken(userRow);
      res.json({ token, user: mapUserRow(userRow) });
    }
  );
});

// ЛОГИН
app.post('/api/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }

  db.get('SELECT * FROM users WHERE login = ?', [login], (err, row) => {
    if (err) {
      console.error('DB error on login:', err);
      return res.status(500).json({ error: 'Ошибка сервера при входе' });
    }
    if (!row) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const valid = bcrypt.compareSync(password, row.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Возвращение всех данный
    const user = mapUserRow(row);
    const token = generateToken(user);
    res.json({ token, user });
  });
});


// Текущий пользователь
app.get('/api/me', authMiddleware, (req, res) => {
  db.get('SELECT * FROM users WHERE id = ?', [req.userId], (err, row) => {
    if (err) {
      console.error('DB error on me:', err);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({ user: mapUserRow(row) });
  });
});

app.get('/', (req, res) => {
    res.redirect('/public/html/menu.html');
});



// Форма консультации
app.post('/api/consultation', (req, res) => {
  const { city, name, phone } = req.body;
  if (!city || !name || !phone) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  const createdAt = new Date().toISOString();
  db.run(`INSERT INTO consultations (city, name, phone, createdAt) VALUES (?, ?, ?, ?)`,
    [city, name, phone, createdAt],
    function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка БД' });
      res.json({ success: true, message: 'Заявка отправлена!' });
    }
  );
});

// админка - список пользователей
app.get('/api/admin/users', authMiddleware, (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Доступ только для администраторов' });
  }
  
  db.all(
    `SELECT id, login, firstName, lastName, middleName, email, createdAt 
     FROM users ORDER BY createdAt DESC LIMIT 50`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Ошибка БД' });
      res.json({ users: rows });
    }
  );
});

// Админка - статистика
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Доступ только для администраторов' });
  }
  
  db.get(`SELECT COUNT(*) as totalUsers FROM users`, (err, totalUsers) => {
    db.get(`SELECT COUNT(*) as totalConsultations FROM consultations`, (err, totalConsultations) => {
      res.json({
        totalUsers: totalUsers?.totalUsers || 0,
        totalConsultations: totalConsultations?.totalConsultations || 0,
        newUsersToday: 0
      });
    });
  });
});

app.get('/api/admin/consultations', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Нет доступа' });
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    
    // Проверяем админа
    db.get('SELECT role FROM users WHERE id = ?', [payload.id], (err, row) => {
      if (err || !row || row.role !== 'admin') {
        return res.status(403).json({ error: 'Только для админов' });
      }
      
      // Все заявки админу
      db.all(`SELECT * FROM consultations ORDER BY createdAt DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Ошибка БД' });
        res.json({ consultations: rows });
      });
    });
  } catch (e) {
    return res.status(401).json({ error: 'Неверный токен' });
  }
});


// === АДМИН: ДОБАВИТЬ ПОЛЬЗОВАТЕЛЯ ===
app.post('/api/admin/users', authMiddleware, (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Доступ только для администраторов' });
  }

  const {
    login,
    password,
    firstName,
    lastName,
    middleName,
    phone,
    email,
    birthDate,
    role = 'user'
  } = req.body;

  // Проверка обязательных полей
  if (!login || !password || !firstName || !lastName || !email) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }

  // Проверка длины пароля
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
  }

  const createdAt = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(password, 10);

  const stmt = db.prepare(`
    INSERT INTO users 
    (login, passwordHash, firstName, lastName, middleName, phone, email, birthDate, role, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    login,
    passwordHash,
    firstName,
    lastName,
    middleName || null,
    phone || null,
    email || null,
    birthDate || null,
    role,
    createdAt,
    function(err) {
      if (err) {
        if (err.message?.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
        }
        console.error('DB error on create user:', err);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }

      const newUser = {
        id: this.lastID,
        login,
        firstName,
        lastName,
        middleName: middleName || null,
        phone: phone || null,
        email: email || null,
        birthDate: birthDate || null,
        role,
        createdAt
      };

      res.status(201).json({ 
        message: 'Пользователь создан', 
        user: mapUserRow(newUser) 
      });
    }
  );
});

// === АДМИН: УДАЛИТЬ ПОЛЬЗОВАТЕЛЯ ===
app.delete('/api/admin/users/:id', authMiddleware, (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Доступ только для администраторов' });
  }

  const userId = parseInt(req.params.id);
  
  // Защита от удаления самого себя
  if (userId === req.userId) {
    return res.status(400).json({ error: 'Нельзя удалить самого себя' });
  }

  db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
    if (err) {
      console.error('DB error on delete user:', err);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({ message: 'Пользователь удалён' });
  });
});

// === АДМИН: ОБНОВИТЬ ПОЛЬЗОВАТЕЛЯ (опционально) ===
app.put('/api/admin/users/:id', authMiddleware, (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Доступ только для администраторов' });
  }

  const userId = parseInt(req.params.id);
  const {
    firstName,
    lastName,
    middleName,
    phone,
    email,
    birthDate,
    role
  } = req.body;

  const updates = [];
  const params = [];

  if (firstName !== undefined) { updates.push('firstName = ?'); params.push(firstName); }
  if (lastName !== undefined) { updates.push('lastName = ?'); params.push(lastName); }
  if (middleName !== undefined) { updates.push('middleName = ?'); params.push(middleName); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (birthDate !== undefined) { updates.push('birthDate = ?'); params.push(birthDate); }
  if (role !== undefined) { updates.push('role = ?'); params.push(role); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Нет данных для обновления' });
  }

  params.push(userId);

  db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
    if (err) {
      console.error('DB error on update user:', err);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }

    res.json({ message: 'Пользователь обновлён' });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

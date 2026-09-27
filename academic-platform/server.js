const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jwt-simple');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const SECRET_KEY = 'your_super_secret_jwt_key';

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
const db = new sqlite3.Database('./academic.db', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to SQLite database.');
});

// Create Database Tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    title TEXT,
    description TEXT,
    FOREIGN KEY(course_id) REFERENCES courses(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER,
    student_id INTEGER,
    file_path TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(assignment_id) REFERENCES assignments(id),
    FOREIGN KEY(student_id) REFERENCES users(id)
  )`);
});

// Middleware for JWT Authentication
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.decode(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// --- Auth Endpoints ---
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  db.run(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
    [name, email, hashedPassword, role || 'student'],
    function(err) {
      if (err) return res.status(400).json({ error: 'User already exists' });
      res.json({ message: 'Registration successful' });
    }
  );
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.encode({ id: user.id, name: user.name, role: user.role }, SECRET_KEY);
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  });
});

// --- Course Endpoints ---
app.get('/api/courses', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM courses`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows || []);
  });
});

app.get('/api/courses/:id', authenticateToken, (req, res) => {
  const courseId = req.params.id;
  db.get(`SELECT * FROM courses WHERE id = ?`, [courseId], (err, course) => {
    if (err || !course) return res.status(404).json({ error: 'Course not found' });
    
    db.all(`SELECT * FROM assignments WHERE course_id = ?`, [courseId], (err, assignments) => {
      course.assignments = assignments || [];
      res.json(course);
    });
  });
});

// --- Assignment & File Upload Endpoints ---
app.post('/api/courses/:id/assignments', authenticateToken, (req, res) => {
  if (req.user.role !== 'tutor' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only instructors can create assignments' });
  }
  const { title, description } = req.body;
  db.run(`INSERT INTO assignments (course_id, title, description) VALUES (?, ?, ?)`,
    [req.params.id, title, description],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to create assignment' });
      res.json({ id: this.lastID, title, description });
    }
  );
});

app.post('/api/assignments/:id/submit', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const assignmentId = req.params.id;
  const filePath = `/uploads/${req.file.filename}`;

  db.run(`INSERT INTO submissions (assignment_id, student_id, file_path) VALUES (?, ?, ?)`,
    [assignmentId, req.user.id, filePath],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to record submission' });
      
      // Notify connected tutors via Socket.IO
      io.emit('new_submission', {
        studentName: req.user.name,
        assignmentId,
        filePath
      });

      res.json({ message: 'Assignment submitted successfully', filePath });
    }
  );
});

// --- Real-time Socket.IO Connection ---
io.on('connection', (socket) => {
  socket.on('join_course', (courseId) => {
    socket.join(`course_${courseId}`);
  });

  socket.on('send_message', (data) => {
    // Broadcast message to room members
    io.to(`course_${data.courseId}`).emit('receive_message', {
      sender: data.sender,
      message: data.message,
      timestamp: new Date().toLocaleTimeString()
    });
  });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:3000`));
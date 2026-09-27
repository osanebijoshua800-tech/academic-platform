const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'platform.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

db.serialize(() => {
  // Users Table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'student'
  )`);

  // Courses Table
  db.run(`CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT
  )`);

  // Modules Table
  db.run(`CREATE TABLE IF NOT EXISTS modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    title TEXT,
    FOREIGN KEY(course_id) REFERENCES courses(id)
  )`);

  // Lessons Table
  db.run(`CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id INTEGER,
    title TEXT,
    content_type TEXT,
    content_url TEXT,
    FOREIGN KEY(module_id) REFERENCES modules(id)
  )`);

  // Quizzes Table
  db.run(`CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    title TEXT,
    FOREIGN KEY(course_id) REFERENCES courses(id)
  )`);

  // Questions Table
  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER,
    question_text TEXT,
    option_a TEXT,
    option_b TEXT,
    option_c TEXT,
    option_d TEXT,
    correct_option TEXT,
    FOREIGN KEY(quiz_id) REFERENCES quizzes(id)
  )`);

  // Quiz Results Table
  db.run(`CREATE TABLE IF NOT EXISTS quiz_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    quiz_id INTEGER,
    score INTEGER,
    total INTEGER,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(quiz_id) REFERENCES quizzes(id)
  )`);

  // Lesson Progress Table
  db.run(`CREATE TABLE IF NOT EXISTS lesson_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    lesson_id INTEGER,
    completed INTEGER DEFAULT 1,
    UNIQUE(user_id, lesson_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(lesson_id) REFERENCES lessons(id)
  )`);

  // Certificates Table
  db.run(`CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    course_id INTEGER,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    certificate_code TEXT UNIQUE,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(course_id) REFERENCES courses(id)
  )`);

  // Seed Initial Course Data if Empty
  db.get(`SELECT COUNT(*) as count FROM courses`, (err, row) => {
    if (row && row.count === 0) {
      db.run(`INSERT INTO courses (title, description) VALUES ('Computer Science 101', 'Intro to Algorithms and Data Structures')`, function() {
        const courseId = this.lastID;
        db.run(`INSERT INTO modules (course_id, title) VALUES (?, 'Module 1: Foundations of Programming')`, [courseId], function() {
          const moduleId = this.lastID;
          db.run(`INSERT INTO lessons (module_id, title, content_type, content_url) VALUES (?, 'Course Syllabus', 'pdf', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf')`, [moduleId]);
          db.run(`INSERT INTO lessons (module_id, title, content_type, content_url) VALUES (?, 'Lecture 1: Introduction', 'video', 'https://www.youtube.com/embed/zOjov-2OZ0E')`, [moduleId]);
        });
      });

      db.run(`INSERT INTO courses (title, description) VALUES ('Calculus I', 'Limits, Derivatives, and Integrals')`);
    }
  });

  // Seed Quiz Data if Empty
  db.get(`SELECT COUNT(*) as count FROM quizzes`, (err, row) => {
    if (row && row.count === 0) {
      db.run(`INSERT INTO quizzes (course_id, title) VALUES (1, 'Module 1 Knowledge Check')`, function() {
        const quizId = this.lastID;
        db.run(`INSERT INTO questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, 
          [quizId, 'What is the time complexity of searching an element in a binary search tree in the average case?', 'O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'b']
        );
        db.run(`INSERT INTO questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, 
          [quizId, 'Which data structure follows the Last In, First Out (LIFO) principle?', 'Queue', 'Array', 'Stack', 'Linked List', 'c']
        );
      });
    }
  });
});

module.exports = db;
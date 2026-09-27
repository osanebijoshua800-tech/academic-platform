const API_BASE = '/api';
let socket;

function setAuthToken(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function getToken() { return localStorage.getItem('token'); }
function getUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname.toLowerCase();

  if (path.includes('dashboard.html')) {
    loadDashboard();
  } else if (path.includes('course.html')) {
    loadCourseDetails();
  } else if (path === '/' || path.includes('index.html') || path === '') {
    setupAuthForm();
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.clear();
      window.location.href = '/';
    });
  }
});

function setupAuthForm() {
  const authForm = document.getElementById('auth-form');
  const toggleAuth = document.getElementById('toggle-auth');
  const formTitle = document.getElementById('form-title');
  const submitBtn = document.getElementById('submit-btn');
  const nameGroup = document.getElementById('name-group');
  const roleGroup = document.getElementById('role-group');

  let isLogin = true;

  if (toggleAuth) {
    toggleAuth.addEventListener('click', (e) => {
      e.preventDefault();
      isLogin = !isLogin;
      if (formTitle) formTitle.innerText = isLogin ? 'Login to Account' : 'Create Account';
      if (submitBtn) submitBtn.innerText = isLogin ? 'Login' : 'Register';
      toggleAuth.innerText = isLogin ? 'Need an account? Register' : 'Already have an account? Login';
      
      if (isLogin) {
        if (nameGroup) nameGroup.classList.add('hidden');
        if (roleGroup) roleGroup.classList.add('hidden');
      } else {
        if (nameGroup) nameGroup.classList.remove('hidden');
        if (roleGroup) roleGroup.classList.remove('hidden');
      }
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const endpoint = isLogin ? '/auth/login' : '/auth/register';

      const payload = { email, password };
      if (!isLogin) {
        payload.name = document.getElementById('name').value;
        payload.role = document.getElementById('role').value;
      }

      try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) return alert(data.error || 'Authentication failed');

        if (isLogin) {
          setAuthToken(data.token, data.user);
          window.location.href = 'dashboard.html';
        } else {
          alert('Registration successful! Please log in.');
          location.reload();
        }
      } catch (err) {
        alert('Server error.');
      }
    });
  }
}

async function loadDashboard() {
  const user = getUser();
  const token = getToken();

  if (!user || !token) return window.location.href = '/';

  const userDisplay = document.getElementById('user-display');
  if (userDisplay) userDisplay.innerText = `${user.name} (${user.role.toUpperCase()})`;

  const container = document.getElementById('courses-container');

  try {
    const res = await fetch(`${API_BASE}/courses`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error();
    const courses = await res.json();

    if (!container) return;
    if (!courses || courses.length === 0) {
      container.innerHTML = `<p class="text-slate-400 py-4">No courses available yet.</p>`;
      return;
    }

    container.innerHTML = courses.map(course => `
      <div class="glass-dark p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
        <div>
          <h3 class="text-xl font-bold text-white mb-2">${course.title}</h3>
          <p class="text-slate-400 text-sm mb-4">${course.description}</p>
        </div>
        <a href="course.html?id=${course.id}" class="gradient-bg text-white text-center py-2.5 rounded-xl text-sm font-medium">
          Enter Classroom &rarr;
        </a>
      </div>
    `).join('');
  } catch (err) {
    if (container) container.innerHTML = `<p class="text-red-400 py-4">Failed to load courses.</p>`;
  }
}

async function loadCourseDetails() {
  const user = getUser();
  const token = getToken();
  if (!user || !token) return window.location.href = '/';

  const userDisplay = document.getElementById('user-display');
  if (userDisplay) userDisplay.innerText = `${user.name} (${user.role.toUpperCase()})`;

  const urlParams = new URLSearchParams(window.location.search);
  const courseId = urlParams.get('id');
  if (!courseId) return window.location.href = 'dashboard.html';

  if (user.role === 'tutor' || user.role === 'admin') {
    const panel = document.getElementById('instructor-assignment-panel');
    if (panel) panel.classList.remove('hidden');
    setupAssignmentForm(courseId, token);
  }

  // Initialize Real-Time WebSockets
  setupChatAndSockets(courseId, user);

  try {
    const res = await fetch(`${API_BASE}/courses/${courseId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error();

    const course = await res.json();
    document.getElementById('course-title').innerText = course.title;
    document.getElementById('course-desc').innerText = course.description;

    // Render Certificate Button ONLY if the user is a student
    const certAction = document.getElementById('certificate-action');
    if (certAction && user.role === 'student') {
      certAction.innerHTML = `
        <button onclick="downloadCertificate('${course.title.replace(/'/g, "\\'")}', '${user.name.replace(/'/g, "\\'")}')" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition flex items-center gap-2 shadow-lg">
          🎓 Download Certificate
        </button>
      `;
    }

    const assignContainer = document.getElementById('assignments-container');
    if (!course.assignments || course.assignments.length === 0) {
      assignContainer.innerHTML = `<p class="text-slate-400">No assignments posted for this course yet.</p>`;
    } else {
      assignContainer.innerHTML = course.assignments.map(a => `
        <div class="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 space-y-3">
          <h4 class="font-bold text-indigo-300 text-lg">${a.title}</h4>
          <p class="text-sm text-slate-300">${a.description}</p>
          
          <form onsubmit="submitAssignment(event, ${a.id})" class="mt-4 flex gap-3 items-center">
            <input type="file" id="file-${a.id}" required class="text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600/20 file:text-indigo-400 hover:file:bg-indigo-600/30 cursor-pointer">
            <button type="submit" class="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 px-4 py-1.5 rounded-xl text-xs font-semibold">
              Upload Solution
            </button>
          </form>
        </div>
      `).join('');
    }
  } catch (err) {
    alert('Error loading course.');
  }
}

function setupAssignmentForm(courseId, token) {
  const form = document.getElementById('create-assignment-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('assign-title').value;
      const description = document.getElementById('assign-desc').value;

      const res = await fetch(`${API_BASE}/courses/${courseId}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, description })
      });

      if (res.ok) location.reload();
      else alert('Failed to create assignment');
    });
  }
}

async function submitAssignment(event, assignmentId) {
  event.preventDefault();
  const token = getToken();
  const fileInput = document.getElementById(`file-${assignmentId}`);
  if (!fileInput.files[0]) return alert('Select a file first.');

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch(`${API_BASE}/assignments/${assignmentId}/submit`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();
    if (res.ok) alert('Assignment uploaded successfully!');
    else alert(data.error || 'Upload failed');
  } catch (err) {
    alert('Server upload error.');
  }
}

function setupChatAndSockets(courseId, user) {
  socket = io();

  socket.emit('join_course', courseId);

  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatBox = document.getElementById('chat-box');

  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const message = chatInput.value;
      socket.emit('send_message', { courseId, sender: user.name, message });
      chatInput.value = '';
    });
  }

  socket.on('receive_message', (data) => {
    if (!chatBox) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1';
    msgDiv.innerHTML = `
      <div class="flex justify-between items-center font-semibold text-indigo-400">
        <span>${data.sender}</span>
        <span class="text-[10px] text-slate-500">${data.timestamp}</span>
      </div>
      <p class="text-slate-200">${data.message}</p>
    `;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  socket.on('new_submission', (data) => {
    if (!chatBox) return;
    const alertDiv = document.createElement('div');
    alertDiv.className = 'p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-300';
    alertDiv.innerHTML = `🔔 <strong>${data.studentName}</strong> submitted an assignment!`;
    chatBox.appendChild(alertDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

function downloadCertificate(courseTitle, studentName) {
  const certContainer = document.createElement('div');
  certContainer.style.padding = '50px';
  certContainer.style.textAlign = 'center';
  certContainer.style.backgroundColor = '#020617';
  certContainer.style.color = '#f8fafc';
  certContainer.style.border = '8px solid #4f46e5';
  certContainer.style.borderRadius = '24px';
  certContainer.style.fontFamily = 'Arial, sans-serif';
  certContainer.style.width = '750px';
  certContainer.style.margin = '0 auto';

  certContainer.innerHTML = `
    <div style="padding: 30px; border: 2px dashed #334155; border-radius: 16px;">
      <h1 style="font-size: 38px; color: #818cf8; margin-bottom: 10px; text-transform: uppercase; tracking-wide: 2px;">Certificate of Completion</h1>
      <p style="font-size: 16px; color: #94a3b8; margin-bottom: 30px;">This certificate is proudly awarded to</p>
      <h2 style="font-size: 34px; color: #ffffff; text-decoration: underline; margin-bottom: 30px; font-weight: bold;">${studentName}</h2>
      <p style="font-size: 16px; color: #94a3b8; margin-bottom: 12px;">for successfully fulfilling the requirements and completing</p>
      <h3 style="font-size: 26px; color: #38bdf8; margin-bottom: 40px;">${courseTitle}</h3>
      <div style="display: flex; justify-content: space-between; margin-top: 50px; padding: 0 20px;">
        <div style="text-align: left;">
          <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;">DATE</p>
          <p style="font-size: 14px; font-weight: bold; color: #cbd5e1;">${new Date().toLocaleDateString()}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;">ISSUED BY</p>
          <p style="font-size: 14px; font-weight: bold; color: #cbd5e1;">Academic Platform</p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(certContainer);

  const opt = {
    margin:       0.5,
    filename:     `${courseTitle.replace(/\s+/g, '_')}_Certificate.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'landscape' }
  };

  html2pdf().set(opt).from(certContainer).save().then(() => {
    document.body.removeChild(certContainer);
  });
}
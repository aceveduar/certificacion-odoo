const SUPABASE_URL = 'https://zenxdjuknwwdfbmbdsjg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rYyf2FSuhy9vaPV0k7eNoA_cxSlen2m';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── USUARIO / SESIÓN (Supabase Auth) ────────────────────────────────────────
let currentUser = null;
let isAdmin = false;
let appInitialized = false;

function getInitials(name) {
  return (name || '?').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso);
  if (diff < 60000)    return 'ahora mismo';
  if (diff < 3600000)  return `hace ${Math.floor(diff/60000)}m`;
  if (diff < 86400000) return `hace ${Math.floor(diff/3600000)}h`;
  return new Date(iso).toLocaleDateString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function updateUserUI() {
  if (!currentUser) return;
  document.getElementById('userAvatar').textContent = getInitials(currentUser);
  document.getElementById('userNameEl').textContent = currentUser.split(' ')[0];
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Ingresa correo y contraseña.'; return; }
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) { errEl.textContent = 'Correo o contraseña incorrectos.'; return; }
  // onAuthStateChange se encarga de cargar el perfil y entrar a la app
}

async function showUserMenu() {
  if (!confirm(`Usuario actual: ${currentUser}\n\n¿Cerrar sesión?`)) return;
  await db.auth.signOut();
  // onAuthStateChange limpia el estado y vuelve a mostrar el login
}

async function enterAppWithSession(session) {
  const { data: profile, error } = await db.from('profiles')
    .select('display_name, is_admin')
    .eq('user_id', session.user.id)
    .single();
  if (error || !profile) {
    currentUser = session.user.email;
    isAdmin = false;
    console.warn('[auth] No se encontró perfil para este usuario; usando el correo como nombre.');
  } else {
    currentUser = profile.display_name;
    isAdmin = !!profile.is_admin;
  }
  document.getElementById('loginOverlay').classList.remove('visible');
  document.getElementById('auditorBtn').classList.toggle('visible', isAdmin);
  updateUserUI();
  if (isAdmin) setAuditorUI(true);
  if (!appInitialized) { appInitialized = true; await init(); }
}

function showLoginScreen() {
  currentUser = null;
  isAdmin = false;
  document.getElementById('userAvatar').textContent = '?';
  document.getElementById('userNameEl').textContent = '—';
  document.getElementById('auditorBtn').classList.remove('visible');
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
  document.getElementById('loginOverlay').classList.add('visible');
  setTimeout(() => document.getElementById('loginEmail').focus(), 100);
}

db.auth.onAuthStateChange((_event, session) => {
  if (session) enterAppWithSession(session);
  else showLoginScreen();
});

async function logActivity(questionId, action, details) {
  if (!currentUser) return;
  await db.from('activity_log').insert({
    user_name:   currentUser,
    question_id: questionId || null,
    action,
    details
  });
  // Actualizar modified_by en la pregunta
  if (questionId) {
    const now = new Date().toISOString();
    await db.from('preguntas').update({ modified_by: currentUser, modified_at: now }).eq('id', questionId);
    const q = questions.find(q => q.id === questionId);
    if (q) { q.modified_by = currentUser; q.modified_at = now; }
  }
}

async function openActivity() {
  document.getElementById('activityOverlay').classList.add('visible');
  const list = document.getElementById('activityList');
  list.innerHTML = '<div class="empty"><div class="emoji">⏳</div><p>Cargando...</p></div>';
  const { data, error } = await db.from('activity_log')
    .select('*, preguntas(question)')
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) {
    console.error('[openActivity] Error de Supabase:', error);
    list.innerHTML = `<div class="empty"><div class="emoji">⚠️</div><p>Error al cargar: ${error.message}</p></div>`;
    return;
  }
  if (!data?.length) {
    list.innerHTML = '<div class="empty"><div class="emoji">📭</div><p>Sin actividad registrada.</p></div>';
    return;
  }
  list.innerHTML = data.map(r => `
    <div class="activity-item">
      <span class="act-avatar">${getInitials(r.user_name)}</span>
      <div class="act-body">
        <div class="act-top">
          <strong>${r.user_name}</strong>
          <span class="act-action">${r.action}</span>
          <span class="act-time">${timeAgo(r.created_at)}</span>
        </div>
        ${r.details ? `<div class="act-detail">${r.details}</div>` : ''}
        ${r.preguntas?.question ? `<div class="act-question">${r.preguntas.question.substring(0,80)}…</div>` : ''}
      </div>
    </div>
  `).join('');
}

function closeActivity() {
  document.getElementById('activityOverlay').classList.remove('visible');
}

(function initTheme() {
  const saved     = localStorage.getItem('odoo_theme');
  const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const theme     = saved || preferred;
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeBtn').textContent = theme === 'dark' ? '☀️' : '🌙';
})();

// Seguir cambios del sistema solo si el usuario no ha elegido manualmente
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (localStorage.getItem('odoo_theme')) return;
  const theme = e.matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeBtn').textContent = theme === 'dark' ? '☀️' : '🌙';
});

// Scroll listener para botón arriba + sticky shadow
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  document.getElementById('backToTop').classList.toggle('visible', y > 350);
}, { passive: true });

function toggleResults() {
  const panel = document.getElementById('resultsPanel');
  const btn   = document.getElementById('resultsBtn');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  btn.classList.toggle('active', open);
}

function switchResultTab(n) {
  [1,2,3].forEach(i => {
    const img = document.getElementById(`rimg${i}`);
    const tab = document.getElementById(`rtab${i}`);
    if (img) img.style.display = i === n ? 'block' : 'none';
    if (tab) tab.classList.toggle('active', i === n);
  });
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('themeBtn').textContent = next === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('odoo_theme', next);
}

let questions = [];
let mode = 'study';
let activeSection = 'all';
let searchTerm = '';
let answered    = {};
let revealed    = {};
let expandedIds  = new Set();
let dragSrcId    = null;

// ── SHUFFLE ──────────────────────────────────────────
let shuffleEnabled = false;
let shuffledIds    = []; // question ids in shuffled order

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function toggleShuffle() {
  shuffleEnabled = !shuffleEnabled;
  document.getElementById('shuffleBtn').classList.toggle('active', shuffleEnabled);
  if (shuffleEnabled) shuffledIds = shuffle(questions.map(q => q.id));
  render();
}

// ── EXAM ─────────────────────────────────────────────
let examTimer      = null;
let examSecsLeft   = 0;
let examTotalSecs  = 0;
let examSubmitted  = false;
let examStartTs    = null;
let examFlagged    = new Set(); // global indices marcados para revisión
let examFlagFilterActive = false; // si está activo, getFiltered() solo muestra las marcadas

// ── ESTADO DE EXÁMENES (configs, simulacro admin, flags) ──
let examConfigs        = []; // [{ section, duration_minutes, ... }]
const FULL_EXAM_SECTION = '__FULL__'; // sentinel "section" para el examen completo (todas las secciones)
let selectedExamModule = null;
let currentExamSource  = 'admin'; // 'admin' | 'module' — define qué setup inició el examen actual

function getExamConfig(section) {
  return examConfigs.find(c => c.section === section) || null;
}

function updateExamSetupCount() {
  const prueba = document.getElementById('examPruebaSelect').value;
  const base = prueba ? questions.filter(q => q.prueba === prueba) : questions;
  const count = base.filter(q => q.answer).length;
  document.getElementById('examQCount').textContent = `${count} preguntas`;
}

function startExam() {
  examSubmitted = false;
  currentExamSource = 'admin';
  const prueba  = document.getElementById('examPruebaSelect').value;
  shuffleEnabled = true;
  const base = prueba ? questions.filter(q => q.prueba === prueba) : questions;
  const pool = base.filter(q => q.answer);
  shuffledIds = shuffle(pool.map(q => q.id));
  examSecsLeft  = 90 * 60;
  examTotalSecs = 90 * 60;
  examStartTs   = Date.now();
  answered = {}; revealed = {}; examFlagged = new Set();
  resetExamFlagFilterUI();
  document.getElementById('examSetup').style.display   = 'none';
  document.getElementById('examTimerBar').style.display = 'flex';
  document.getElementById('sectionStatsPanel').style.display = 'none';
  document.body.classList.remove('exam-setup-browse');
  startTimer();
  render();
}

// ── EXAMEN POR MÓDULO (vista simple para usuarios) ───
function renderExamSetup() {
  const showAdmin = auditorMode;
  document.getElementById('examSetupAdmin').style.display  = showAdmin ? 'block' : 'none';
  document.getElementById('examSetupModule').style.display = showAdmin ? 'none'  : 'block';
  // Mientras un usuario común elige módulo, oculta el banco completo de
  // preguntas (sidebar, contador y lista): no debe poder hojear el resto
  // del examen antes de presentarlo.
  document.body.classList.toggle('exam-setup-browse', !showAdmin);
  if (showAdmin) updateExamSetupCount();
  else renderExamModuleList();
}

function renderExamModuleList() {
  selectedExamModule = null;
  const startBtn = document.getElementById('examModuleStartBtn');
  if (startBtn) startBtn.disabled = true;

  const container = document.getElementById('examModuleList');
  const fullCfg = getExamConfig(FULL_EXAM_SECTION);
  const moduleConfigs = examConfigs.filter(c => c.section !== FULL_EXAM_SECTION);

  if (!fullCfg && !moduleConfigs.length) {
    container.innerHTML = '<div class="empty"><div class="emoji">🚧</div><p>Aún no hay exámenes disponibles.<br>Pide al auditor que configure uno.</p></div>';
    return;
  }

  let html = '';
  if (fullCfg) {
    const count = questions.filter(q => q.answer).length;
    html += `<div class="exam-module-card full" onclick="selectExamModule(${fullCfg.id}, this)">
      <div class="emc-name">🌐 Examen completo · todas las secciones</div>
      <div class="emc-meta"><span>${count} preguntas</span><span>⏱ ${fullCfg.duration_minutes} min</span></div>
    </div>`;
  }
  html += moduleConfigs.map(cfg => {
    const count = questions.filter(q => q.section === cfg.section && q.answer).length;
    return `<div class="exam-module-card" onclick="selectExamModule(${cfg.id}, this)">
      <div class="emc-name">${cfg.section}</div>
      <div class="emc-meta"><span>${count} preguntas</span><span>⏱ ${cfg.duration_minutes} min</span></div>
    </div>`;
  }).join('');
  container.innerHTML = html;
}

function selectExamModule(configId, el) {
  const cfg = examConfigs.find(c => c.id === configId);
  if (!cfg) return;
  selectedExamModule = cfg.section;
  document.querySelectorAll('.exam-module-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('examModuleStartBtn').disabled = false;
}

function startModuleExam() {
  if (!selectedExamModule) return;
  const cfg  = getExamConfig(selectedExamModule);
  const mins = cfg?.duration_minutes || 30;
  const isFullExam = selectedExamModule === FULL_EXAM_SECTION;

  examSubmitted = false;
  currentExamSource = 'module';
  shuffleEnabled = true;

  // Acota el examen exclusivamente a las preguntas del módulo elegido (o a todas,
  // si es el examen completo), reusando getFiltered() (que ya alimenta stats,
  // resultados y guardado de sesión).
  activeSection = isFullExam ? null : selectedExamModule;
  searchTerm = ''; flagFilter = null; answerFilter = 'has-answer'; pruebaFilter = null;
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').classList.remove('visible');
  document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('qfAll')?.classList.add('active');
  // Filtra a solo preguntas con respuesta correcta, igual que el pool del examen
  document.querySelectorAll('#answerFilters .qf-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('qfAnsCorrecta')?.classList.add('active');
  document.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('pfAll')?.classList.add('active');
  updateTabs();

  const pool = isFullExam
    ? questions.filter(q => q.answer)
    : questions.filter(q => q.section === selectedExamModule && q.answer);
  shuffledIds = shuffle(pool.map(q => q.id));

  examSecsLeft  = mins * 60;
  examTotalSecs = mins * 60;
  examStartTs   = Date.now();
  answered = {}; revealed = {}; examFlagged = new Set();
  resetExamFlagFilterUI();

  document.getElementById('examSetup').style.display    = 'none';
  document.getElementById('examTimerBar').style.display = 'flex';
  document.getElementById('sectionStatsPanel').style.display = 'none';
  document.body.classList.remove('exam-setup-browse');
  const focusLabel = isFullExam
    ? `🎓 Examen completo · ${pool.length} preguntas`
    : `🎓 Examen de módulo · ${selectedExamModule} · ${pool.length} preguntas`;
  setExamFocusUI(!auditorMode, focusLabel);
  startTimer();
  render();
}

// ── CONFIGURACIÓN DE EXÁMENES POR MÓDULO (auditor) ────
function openExamConfigModal() {
  renderExamConfigList();
  document.getElementById('examConfigOverlay').classList.add('visible');
}

function closeExamConfigModal() {
  document.getElementById('examConfigOverlay').classList.remove('visible');
}

function renderExamConfigList() {
  const sections = [...new Set(questions.map(q => q.section))].sort();
  const list = document.getElementById('examConfigList');
  if (!sections.length) {
    list.innerHTML = '<div class="empty"><div class="emoji">📭</div><p>No hay módulos todavía.</p></div>';
    return;
  }
  const fullCfg = getExamConfig(FULL_EXAM_SECTION);
  const fullRow = `<div class="activity-item exam-config-row exam-config-row-full">
    <label class="exam-config-toggle">
      <input type="checkbox" ${fullCfg ? 'checked' : ''} onchange="toggleExamConfig('${FULL_EXAM_SECTION}', this.checked)">
      <span>🌐 Examen completo · todas las secciones</span>
    </label>
    <div class="exam-config-duration">
      <input type="number" min="5" max="240" step="5"
             value="${fullCfg ? fullCfg.duration_minutes : 90}"
             ${fullCfg ? '' : 'disabled'}
             onchange="updateExamConfigDuration('${FULL_EXAM_SECTION}', this.value)">
      <span>min</span>
    </div>
  </div>`;
  const moduleRows = sections.map(section => {
    const cfg = getExamConfig(section);
    const safeSection = section.replace(/'/g, "\\'");
    return `<div class="activity-item exam-config-row">
      <label class="exam-config-toggle">
        <input type="checkbox" ${cfg ? 'checked' : ''} onchange="toggleExamConfig('${safeSection}', this.checked)">
        <span>${section}</span>
      </label>
      <div class="exam-config-duration">
        <input type="number" min="5" max="240" step="5"
               value="${cfg ? cfg.duration_minutes : 30}"
               ${cfg ? '' : 'disabled'}
               onchange="updateExamConfigDuration('${safeSection}', this.value)">
        <span>min</span>
      </div>
    </div>`;
  }).join('');
  list.innerHTML = fullRow + '<div class="exam-config-divider"></div>' + moduleRows;
}

function examConfigLabel(section) {
  return section === FULL_EXAM_SECTION ? 'Examen completo (todas las secciones)' : `examen por módulo: ${section}`;
}

async function toggleExamConfig(section, enabled) {
  const isFull = section === FULL_EXAM_SECTION;
  const shortLabel = isFull ? 'Examen completo' : `Examen de "${section}"`;
  if (enabled) {
    const minutes = isFull ? 90 : 30;
    const payload = { section, duration_minutes: minutes, created_by: currentUser, updated_at: new Date().toISOString() };
    const { data, error } = await db.from('exam_configs').upsert(payload, { onConflict: 'section' }).select().single();
    if (error) { showToast('⚠️ No se pudo activar: ' + error.message); renderExamConfigList(); return; }
    examConfigs = examConfigs.filter(c => c.section !== section);
    examConfigs.push(data);
    logActivity(null, `Activó ${examConfigLabel(section)} (${minutes} min)`, null);
    showToast(`✅ ${shortLabel} activado`);
  } else {
    const { error } = await db.from('exam_configs').delete().eq('section', section);
    if (error) { showToast('⚠️ No se pudo desactivar: ' + error.message); renderExamConfigList(); return; }
    examConfigs = examConfigs.filter(c => c.section !== section);
    logActivity(null, `Desactivó ${examConfigLabel(section)}`, null);
    showToast(`🚫 ${shortLabel} desactivado`);
  }
  renderExamConfigList();
}

async function toggleAllExamConfigs(enable) {
  const sections = [...new Set(questions.map(q => q.section))];
  if (enable) {
    const missing = sections.filter(s => !getExamConfig(s));
    if (!missing.length) { showToast('Todos los módulos ya están activados.'); return; }
    const payload = missing.map(section => ({ section, duration_minutes: 30, created_by: currentUser, updated_at: new Date().toISOString() }));
    const { data, error } = await db.from('exam_configs').upsert(payload, { onConflict: 'section' }).select();
    if (error) { showToast('⚠️ No se pudieron activar los módulos: ' + error.message); return; }
    examConfigs = examConfigs.filter(c => !missing.includes(c.section)).concat(data);
    logActivity(null, `Activó examen para todos los módulos (${missing.length})`, null);
    showToast(`✅ ${missing.length} módulo(s) activados (30 min c/u)`);
  } else {
    if (!examConfigs.length) { showToast('No hay módulos activados.'); return; }
    const { error } = await db.from('exam_configs').delete().gte('id', 0);
    if (error) { showToast('⚠️ No se pudieron desactivar los módulos: ' + error.message); return; }
    const total = examConfigs.length;
    examConfigs = [];
    logActivity(null, `Desactivó examen para todos los módulos (${total})`, null);
    showToast(`🚫 ${total} módulo(s) desactivados`);
  }
  renderExamConfigList();
}

async function updateExamConfigDuration(section, value) {
  const minutes = Math.max(5, Math.min(240, parseInt(value, 10) || 30));
  const cfg = getExamConfig(section);
  if (!cfg) return;
  const { data, error } = await db.from('exam_configs')
    .update({ duration_minutes: minutes, created_by: currentUser, updated_at: new Date().toISOString() })
    .eq('section', section).select().single();
  if (error) { showToast('⚠️ No se pudo guardar la duración: ' + error.message); renderExamConfigList(); return; }
  const idx = examConfigs.findIndex(c => c.section === section);
  if (idx !== -1) examConfigs[idx] = data;
  const shortLabel = section === FULL_EXAM_SECTION ? 'Examen completo' : `"${section}"`;
  logActivity(null, `Cambió duración de ${examConfigLabel(section)} → ${minutes} min`, null);
  showToast(`✅ Duración de ${shortLabel} actualizada a ${minutes} min`);
  renderExamConfigList();
}

function toggleExamFlag(globalIdx) {
  if (examFlagged.has(globalIdx)) examFlagged.delete(globalIdx);
  else examFlagged.add(globalIdx);
  // Actualiza solo el botón sin re-renderizar todo
  const card = document.querySelector(`.q-card[data-qid="${questions[globalIdx].id}"]`);
  if (card) {
    const btn = card.querySelector('.exam-flag-btn');
    if (btn) btn.classList.toggle('flagged', examFlagged.has(globalIdx));
  }
  updateExamProgress();
}

function updateExamProgress() {
  const filtered = getFiltered();
  const total = filtered.length;
  const respondidas = filtered.filter((q, fi) => answered[questions.indexOf(q)] !== undefined).length;
  const marcadas = filtered.filter((q) => examFlagged.has(questions.indexOf(q))).length;
  const el = document.getElementById('examProgressInfo');
  if (el) el.textContent = `${respondidas}/${total} respondidas${marcadas > 0 ? ` · ${marcadas} marcadas` : ''}`;

  const filterBtn = document.getElementById('examFlagFilterBtn');
  if (filterBtn) {
    filterBtn.style.display = marcadas > 0 ? 'inline-flex' : 'none';
    document.getElementById('examFlagFilterCount').textContent = marcadas;
    if (marcadas === 0 && examFlagFilterActive) { examFlagFilterActive = false; filterBtn.classList.remove('active'); render(); }
  }
}

function resetExamFlagFilterUI() {
  examFlagFilterActive = false;
  const btn = document.getElementById('examFlagFilterBtn');
  if (btn) { btn.style.display = 'none'; btn.classList.remove('active'); }
  const cnt = document.getElementById('examFlagFilterCount');
  if (cnt) cnt.textContent = '0';
}

// Acota la lista del examen a solo las preguntas marcadas con 🚩, para
// que el usuario pueda revisarlas rápido antes de entregar.
function toggleExamFlagFilter() {
  if (examFlagged.size === 0) return;
  examFlagFilterActive = !examFlagFilterActive;
  document.getElementById('examFlagFilterBtn').classList.toggle('active', examFlagFilterActive);
  render();
}

function startTimer() {
  clearInterval(examTimer);
  updateTimerDisplay();
  examTimer = setInterval(() => {
    examSecsLeft--;
    updateTimerDisplay();
    if (examSecsLeft <= 0) { clearInterval(examTimer); submitExam(); }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(examSecsLeft / 60).toString().padStart(2, '0');
  const s = (examSecsLeft % 60).toString().padStart(2, '0');
  const el = document.getElementById('timerDisplay');
  if (el) {
    el.textContent = `${m}:${s}`;
    el.classList.toggle('timer-warning', examSecsLeft < 600);
    el.classList.toggle('timer-danger',  examSecsLeft < 180);
  }
  const pct = (examSecsLeft / examTotalSecs) * 100;
  const fill = document.getElementById('timerFill');
  if (fill) fill.style.width = pct + '%';
}

function confirmSubmitExam() {
  const filtered = getFiltered();
  const total = filtered.length;
  const respondidas = filtered.filter((q) => answered[questions.indexOf(q)] !== undefined).length;
  const sinResponder = total - respondidas;
  const marcadas = filtered.filter((q) => examFlagged.has(questions.indexOf(q))).length;

  let msg = `¿Entregar el examen?`;
  if (sinResponder > 0) msg += `\n\n⚠️ Tienes ${sinResponder} pregunta${sinResponder > 1 ? 's' : ''} sin responder.`;
  if (marcadas > 0) msg += `\n🚩 Tienes ${marcadas} marcada${marcadas > 1 ? 's' : ''} para revisión.`;

  if (confirm(msg)) submitExam();
}

function submitExam() {
  clearInterval(examTimer);
  examSubmitted = true;
  setExamFocusUI(false);
  document.getElementById('examTimerBar').style.display = 'none';
  const duration = Math.round((Date.now() - examStartTs) / 1000);
  const sessionLabel = currentExamSource === 'module'
    ? selectedExamModule
    : (document.getElementById('examPruebaSelect').value || 'all');
  saveSession('exam', sessionLabel, duration);
  showExamResults(duration);
}

function showExamResults(duration) {
  const filtered = getFiltered();
  const total = filtered.length;
  const correct = filtered.filter((q) => answered[questions.indexOf(q)] === true).length;
  const wrong = filtered.filter((q) => answered[questions.indexOf(q)] === false).length;
  const skipped = total - correct - wrong;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const passed = pct >= 70;
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const totalMins = Math.floor(examTotalSecs / 60).toString().padStart(2, '0');
  const marcadas = filtered.filter((q) => examFlagged.has(questions.indexOf(q))).length;

  const stats = getSectionStats();
  const sectionRows = Object.entries(stats)
    .sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total))
    .map(([sec, v]) => {
      const p = Math.round((v.correct / v.total) * 100);
      const cls = p >= 70 ? 'good' : p >= 50 ? 'ok' : 'bad';
      return `<div class="ss-row">
        <span class="ss-section">${sec}</span>
        <div class="ss-bar-wrap"><div class="ss-bar ${cls}" style="width:${p}%"></div></div>
        <span class="ss-score ${cls}">${v.correct}/${v.total}</span>
        <span class="ss-pct ${cls}">${p}%</span>
      </div>`;
    }).join('');

  document.getElementById('examResultsContent').innerHTML = `
    <div class="er-header">
      <div class="er-icon">${passed ? '🏆' : '📋'}</div>
      <div class="er-score ${passed ? 'good' : pct >= 50 ? 'ok' : 'bad'}">${pct}%</div>
      <div class="er-verdict ${passed ? 'good' : 'bad'}">${passed ? '✅ Aprobado' : '❌ No aprobado'}</div>
      <div class="er-subtitle">Puntaje mínimo para aprobar: 70%</div>
    </div>
    <div class="er-stats">
      <div class="er-stat good">
        <div class="er-stat-num">${correct}</div>
        <div class="er-stat-label">Correctas</div>
      </div>
      <div class="er-stat bad">
        <div class="er-stat-num">${wrong}</div>
        <div class="er-stat-label">Incorrectas</div>
      </div>
      <div class="er-stat muted">
        <div class="er-stat-num">${skipped}</div>
        <div class="er-stat-label">Sin responder</div>
      </div>
      ${marcadas > 0 ? `<div class="er-stat flagged">
        <div class="er-stat-num">${marcadas}</div>
        <div class="er-stat-label">Marcadas</div>
      </div>` : ''}
    </div>
    <div class="er-time">⏱ Tiempo: ${mins}m ${secs.toString().padStart(2,'0')}s de ${totalMins}:00</div>
    <div class="er-sections">
      <div class="er-sections-title">Rendimiento por sección</div>
      <div class="er-sections-body">${sectionRows}</div>
    </div>
    <div class="er-actions">
      <button class="modal-btn confirm" onclick="closeExamResults()">Ver respuestas</button>
      <button class="modal-btn cancel" onclick="closeExamResults(); setMode('study')">Volver al estudio</button>
    </div>`;

  document.getElementById('examResultsOverlay').classList.add('visible');
}

function closeExamResults() {
  document.getElementById('examResultsOverlay').classList.remove('visible');
  renderSectionStats();
  render();
}

// ── SECTION STATS ────────────────────────────────────
function getSectionStats() {
  const filtered = getFiltered();
  const bySection = {};
  filtered.forEach((q, fi) => {
    const gi = questions.indexOf(q);
    if (!bySection[q.section]) bySection[q.section] = { total: 0, correct: 0 };
    bySection[q.section].total++;
    if (answered[gi] === true) bySection[q.section].correct++;
  });
  return bySection;
}

function renderSectionStats() {
  const stats  = getSectionStats();
  const panel  = document.getElementById('sectionStatsPanel');
  const body   = document.getElementById('sectionStatsBody');
  const total  = Object.values(stats).reduce((s,v) => s + v.total, 0);
  const correct = Object.values(stats).reduce((s,v) => s + v.correct, 0);
  if (total === 0) { panel.style.display = 'none'; return; }

  const rows = Object.entries(stats)
    .sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total))
    .map(([sec, v]) => {
      const pct = Math.round((v.correct / v.total) * 100);
      const cls = pct >= 70 ? 'good' : pct >= 50 ? 'ok' : 'bad';
      return `<div class="ss-row">
        <span class="ss-section">${sec}</span>
        <div class="ss-bar-wrap"><div class="ss-bar ${cls}" style="width:${pct}%"></div></div>
        <span class="ss-score ${cls}">${v.correct}/${v.total}</span>
        <span class="ss-pct ${cls}">${pct}%</span>
      </div>`;
    }).join('');

  body.innerHTML = rows;
  panel.style.display = 'block';
}

// ── MI PROGRESO (resumen en sidebar, solo usuarios comunes) ──
async function loadMyProgressSummary() {
  const el = document.getElementById('myProgressSummary');
  if (!el || !currentUser) return;
  el.innerHTML = '<p class="my-progress-empty">Cargando...</p>';
  const { data, error } = await db.from('practice_sessions')
    .select('mode, score_pct, correct_answers, total_questions, created_at')
    .eq('user_name', currentUser)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) { el.innerHTML = `<p class="my-progress-empty">No se pudo cargar tu progreso.</p>`; return; }
  if (!data?.length) {
    el.innerHTML = '<p class="my-progress-empty">Aún no tienes sesiones guardadas.<br>Practica un módulo para ver tu avance aquí.</p>';
    return;
  }
  const r = data[0];
  const cls  = r.score_pct >= 70 ? 'good' : r.score_pct >= 50 ? 'ok' : 'bad';
  const icon = r.mode === 'exam' ? '🎓' : '🎯';
  el.innerHTML = `
    <div class="my-progress-card">
      <div class="mp-row">
        <span class="mp-icon">${icon}</span>
        <span class="mp-score ${cls}">${r.correct_answers}/${r.total_questions} · ${r.score_pct}%</span>
      </div>
      <div class="mp-meta">Última sesión · ${timeAgo(r.created_at)}</div>
      <button class="mp-link" onclick="openProgress()">Ver progreso completo →</button>
    </div>`;
}

// ── SAVE SESSION ─────────────────────────────────────
async function saveSession(sessionMode, prueba, duration) {
  if (!currentUser) {
    console.warn('[saveSession] No hay usuario logueado — sesión no guardada.');
    return;
  }
  const filtered = getFiltered();
  const total   = filtered.length;
  const correct = Object.values(answered).filter(Boolean).length;
  const pct     = total ? Math.round((correct / total) * 100) : 0;
  const stats   = getSectionStats();
  const section_scores = Object.fromEntries(
    Object.entries(stats).map(([k, v]) => [k, { c: v.correct, t: v.total }])
  );
  const { error } = await db.from('practice_sessions').insert({
    user_name: currentUser, mode: sessionMode,
    prueba: prueba || null, total_questions: total,
    correct_answers: correct, score_pct: pct,
    section_scores, duration_seconds: duration
  });
  if (error) {
    console.error('[saveSession] Error al guardar en Supabase:', error);
    showToast(`⚠️ No se pudo guardar la sesión: ${error.message}`);
  } else {
    showToast('✅ Sesión guardada en tu progreso');
    loadMyProgressSummary();
  }
}

async function openProgress() {
  document.getElementById('progressOverlay').classList.add('visible');
  const list = document.getElementById('progressList');
  list.innerHTML = '<div class="empty"><div class="emoji">⏳</div><p>Cargando...</p></div>';
  if (!currentUser) {
    list.innerHTML = '<div class="empty"><div class="emoji">👤</div><p>Inicia sesión con tu nombre para ver tu progreso.</p></div>';
    return;
  }
  const { data, error } = await db.from('practice_sessions')
    .select('*')
    .eq('user_name', currentUser)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.error('[openProgress] Error de Supabase:', error);
    list.innerHTML = `<div class="empty"><div class="emoji">⚠️</div><p>Error al cargar: ${error.message}</p></div>`;
    return;
  }
  if (!data?.length) {
    list.innerHTML = '<div class="empty"><div class="emoji">🏁</div><p>Aún no tienes sesiones guardadas.<br>Completa un modo Práctica o Examen.</p></div>';
    return;
  }
  list.innerHTML = data.map(r => {
    const icon = r.mode === 'exam' ? '🎓' : '🎯';
    const cls  = r.score_pct >= 70 ? 'good' : r.score_pct >= 50 ? 'ok' : 'bad';
    const d    = new Date(r.created_at);
    const date = d.toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' });
    const time = d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
    return `<div class="activity-item">
      <span class="act-avatar" style="font-size:16px">${icon}</span>
      <div class="act-body">
        <div class="act-top">
          <strong>${r.mode === 'exam' ? 'Examen' : 'Práctica'}</strong>
          ${auditorMode && r.prueba ? `<span class="prueba-tag ${r.prueba}">${r.prueba.replace('prueba','P')}</span>` : ''}
          <span class="score-badge ${cls}">${r.score_pct}%</span>
          <span class="act-time">${date} ${time}</span>
        </div>
        <div class="act-detail">${r.correct_answers}/${r.total_questions} correctas · ${Math.round((r.duration_seconds||0)/60)} min</div>
      </div>
    </div>`;
  }).join('');
}

function closeProgress() {
  document.getElementById('progressOverlay').classList.remove('visible');
}

// ── RESULTADOS POR PERSONA (auditor) ──────────────────
// Agrupa todas las sesiones guardadas (practice_sessions) por usuario
// para que el auditor vea de un vistazo cómo le fue a cada quien en
// el examen, sin tener que revisar sesión por sesión.
let userStatsData = [];

async function openUserStats() {
  document.getElementById('userStatsOverlay').classList.add('visible');
  const list = document.getElementById('userStatsList');
  list.innerHTML = '<div class="empty"><div class="emoji">⏳</div><p>Cargando...</p></div>';

  const { data, error } = await db.from('practice_sessions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    list.innerHTML = `<div class="empty"><div class="emoji">⚠️</div><p>Error al cargar: ${error.message}</p></div>`;
    return;
  }
  userStatsData = data || [];
  renderUserStatsSummary();
}

function closeUserStats() {
  document.getElementById('userStatsOverlay').classList.remove('visible');
}

function renderUserStatsSummary() {
  document.getElementById('userStatsTitle').textContent = '🏆 Resultados por persona';
  const list = document.getElementById('userStatsList');
  if (!userStatsData.length) {
    list.innerHTML = '<div class="empty"><div class="emoji">🏁</div><p>Aún no hay sesiones registradas.</p></div>';
    return;
  }

  const byUser = {};
  userStatsData.forEach(r => (byUser[r.user_name] ||= []).push(r));

  const rows = Object.entries(byUser).map(([name, sessions]) => {
    const exams  = sessions.filter(s => s.mode === 'exam');
    const best   = exams.length ? Math.max(...exams.map(s => s.score_pct)) : null;
    const avg    = exams.length ? Math.round(exams.reduce((a, s) => a + s.score_pct, 0) / exams.length) : null;
    const passed = best !== null && best >= 70;
    const cls    = best === null ? 'muted' : passed ? 'good' : best >= 50 ? 'ok' : 'bad';
    const last   = sessions[0];
    const lastDate = last ? new Date(last.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—';
    const safeName = name.replace(/'/g, "\\'");
    return `<div class="activity-item user-stats-row" onclick="renderUserStatsDetail('${safeName}')">
      <span class="act-avatar">${getInitials(name)}</span>
      <div class="act-body">
        <div class="act-top">
          <strong>${name}</strong>
          <span class="score-badge ${cls}">${best !== null ? `Mejor: ${best}%` : 'Sin examen'}</span>
          ${best !== null ? `<span class="us-verdict ${passed ? 'good' : 'bad'}">${passed ? '✅ Aprobado' : '❌ No aprobado'}</span>` : ''}
        </div>
        <div class="act-detail">
          ${exams.length} examen${exams.length === 1 ? '' : 'es'}${avg !== null ? ` · promedio ${avg}%` : ''}
          · ${sessions.length - exams.length} práctica${sessions.length - exams.length === 1 ? '' : 's'}
          · última actividad: ${lastDate}
        </div>
      </div>
      <span class="us-arrow">›</span>
    </div>`;
  }).join('');

  list.innerHTML = `<div class="user-stats-hint">${Object.keys(byUser).length} persona(s) con actividad registrada · toca un nombre para ver su historial completo</div>${rows}`;
}

function renderUserStatsDetail(userName) {
  document.getElementById('userStatsTitle').textContent = `🏆 ${userName}`;
  const list = document.getElementById('userStatsList');
  const sessions = userStatsData.filter(r => r.user_name === userName);

  const rows = sessions.map(r => {
    const icon = r.mode === 'exam' ? '🎓' : '🎯';
    const cls  = r.score_pct >= 70 ? 'good' : r.score_pct >= 50 ? 'ok' : 'bad';
    const d    = new Date(r.created_at);
    const date = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    return `<div class="activity-item">
      <span class="act-avatar" style="font-size:16px">${icon}</span>
      <div class="act-body">
        <div class="act-top">
          <strong>${r.mode === 'exam' ? 'Examen' : 'Práctica'}</strong>
          ${r.prueba ? `<span class="prueba-tag ${r.prueba}">${r.prueba.replace('prueba', 'P')}</span>` : ''}
          <span class="score-badge ${cls}">${r.score_pct}%</span>
          <span class="act-time">${date} ${time}</span>
        </div>
        <div class="act-detail">${r.correct_answers}/${r.total_questions} correctas · ${Math.round((r.duration_seconds || 0) / 60)} min</div>
      </div>
    </div>`;
  }).join('');

  list.innerHTML = `<button class="us-back-btn" onclick="renderUserStatsSummary()">← Volver al resumen</button>${rows}`;
}

// ── MODO AUDITOR Y FILTROS DE BÚSQUEDA ────────────────
let auditorMode = false;
let flagFilter   = null;
let answerFilter = null;
let pruebaFilter = null;

function clearSearch() {
  const input = document.getElementById('searchInput');
  input.value = '';
  searchTerm = '';
  document.getElementById('searchClear').classList.remove('visible');
  input.focus();
  render();
}

function setPruebaFilter(val) {
  pruebaFilter = val;
  document.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('active'));
  const id = val ? `pfBtn_${val}` : 'pfAll';
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  render();
}

function buildPruebaFilters() {
  const pruebas = [...new Set(questions.map(q => q.prueba).filter(Boolean))].sort();
  const container = document.getElementById('pruebaFilters');
  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'pf-btn active'; allBtn.id = 'pfAll';
  allBtn.textContent = '📋 Todas';
  allBtn.onclick = () => setPruebaFilter(null);
  container.appendChild(allBtn);

  if (pruebas.length > 1) {
    const conBtn = document.createElement('button');
    conBtn.className = 'pf-btn con-prueba'; conBtn.id = 'pfBtn_con';
    conBtn.innerHTML = `Con prueba <span id="pfCount_con">0</span>`;
    conBtn.onclick = () => setPruebaFilter('con');
    container.appendChild(conBtn);
  }

  pruebas.forEach(p => {
    const label = p.replace('prueba', 'Prueba ');
    const btn = document.createElement('button');
    btn.className = `pf-btn`; btn.id = `pfBtn_${p}`;
    btn.innerHTML = `${label} <span id="pfCount_${p}">0</span>`;
    btn.onclick = () => setPruebaFilter(p);
    container.appendChild(btn);
  });

  const sinBtn = document.createElement('button');
  sinBtn.className = 'pf-btn sin'; sinBtn.id = 'pfBtn_sin';
  sinBtn.innerHTML = 'Sin asignar <span id="pfCount_sin">0</span>';
  sinBtn.onclick = () => setPruebaFilter('sin');
  container.appendChild(sinBtn);
}

async function setMyAnswer(questionId, key, e) {
  e.stopPropagation();
  const q = questions.find(q => q.id === questionId);
  if (!q) return;
  const newVal = q.my_answer === key ? null : key;
  const { error } = await db.from('preguntas').update({ my_answer: newVal }).eq('id', questionId);
  if (error) { console.error(error); return; }
  q.my_answer = newVal;
  logActivity(questionId, newVal ? `Marcó su respuesta: ${newVal}` : 'Quitó su respuesta', q.question?.substring(0,60));
  render();
}

function editSection(qId, spanEl) {
  const q = questions.find(q => q.id === qId);
  if (!q) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = q.section;
  input.className = 'section-inline-input';
  input.setAttribute('list', 'sectionList');

  spanEl.replaceWith(input);
  input.focus();
  input.select();

  async function save() {
    const newVal = input.value.trim();
    if (newVal && newVal !== q.section) {
      const { error } = await db.from('preguntas').update({ section: newVal }).eq('id', qId);
      if (!error) {
        q.section = newVal;
        const dl = document.getElementById('sectionList');
        if (![...dl.options].some(o => o.value === newVal)) {
          const opt = document.createElement('option'); opt.value = newVal;
          dl.appendChild(opt);
        }
      }
    }
    render();
  }

  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = q.section; input.blur(); }
  });
}

async function setPrueba(qId, prueba, e) {
  e.stopPropagation();
  const q = questions.find(q => q.id === qId);
  if (!q) return;
  const newVal = q.prueba === prueba ? null : prueba;
  const { error } = await db.from('preguntas').update({ prueba: newVal }).eq('id', qId);
  if (error) { console.error(error); return; }
  q.prueba = newVal;
  render();
}

function getQFlags(q) {
  return new Set(q.status ? q.status.split('|') : []);
}

async function setFlag(qId, flag, e) {
  e.stopPropagation();
  const q = questions.find(q => q.id === qId);
  if (!q) return;
  const flags = getQFlags(q);
  const adding = !flags.has(flag);
  if (!adding) { flags.delete(flag); } else {
    if (flag === 'segura')  flags.delete('revisar');
    if (flag === 'revisar') flags.delete('segura');
    flags.add(flag);
  }
  const newStatus = flags.size ? [...flags].join('|') : null;
  const { error } = await db.from('preguntas').update({ status: newStatus }).eq('id', qId);
  if (error) { console.error(error); return; }
  q.status = newStatus;
  const labels = { segura:'✅ Confirmada', revisar:'❓ Dudosa', ilegible:'✏️ Por corregir' };
  logActivity(qId, adding ? `Marcó como ${labels[flag]}` : `Quitó ${labels[flag]}`, q.question?.substring(0,60));
  render();
}

function setFlagFilter(val) {
  flagFilter = val;
  document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
  const map = { null: 'qfAll', 'sin-rev': 'qfSinRev', segura: 'qfSegura', revisar: 'qfRevisar', ilegible: 'qfIlegible' };
  document.getElementById(map[val] ?? 'qfAll').classList.add('active');
  render();
}

function setAnswerFilter(val) {
  answerFilter = val;
  document.querySelectorAll('#answerFilters .qf-btn').forEach(b => b.classList.remove('active'));
  const map = { null: 'qfAnsAll', 'has-answer': 'qfAnsCorrecta', 'has-my': 'qfAnsMiResp', 'sin-resp': 'qfAnsSinResp' };
  document.getElementById(map[val] ?? 'qfAnsAll').classList.add('active');
  render();
}

function toggleSidebarSection(headerEl) {
  headerEl.closest('.sidebar-section').classList.toggle('collapsed');
}

function setAuditorUI(active) {
  auditorMode = active;
  const btn = document.getElementById('auditorBtn');
  btn.classList.toggle('active', active);
  btn.textContent = active ? '🚪 Salir auditor' : '🔑 Auditor';
  document.getElementById('fabNew').classList.toggle('visible', active);
  document.getElementById('ssEstado').classList.toggle('visible', active);
  document.getElementById('ssRespuesta').classList.toggle('visible', active);
  document.getElementById('ssExamen').classList.toggle('visible', active);
  document.getElementById('auditorTools').classList.toggle('visible', active);
  document.getElementById('ssMyProgress').classList.toggle('auditor-active', active);
  if (!active) { closeAuditorTools(); loadMyProgressSummary(); }
  if (mode === 'exam') renderExamSetup();
}

function toggleAuditorTools(e) {
  e.stopPropagation();
  document.getElementById('auditorToolsMenu').classList.toggle('open');
}

function closeAuditorTools() {
  document.getElementById('auditorToolsMenu').classList.remove('open');
}

document.addEventListener('click', (e) => {
  const tools = document.getElementById('auditorTools');
  if (tools && !tools.contains(e.target)) closeAuditorTools();
});

function handleEditClick(qId) {
  openQuestionModal(questions.find(q => q.id === qId));
}

function toggleAuditor() {
  if (!isAdmin) return;
  if (auditorMode) {
    if (!confirm('¿Deseas salir del modo auditor?')) return;
    setAuditorUI(false);
  } else {
    setAuditorUI(true);
  }
  render();
}

// ─── QUESTION EDITOR ──────────────────────────────────────────────────────────

let currentEditId = null;

function openQuestionModal(q = null) {
  currentEditId = q ? q.id : null;
  document.getElementById('qModalTitle').textContent = q ? 'Editar pregunta' : 'Nueva pregunta';
  document.getElementById('qSection').value   = q ? q.section         : '';
  document.getElementById('qQuestion').value  = q ? q.question        : '';
  document.getElementById('qOptA').value       = q ? q.options.A      : '';
  document.getElementById('qOptB').value       = q ? q.options.B      : '';
  document.getElementById('qOptC').value       = q ? q.options.C      : '';
  document.getElementById('qModalError').textContent = '';
  const ans = q ? q.answer : 'A';
  document.querySelector(`input[name="qAnswer"][value="${ans}"]`).checked = true;
  const myAns = q?.my_answer || '';
  document.querySelector(`input[name="qMyAnswer"][value="${myAns}"]`).checked = true;
  const prueba = q?.prueba || '';
  document.querySelector(`input[name="qPrueba"][value="${prueba}"]`).checked = true;
  document.getElementById('qDeleteBtn').style.display = q ? 'flex' : 'none';
  document.getElementById('qModalOverlay').classList.add('visible');
  setTimeout(() => document.getElementById('qSection').focus(), 100);
}

function closeQModal() {
  document.getElementById('qModalOverlay').classList.remove('visible');
}

async function saveQuestion() {
  const section  = document.getElementById('qSection').value.trim();
  const question = document.getElementById('qQuestion').value.trim();
  const optA     = document.getElementById('qOptA').value.trim();
  const optB     = document.getElementById('qOptB').value.trim();
  const optC     = document.getElementById('qOptC').value.trim();
  const answer   = document.querySelector('input[name="qAnswer"]:checked')?.value;
  const errEl    = document.getElementById('qModalError');

  if (!section || !question || !optA || !optB || !optC) {
    errEl.textContent = 'Completa sección, pregunta y las tres opciones.';
    return;
  }

  const myAnswer = document.querySelector('input[name="qMyAnswer"]:checked')?.value || null;
  const prueba   = document.querySelector('input[name="qPrueba"]:checked')?.value   || null;
  const payload  = { section, question, options: { A: optA, B: optB, C: optC }, answer, my_answer: myAnswer || null, prueba: prueba || null };

  if (currentEditId) {
    const { error } = await db.from('preguntas').update(payload).eq('id', currentEditId);
    if (error) { errEl.textContent = 'Error: ' + error.message; return; }
    const idx = questions.findIndex(q => q.id === currentEditId);
    if (idx !== -1) questions[idx] = { ...questions[idx], ...payload };
  } else {
    const { data, error } = await db.from('preguntas').insert(payload).select().single();
    if (error) { errEl.textContent = 'Error: ' + error.message; return; }
    questions.push(data);
    document.getElementById('totalCount').textContent = questions.length;
  }

  const savedQ = questions.find(q => q.id === currentEditId);
  logActivity(currentEditId || (questions.at(-1)?.id),
    currentEditId ? 'Editó pregunta' : 'Creó nueva pregunta',
    payload.question?.substring(0,60));
  closeQModal();
  render();
}

async function deleteQuestion() {
  if (!currentEditId) return;
  if (!confirm('¿Eliminar esta pregunta? Esta acción no se puede deshacer.')) return;
  const q = questions.find(q => q.id === currentEditId);
  const { error } = await db.from('preguntas').delete().eq('id', currentEditId);
  if (error) { document.getElementById('qModalError').textContent = 'Error: ' + error.message; return; }
  logActivity(null, 'Eliminó pregunta', q?.question?.substring(0,60));
  questions = questions.filter(q => q.id !== currentEditId);
  document.getElementById('totalCount').textContent = questions.length;
  closeQModal();
  render();
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 400); }, 4000);
}

async function migrateLocalFlags() {
  const raw = localStorage.getItem('odoo_flags');
  if (!raw) return 0;

  let localFlags;
  try { localFlags = JSON.parse(raw); } catch { localStorage.removeItem('odoo_flags'); return 0; }

  const entries = Object.entries(localFlags).filter(([, v]) => v === 'segura' || v === 'revisar');
  if (!entries.length) { localStorage.removeItem('odoo_flags'); return 0; }

  const seguraIds  = entries.filter(([, v]) => v === 'segura').map(([k]) => parseInt(k));
  const revisarIds = entries.filter(([, v]) => v === 'revisar').map(([k]) => parseInt(k));

  const ops = [];
  if (seguraIds.length)  ops.push(db.from('preguntas').update({ status: 'segura'  }).in('id', seguraIds));
  if (revisarIds.length) ops.push(db.from('preguntas').update({ status: 'revisar' }).in('id', revisarIds));

  const results = await Promise.all(ops);
  const hasError = results.some(r => r.error);
  if (hasError) { console.error('Error migrando flags'); return 0; }

  // Actualizar el array local para que render() los muestre ya
  entries.forEach(([id, status]) => {
    const q = questions.find(q => q.id === parseInt(id));
    if (q) q.status = status;
  });

  localStorage.removeItem('odoo_flags');
  return entries.length;
}

async function setCorrectAnswer(questionId, newAnswer) {
  const q = questions.find(q => q.id === questionId);
  if (!q || q.answer === newAnswer) return;

  const { error } = await db
    .from('preguntas')
    .update({ answer: newAnswer })
    .eq('id', questionId);

  if (error) {
    alert('Error al guardar: ' + error.message);
    return;
  }

  q.answer = newAnswer;
  logActivity(questionId, `Cambió respuesta correcta → ${newAnswer}`, q.question?.substring(0,60));
  render();
}

// ─── DRAG & DROP ──────────────────────────────────────────────────────────────

function onDragStart(e, qId) {
  dragSrcId = qId;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.closest('.q-card').classList.add('dragging'), 0);
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDragEnd() {
  document.querySelectorAll('.dragging, .drag-over').forEach(el =>
    el.classList.remove('dragging', 'drag-over'));
  dragSrcId = null;
}

async function onDrop(e, targetQId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragSrcId || dragSrcId === targetQId) return;

  const srcIdx    = questions.findIndex(q => q.id === dragSrcId);
  const targetIdx = questions.findIndex(q => q.id === targetQId);
  if (srcIdx === -1 || targetIdx === -1) return;

  const [moved] = questions.splice(srcIdx, 1);
  questions.splice(targetIdx, 0, moved);

  // Reasignar sort_order y guardar solo los que cambiaron
  const updates = [];
  questions.forEach((q, i) => {
    const newOrder = i + 1;
    if (q.sort_order !== newOrder) {
      q.sort_order = newOrder;
      updates.push(db.from('preguntas').update({ sort_order: newOrder }).eq('id', q.id));
    }
  });

  render();
  await Promise.all(updates);
}

async function init() {
  questionsList.innerHTML = '<div class="empty"><div class="emoji">⏳</div><p>Cargando preguntas...</p></div>';

  const { data, error } = await db
    .from('preguntas')
    .select('*')
    .order('sort_order', { nullsFirst: false });

  if (error) {
    questionsList.innerHTML = `<div class="empty"><div class="emoji">❌</div><p>Error al cargar: ${error.message}</p></div>`;
    return;
  }

  questions = data;

  const { data: configsData, error: configsError } = await db.from('exam_configs').select('*');
  if (configsError) console.error('[init] Error al cargar exam_configs:', configsError);
  examConfigs = configsData || [];

  const migrated = await migrateLocalFlags();
  if (migrated > 0) showToast(`✅ ${migrated} marcas sincronizadas con la base de datos.`);

  const sections = [...new Set(questions.map(q => q.section))];
  document.getElementById('totalCount').textContent = questions.length;
  document.getElementById('sectionCount').textContent = sections.length;

  const tabs = document.getElementById('sectionTabs');
  const allTab = document.createElement('button');
  allTab.className = 'tab active'; allTab.textContent = 'Todas';
  allTab.onclick = () => filterBySection('all', allTab);
  tabs.appendChild(allTab);

  sections.forEach(s => {
    const count = questions.filter(q => q.section === s).length;
    const t = document.createElement('button');
    t.className = 'tab';
    t.innerHTML = `${s} <span class="tab-count">${count}</span>`;
    t.onclick = () => filterBySection(s, t);
    tabs.appendChild(t);
  });

  document.getElementById('searchInput').addEventListener('input', e => {
    searchTerm = e.target.value.toLowerCase();
    document.getElementById('searchClear').classList.toggle('visible', !!e.target.value);
    render();
  });
  const dl = document.getElementById('sectionList');
  sections.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    dl.appendChild(opt);
  });

  buildPruebaFilters();

  // Poblar selector de prueba en examen
  const examSel = document.getElementById('examPruebaSelect');
  const pruebas = [...new Set(questions.map(q => q.prueba).filter(Boolean))].sort();
  examSel.innerHTML = '<option value="">Todas las preguntas</option>';
  pruebas.forEach(p => {
    const o = document.createElement('option');
    o.value = p; o.textContent = p.replace('prueba', 'Prueba ');
    examSel.appendChild(o);
  });
  examSel.addEventListener('change', updateExamSetupCount);

  if (!auditorMode) loadMyProgressSummary();
  render();
}

function filterBySection(sec, tab) {
  activeSection = sec;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  render();
}

function updateTabs() {
  document.querySelectorAll('.tab').forEach(t => {
    const isAll = t.textContent === 'Todas' && activeSection === 'all';
    t.classList.toggle('active', isAll || t.textContent === activeSection);
  });
}

// Oculta lo que distrae o pone en riesgo el examen de un usuario común:
// - la barra lateral (búsqueda/secciones/módulos), para que no se salga
//   del temario asignado y las preguntas aprovechen todo el ancho;
// - el selector Estudio/Práctica/Examen, porque cambiar de modo a mitad
//   del examen lo aborta sin avisar (setMode reinicia el cronómetro y
//   las respuestas);
// - las estadísticas del banco completo (318 preguntas · 19 secciones…),
//   que no corresponden al examen que está presentando y confunden;
// - el botón de barajar, que reordenaría su pool a mitad de la prueba.
// En el espacio libre se muestra una etiqueta con el examen que está
// presentando (módulo y número de preguntas), para darle contexto sin
// tocar el encabezado general de la página.
// El auditor conserva la vista completa siempre.
function setExamFocusUI(active, label) {
  document.body.classList.toggle('exam-focus-active', active);
  document.querySelector('.sidebar').classList.toggle('exam-focus', active);
  document.querySelector('.mode-toggle').classList.toggle('exam-focus', active);
  document.querySelector('.topbar-stats').classList.toggle('exam-focus', active);

  const shuffleBtn = document.getElementById('shuffleBtn');
  shuffleBtn.style.display = (!active && mode === 'practice') ? 'flex' : 'none';

  const focusLabel = document.getElementById('examFocusLabel');
  focusLabel.textContent = active && label ? label : '';
  focusLabel.classList.toggle('visible', active && !!label);
}

function setMode(m) {
  mode = m;
  clearInterval(examTimer);
  setExamFocusUI(false);

  ['btnStudy','btnPractice','btnExam'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const btnMap = { study:'btnStudy', practice:'btnPractice', exam:'btnExam' };
  const btn = document.getElementById(btnMap[m]);
  if (btn) btn.classList.add('active');

  const badgeMap = { study: '📖 Modo Estudio', practice: '🎯 Modo Práctica', exam: '📋 Examen Oficial' };
  document.getElementById('modeBadge').textContent = badgeMap[m];
  document.getElementById('liveScoreStats').style.display = m === 'study' ? 'none' : 'contents';

  // El examen siempre se presenta en orden aleatorio (shuffleEnabled se
  // fuerza a true en startExam/startModuleExam) — mostrar este control
  // ahí sugeriría una opción que en realidad no se puede cambiar.
  document.getElementById('shuffleBtn').style.display = m === 'practice' ? 'flex' : 'none';
  document.getElementById('examSetup').style.display    = m === 'exam' ? 'block' : 'none';
  document.getElementById('examTimerBar').style.display = 'none';
  document.getElementById('sectionStatsPanel').style.display = 'none';
  // Se limpia aquí incondicionalmente; si el modo es 'exam', renderExamSetup()
  // (más abajo) la vuelve a aplicar según corresponda (auditor vs. usuario común).
  document.body.classList.remove('exam-setup-browse');

  if (m === 'practice') {
    answered = {}; revealed = {}; examSubmitted = false;
    if (shuffleEnabled) shuffledIds = shuffle(questions.map(q => q.id));
    document.getElementById('progressBar').style.display = 'block';
    document.getElementById('scorePanel').classList.remove('visible');
    updateScore();
  } else if (m === 'exam') {
    answered = {}; revealed = {}; examSubmitted = false; examStartTs = null;
    document.getElementById('progressBar').style.display = 'none';
    document.getElementById('scorePanel').classList.remove('visible');
    renderExamSetup();
  } else {
    shuffleEnabled = false;
    document.getElementById('shuffleBtn').classList.remove('active');
    document.getElementById('progressBar').style.display = 'none';
    document.getElementById('scorePanel').classList.remove('visible');
  }

  expandedIds.clear();
  document.querySelectorAll('.q-card').forEach(c => c.classList.remove('expanded'));
  render();
}

function updateScore() {
  const filtered = getFiltered();
  const total = filtered.length;
  const ans  = Object.keys(answered).length;
  const corr = Object.values(answered).filter(v => v).length;
  document.getElementById('answeredCount').textContent = ans;
  document.getElementById('correctCount').textContent  = corr;

  if (mode === 'practice') {
    const pct = total ? Math.round(ans / total * 100) : 0;
    document.getElementById('progressFill').style.width = pct + '%';

    if (ans >= total && total > 0) {
      const score = Math.round(corr / total * 100);
      const panel = document.getElementById('scorePanel');
      const big   = document.getElementById('scoreBig');
      panel.classList.add('visible');
      big.textContent  = score + '%';
      big.className    = 'score-big ' + (score >= 70 ? 'good' : score >= 50 ? 'ok' : 'bad');
      document.getElementById('scoreText').textContent = `${corr} correctas de ${total} · ${score >= 70 ? '✅ Aprobado' : '❌ Reprueba'}`;
      renderSectionStats();
      const duration = Math.round((Date.now() - (examStartTs || Date.now())) / 1000);
      saveSession('practice', '', duration);
    }
  }
}

function getFiltered() {
  return questions.filter(q => {
    const secOk = activeSection === 'all' || q.section === activeSection;
    const searchOk = !searchTerm ||
      q.question.toLowerCase().includes(searchTerm) ||
      Object.values(q.options).some(o => o.toLowerCase().includes(searchTerm));
    const flagOk   = !flagFilter
      ? true
      : flagFilter === 'sin-rev'
        ? getQFlags(q).size === 0
        : getQFlags(q).has(flagFilter);
    const pruebaOk = !pruebaFilter
      ? true
      : pruebaFilter === 'sin' ? !q.prueba
      : pruebaFilter === 'con' ? !!q.prueba
      : q.prueba === pruebaFilter;
    const answerOk = !answerFilter
      ? true
      : answerFilter === 'has-answer' ? !!q.answer
      : answerFilter === 'has-my'     ? !!q.my_answer
      : !q.answer && !q.my_answer;
    return secOk && searchOk && flagOk && pruebaOk && answerOk;
  }).sort((a, b) => {
    if (!shuffleEnabled || shuffledIds.length === 0) return 0;
    const ai = shuffledIds.indexOf(a.id);
    const bi = shuffledIds.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function render() {
  let filtered = getFiltered();
  const list = document.getElementById('questionsList');
  // En examen, "Ver marcadas" acota la vista a las preguntas que el
  // usuario marcó con 🚩, sin alterar las estadísticas del examen
  // completo (esas siguen usando getFiltered() sin esta restricción).
  if (mode === 'exam' && examFlagFilterActive && !examSubmitted) {
    filtered = filtered.filter(q => examFlagged.has(questions.indexOf(q)));
  }
  document.getElementById('resultCount').innerHTML =
    `Mostrando <span>${filtered.length}</span> de <span>${questions.length}</span> preguntas`;

  const hf = f => questions.filter(q => getQFlags(q).has(f)).length;
  document.getElementById('qfAllCount').textContent     = questions.length ? `(${questions.length})` : '';
  document.getElementById('qfSinRevCount').textContent   = questions.filter(q => getQFlags(q).size === 0).length;
  document.getElementById('qfSeguraCount').textContent   = hf('segura');
  document.getElementById('qfRevisarCount').textContent  = hf('revisar');
  document.getElementById('qfIlegibleCount').textContent = hf('ilegible');

  document.getElementById('qfAnsAllCount').textContent      = questions.length ? `(${questions.length})` : '';
  document.getElementById('qfAnsCorrectaCount').textContent = questions.filter(q => !!q.answer).length;
  document.getElementById('qfAnsMiRespCount').textContent   = questions.filter(q => !!q.my_answer).length;
  document.getElementById('qfAnsSinRespCount').textContent  = questions.filter(q => !q.answer && !q.my_answer).length;

  const pruebas = [...new Set(questions.map(q => q.prueba).filter(Boolean))];
  pruebas.forEach(p => {
    const el = document.getElementById(`pfCount_${p}`);
    if (el) el.textContent = questions.filter(q => q.prueba === p).length;
  });
  const conEl = document.getElementById('pfCount_con');
  if (conEl) conEl.textContent = questions.filter(q => !!q.prueba).length;
  const sinEl = document.getElementById('pfCount_sin');
  if (sinEl) sinEl.textContent = questions.filter(q => !q.prueba).length;

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty"><div class="emoji">🔍</div><p>No se encontraron preguntas.</p></div>';
    return;
  }

  list.innerHTML = '';
  filtered.forEach((q, fi) => {
    const globalIdx = questions.indexOf(q);
    const qFlags = getQFlags(q);
    const card = document.createElement('div');
    const flagCls = auditorMode ? [...qFlags].map(f => `flag-${f}`).join(' ') : '';
    card.className = ['q-card', mode === 'practice' ? 'practice-mode' : '', flagCls].filter(Boolean).join(' ');
    card.dataset.qid = q.id;

    const optKeys = Object.keys(q.options);
    let optHtml = '';
    optKeys.forEach(key => {
      const isCorrect = key === q.answer;
      const wasAnswered = answered[globalIdx] !== undefined;
      const wasSelected = revealed[globalIdx] === key;

      const isMyAnswer   = auditorMode && mode === 'study' && q.my_answer === key;
      const examRevealed = mode === 'exam' && examSubmitted;

      let cls = 'option';
      if (mode === 'study' && isCorrect)    cls += ' correct';
      if (mode === 'study' && isMyAnswer && auditorMode) cls += ' my-answer';
      if (auditorMode && mode === 'study')  cls += ' auditor-option';
      if ((mode === 'practice' || examRevealed) && wasAnswered) {
        if (wasSelected && isCorrect)       cls += ' selected-correct';
        else if (wasSelected && !isCorrect) cls += ' selected-wrong';
        else if (isCorrect)                 cls += ' correct';
      }
      if (mode === 'exam' && !examSubmitted && examStartTs && !wasSelected) cls += ' exam-option';
      if (mode === 'exam' && !examSubmitted && examStartTs && wasSelected)  cls += ' exam-selected';

      let rightHtml = '';

      if (auditorMode && mode === 'study') {
        rightHtml = `<div class="opt-actions">
          ${isCorrect
            ? `<span class="correct-badge">✓ Correcta</span>`
            : `<button class="set-correct-btn" onclick="event.stopPropagation(); setCorrectAnswer(${q.id}, '${key}')">✓ Correcta</button>`}
          <button class="set-my-btn ${q.my_answer === key ? 'active' : ''}" onclick="event.stopPropagation(); setMyAnswer(${q.id}, '${key}', event)">📌 Mi resp.</button>
        </div>`;
      } else if (mode === 'study') {
        const badges = [];
        if (isCorrect) {
          badges.push('<span class="correct-badge">✓ Correcta</span>');
        }
        if (isMyAnswer && auditorMode) {
          badges.push('<span class="my-answer-badge">📌 Mi resp.</span>');
        }
        if (badges.length) rightHtml = `<div class="opt-actions">${badges.join('')}</div>`;
      }

      optHtml += `
        <div class="${cls}" onclick="selectOption(${globalIdx}, '${key}', this)">
          <div class="opt-letter">${key}</div>
          <div class="opt-text">${q.options[key]}</div>
          ${rightHtml}
        </div>`;
    });

    if (auditorMode) {
      card.setAttribute('ondragover',  'onDragOver(event)');
      card.setAttribute('ondragleave', 'onDragLeave(event)');
      card.setAttribute('ondrop',      `onDrop(event, ${q.id})`);
      card.setAttribute('ondragend',   'onDragEnd()');
    }

    card.innerHTML = `
      <div class="q-header" onclick="toggleCard(this.parentElement)">
        ${auditorMode ? `<div class="drag-handle" draggable="true" ondragstart="onDragStart(event, ${q.id})" onclick="event.stopPropagation()" title="Arrastrar para reordenar">⠿</div>` : ''}
        <div class="q-num">${fi + 1}</div>
        <div class="q-meta">
          <div class="q-section">
            ${auditorMode
              ? `<span class="section-label editable" title="Clic para editar sección" onclick="event.stopPropagation(); editSection(${q.id}, this)">${q.section}</span>`
              : q.section}
            ${auditorMode && q.prueba ? `<span class="prueba-tag ${q.prueba}">${q.prueba.replace('prueba','Prueba ')}</span>` : ''}
            ${auditorMode && q.modified_by ? `<span class="modified-by-badge" title="${q.modified_by} · ${timeAgo(q.modified_at)}">${getInitials(q.modified_by)}</span>` : ''}
          </div>
          <div class="q-text">${q.question}</div>
        </div>
        <div class="flag-btns">
          ${auditorMode ? `
          <span class="flag-cluster" title="Estado de la pregunta">
            <button class="flag-btn ${qFlags.has('segura') ? 'active' : ''}" title="Segura" onclick="setFlag(${q.id}, 'segura', event)">✅</button>
            <button class="flag-btn ${qFlags.has('revisar') ? 'active' : ''}" title="A revisar" onclick="setFlag(${q.id}, 'revisar', event)">🔍</button>
            <button class="flag-btn ilegible-btn ${qFlags.has('ilegible') ? 'active' : ''}" title="Ilegible" onclick="setFlag(${q.id}, 'ilegible', event)">⚠️</button>
          </span>
          <span class="flag-cluster" title="Prueba asignada">
          ${[...new Set(questions.map(r => r.prueba).filter(Boolean))].sort().map((p,i) => {
              const label = 'P'+(i+1);
              const cls   = `pcolor-${i+1}`;
              return `<button class="flag-btn prueba-btn ${q.prueba === p ? `active ${cls}` : ''}" title="${p.replace('prueba','Prueba ')}" onclick="event.stopPropagation(); setPrueba(${q.id}, '${p}', event)">${label}</button>`;
            }).join('')}
          </span>
          <span class="flag-divider"></span>
          <button class="flag-btn edit-btn" title="Editar pregunta" onclick="event.stopPropagation(); handleEditClick(${q.id})">✏️</button>
          ` : ''}
          ${mode === 'exam' && !examSubmitted && examStartTs
            ? `<button class="flag-btn exam-flag-btn ${examFlagged.has(globalIdx) ? 'flagged' : ''}" title="Marcar para revisión" onclick="event.stopPropagation(); toggleExamFlag(${globalIdx})">🚩</button>`
            : ''}
        </div>
        <div class="q-toggle">▾</div>
      </div>
      <div class="q-body">
        <div class="options-list">${optHtml}</div>
        ${mode === 'exam' && examSubmitted && examFlagged.has(globalIdx)
          ? '<div class="exam-flagged-badge">🚩 Marcada para revisión</div>'
          : ''}
      </div>`;

    if (expandedIds.has(q.id)) card.classList.add('expanded');
    list.appendChild(card);
  });
}

function highlight(text, term) {
  if (!term || term.length < 2) return text;
  const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(re, '<mark>$1</mark>');
}

function toggleCard(card) {
  const wasExpanded = card.classList.contains('expanded');
  document.querySelectorAll('.q-card.expanded').forEach(c => {
    expandedIds.delete(+c.dataset.qid);
    c.classList.remove('expanded');
  });
  if (!wasExpanded) {
    card.classList.add('expanded');
    expandedIds.add(+card.dataset.qid);
    setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }
}

function selectOption(idx, key, el) {
  if (mode !== 'practice' && !(mode === 'exam' && !examSubmitted && examStartTs)) return;
  if (answered[idx] !== undefined && mode !== 'exam') return;
  if (mode === 'exam' && examSubmitted) return;

  const q = questions[idx];
  const isCorrect = key === q.answer;
  answered[idx] = isCorrect;
  revealed[idx] = key;

  const card = el.closest('.q-card');
  const optEls = card.querySelectorAll('.option');
  const optKeys = Object.keys(q.options);

  if (mode === 'exam') {
    optEls.forEach((opt, i) => {
      opt.classList.remove('exam-selected');
      opt.classList.add('exam-option');
      if (optKeys[i] === key) {
        opt.classList.add('exam-selected');
        opt.classList.remove('exam-option');
      }
    });
    updateExamProgress();
  } else {
    optEls.forEach((opt, i) => {
      const optKey = optKeys[i];
      opt.classList.remove('selected-correct', 'selected-wrong', 'correct');
      if (optKey === key && isCorrect) opt.classList.add('selected-correct');
      else if (optKey === key && !isCorrect) opt.classList.add('selected-wrong');
      else if (optKey === q.answer) opt.classList.add('correct');
    });
    updateScore();
  }
}

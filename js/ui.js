/* ═══════════════════════════════════════════════════════
   AzNetMove — UI Helpers
   ═══════════════════════════════════════════════════════ */

const UI = (() => {

  /* ── XP BAR ── */
  function refreshXPBar() {
    const lvl = State.getLevel();
    document.getElementById('xp-count').textContent = `${lvl.xpInLevel} / ${lvl.xpNeeded}`;
    document.getElementById('xp-bar').style.width = lvl.progress + '%';
    document.getElementById('level-num').textContent = lvl.level;
    document.getElementById('level-title').textContent = lvl.title;
  }

  /* ── FLOAT XP LABEL ── */
  function floatXP(amount, x, y) {
    const el = document.createElement('div');
    el.className = 'xp-rise';
    el.textContent = `+${amount} XP`;
    el.style.left = (x || window.innerWidth / 2) + 'px';
    el.style.top  = (y || window.innerHeight / 2) + 'px';
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  /* ── AWARD XP ── */
  function awardXP(amount, sourceEl) {
    const { after } = State.addXP(amount);
    refreshXPBar();
    const rect = sourceEl ? sourceEl.getBoundingClientRect() : null;
    floatXP(amount, rect ? rect.left + rect.width / 2 : null, rect ? rect.top : null);
    return after;
  }

  /* ── SCORE POPUP ── */
  function showScore({ emoji, title, sub, xp, onNext }) {
    // Remove existing
    const old = document.getElementById('score-popup');
    if (old) old.remove();
    const oldOv = document.getElementById('score-overlay');
    if (oldOv) oldOv.remove();

    const overlay = document.createElement('div');
    overlay.id = 'score-overlay';
    overlay.className = 'score-popup-overlay';

    const popup = document.createElement('div');
    popup.id = 'score-popup';
    popup.className = 'score-popup';
    popup.innerHTML = `
      <div class="score-emoji">${emoji}</div>
      <div class="score-title">${title}</div>
      <div class="score-sub">${sub}</div>
      <div class="score-xp">+${xp} XP earned!</div>
      <button class="btn btn-primary" id="score-next">Continue →</button>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    requestAnimationFrame(() => {
      overlay.classList.add('show');
      popup.classList.add('show');
    });

    const close = () => {
      overlay.classList.remove('show');
      popup.classList.remove('show');
      setTimeout(() => { overlay.remove(); popup.remove(); }, 300);
      if (onNext) onNext();
    };

    document.getElementById('score-next').addEventListener('click', close);
    overlay.addEventListener('click', close);
  }

  /* ── TABS ── */
  function initTabs(container) {
    const tabs = container.querySelectorAll('.tab');
    const panels = container.querySelectorAll('.tab-panel');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const target = container.querySelector('#panel-' + tab.dataset.tab);
        if (target) target.classList.add('active');
      });
    });
  }

  /* ── NAV BADGES ── */
  function updateBadge(moduleId) {
    const badge = document.getElementById('badge-' + moduleId);
    if (badge) { badge.textContent = '✓'; badge.classList.add('show'); }
  }

  function refreshBadges() {
    const s = State.get();
    s.completedModules.forEach(id => updateBadge(id));
  }

  /* ── MODULE CONTAINER ANIMATION ── */
  function render(html) {
    const container = document.getElementById('module-container');
    container.innerHTML = html;
    container.classList.remove('fade-in');
    void container.offsetWidth;
    container.classList.add('fade-in');
    return container;
  }

  /* ── QUIZ BUILDER ── */
  function buildQuiz({ id, questions, xpPerQuestion, moduleId, onComplete }) {
    let current = 0;
    let score = 0;
    const answers = new Array(questions.length).fill(null);

    function renderQ(idx) {
      const q = questions[idx];
      const panel = document.getElementById(id);
      panel.innerHTML = `
        <div class="quiz-question">${q.question}</div>
        <div class="quiz-options">
          ${q.options.map((o, i) => `
            <button class="quiz-opt" data-idx="${i}">
              <span class="opt-letter">${'ABCD'[i]}</span>
              <span>${o}</span>
            </button>
          `).join('')}
        </div>
        <div class="quiz-feedback" id="qfb-${idx}"></div>
        <div class="quiz-nav">
          <div>
            <div class="quiz-dots">${questions.map((_, i) =>
              `<div class="quiz-dot ${i < idx ? 'done' : i === idx ? 'active' : ''}"></div>`
            ).join('')}</div>
            <div class="quiz-progress">Question ${idx + 1} of ${questions.length}</div>
          </div>
          <button class="btn btn-primary" id="q-next" style="display:none">
            ${idx < questions.length - 1 ? 'Next →' : 'See Results'}
          </button>
        </div>
      `;

      panel.querySelectorAll('.quiz-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          const chosen = parseInt(btn.dataset.idx);
          const correct = q.correct;
          panel.querySelectorAll('.quiz-opt').forEach(b => b.disabled = true);
          const fb = document.getElementById(`qfb-${idx}`);
          fb.classList.add('show');

          if (chosen === correct) {
            btn.classList.add('correct');
            btn.querySelector('.opt-letter').textContent = '✓';
            fb.classList.add('ok');
            fb.innerHTML = `<strong>✓ Correct!</strong> ${q.explanation}`;
            score++;
            answers[idx] = true;
            awardXP(xpPerQuestion, btn);
          } else {
            btn.classList.add('wrong');
            btn.querySelector('.opt-letter').textContent = '✗';
            panel.querySelectorAll('.quiz-opt')[correct].classList.add('correct');
            fb.classList.add('bad');
            fb.innerHTML = `<strong>✗ Not quite.</strong> ${q.explanation}`;
            answers[idx] = false;
          }

          document.getElementById('q-next').style.display = 'inline-flex';
          document.getElementById('q-next').addEventListener('click', () => {
            if (idx < questions.length - 1) {
              current++;
              renderQ(current);
            } else {
              showResults();
            }
          });
        });
      });
    }

    function showResults() {
      const pct = Math.round((score / questions.length) * 100);
      const passed = pct >= 60;
      const panel = document.getElementById(id);
      panel.innerHTML = `
        <div style="text-align:center;padding:32px 0">
          <div style="font-size:56px;margin-bottom:12px">${passed ? '🎉' : '💪'}</div>
          <div style="font-size:24px;font-weight:700;margin-bottom:8px">
            ${score} / ${questions.length} correct — ${pct}%
          </div>
          <div style="color:var(--text-sub);margin-bottom:20px">
            ${passed ? 'Great work! Module knowledge confirmed.' : 'Keep going — review the concepts and try again!'}
          </div>
          <button class="btn btn-secondary" onclick="location.reload()">↩ Restart Quiz</button>
        </div>
      `;
      if (passed && onComplete) onComplete(score, questions.length);
    }

    renderQ(0);
  }

  return { refreshXPBar, awardXP, floatXP, showScore, initTabs, updateBadge, refreshBadges, render, buildQuiz };
})();

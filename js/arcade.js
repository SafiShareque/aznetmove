/* ═══════════════════════════════════════════════════════
   AzNetMove — Arcade engine
   60-second rapid-fire rounds: 3 lives, streak multiplier,
   saved high score. Decks supply cards via next().
   ═══════════════════════════════════════════════════════ */

const Arcade = (() => {

  const ROUND_SECONDS = 60;
  const LIVES = 3;
  const XP_CAP = 60;   // max XP a single deck can ever pay out

  function multiplier(streak) {
    return streak >= 10 ? 4 : streak >= 6 ? 3 : streak >= 3 ? 2 : 1;
  }

  function mount(el, deck) {
    const bestKey = 'arcade-' + deck.id;
    let timer = null;

    el.innerHTML = `<div class="arcade"><div class="arcade-screen"></div></div>`;
    const screen = el.querySelector('.arcade-screen');

    function startScreen() {
      const best = State.getBest(bestKey);
      screen.innerHTML = `
        <div class="arcade-splash">
          <div class="arcade-logo">${deck.icon}</div>
          <div class="arcade-name">${deck.title}</div>
          <div class="arcade-howto">${deck.howto}</div>
          <div class="arcade-rules">
            <span>⏱ ${ROUND_SECONDS}s</span><span>❤️ ${LIVES} lives</span><span>🔥 Streaks up to ×4</span>
          </div>
          ${best ? `<div class="arcade-best">🏆 Best: ${best}</div>` : ''}
          <button type="button" class="arcade-start">▶ Start</button>
          <div class="arcade-keys">Keyboard: press 1–${deck.maxOptions || 4} to answer</div>
        </div>`;
      screen.querySelector('.arcade-start').addEventListener('click', play);
    }

    function play() {
      let lives = LIVES, score = 0, streak = 0, answered = 0, correct = 0;
      let timeLeft = ROUND_SECONDS * 10;   // tenths of a second
      let paused = false;
      let card = null;
      let recent = [];

      screen.innerHTML = `
        <div class="arcade-hud">
          <span class="arcade-lives"></span>
          <span class="arcade-streak"></span>
          <span class="arcade-score">0</span>
        </div>
        <div class="arcade-timer"><div class="arcade-timer-fill"></div></div>
        ${deck.context ? `<details class="arcade-context" open><summary>${deck.contextTitle || 'Reference'}</summary>${deck.context}</details>` : ''}
        <div class="arcade-card"></div>
        <div class="arcade-options"></div>
        <div class="arcade-why"></div>`;
      const $ = s => screen.querySelector(s);

      function hud() {
        $('.arcade-lives').textContent = '❤️'.repeat(lives) + '🖤'.repeat(LIVES - lives);
        const m = multiplier(streak);
        $('.arcade-streak').innerHTML = streak >= 3 ? `🔥 ${streak} <b>×${m}</b>` : '';
        $('.arcade-score').textContent = score;
      }

      function nextCard() {
        // Avoid showing the same prompt twice in a row (or recently)
        for (let i = 0; i < 8; i++) {
          card = deck.next();
          if (!recent.includes(card.q)) break;
        }
        recent = [card.q, ...recent].slice(0, 6);
        const c = $('.arcade-card');
        c.innerHTML = card.q;
        c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
        $('.arcade-why').innerHTML = '';
        $('.arcade-options').innerHTML = card.options.map((o, i) =>
          `<button type="button" class="arcade-opt" data-i="${i}"><span class="arcade-key">${i + 1}</span>${o}</button>`).join('');
      }

      function answer(i) {
        if (paused || !card) return;
        answered++;
        const btns = screen.querySelectorAll('.arcade-opt');
        btns.forEach(b => b.disabled = true);
        if (i === card.a) {
          correct++;
          streak++;
          const gained = 10 * multiplier(streak);
          score += gained;
          btns[i].classList.add('right');
          const pop = document.createElement('div');
          pop.className = 'arcade-plus';
          pop.textContent = '+' + gained;
          btns[i].appendChild(pop);
          hud();
          paused = true;
          setTimeout(() => { paused = false; if (el.isConnected && timer) nextCard(); }, 380);
        } else {
          lives--;
          streak = 0;
          btns[i].classList.add('wrong');
          btns[card.a].classList.add('right');
          const box = el.querySelector('.arcade');
          box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
          hud();
          paused = true;
          $('.arcade-why').innerHTML = `<div>✗ ${card.why || ''}</div><button type="button" class="arcade-continue">${lives > 0 ? 'Continue ›' : 'See score ›'}</button>`;
          $('.arcade-continue').addEventListener('click', () => {
            paused = false;
            if (lives <= 0) end(); else nextCard();
          });
        }
      }

      screen.querySelector('.arcade-options').addEventListener('click', e => {
        const b = e.target.closest('.arcade-opt');
        if (b && !b.disabled) answer(+b.dataset.i);
      });

      function onKey(e) {
        if (!el.isConnected) return document.removeEventListener('keydown', onKey);
        if (e.target.matches && e.target.matches('input, select, textarea')) return;
        const n = parseInt(e.key, 10);
        if (n >= 1 && card && n <= card.options.length) { e.preventDefault(); answer(n - 1); }
        else if ((e.key === 'Enter' || e.key === ' ') && paused) { const c = screen.querySelector('.arcade-continue'); if (c) { e.preventDefault(); c.click(); } }
      }
      document.addEventListener('keydown', onKey);

      function end() {
        clearInterval(timer);
        timer = null;
        document.removeEventListener('keydown', onKey);
        const prevBest = State.getBest(bestKey);
        const isBest = score > prevBest;
        if (isBest) State.setBest(bestKey, score);
        // XP: 1 per 10 points of your best-ever score, capped per deck
        const xp = Math.max(0, Math.min(XP_CAP, Math.floor(score / 10)) - Math.min(XP_CAP, Math.floor(prevBest / 10)));
        const acc = answered ? Math.round(correct / answered * 100) : 0;
        screen.innerHTML = `
          <div class="arcade-splash">
            <div class="arcade-logo">${lives > 0 ? '⏱' : '💥'}</div>
            <div class="arcade-name">${lives > 0 ? "Time's up!" : 'Out of lives!'}</div>
            <div class="arcade-final">${score}</div>
            ${isBest ? '<div class="arcade-best new">🏆 New high score!</div>' : `<div class="arcade-best">🏆 Best: ${prevBest}</div>`}
            <div class="arcade-rules"><span>✓ ${correct} correct</span><span>🎯 ${acc}% accuracy</span></div>
            ${xp ? `<div class="arcade-xp">+${xp} XP</div>` : `<div class="arcade-hint">${Math.floor(prevBest / 10) >= XP_CAP ? 'XP maxed for this game — play for the high score!' : 'Beat your best score to earn more XP.'}</div>`}
            <button type="button" class="arcade-start">↻ Play again</button>
          </div>`;
        if (xp) UI.awardXP(xp, screen.querySelector('.arcade-final'));
        screen.querySelector('.arcade-start').addEventListener('click', play);
      }

      hud();
      nextCard();
      el.querySelector('.arcade').scrollIntoView({ block: 'start', behavior: 'smooth' });
      timer = setInterval(() => {
        if (!el.isConnected) { clearInterval(timer); timer = null; document.removeEventListener('keydown', onKey); return; }
        if (paused) return;
        timeLeft--;
        const fill = $('.arcade-timer-fill');
        fill.style.width = (timeLeft / (ROUND_SECONDS * 10) * 100) + '%';
        fill.classList.toggle('low', timeLeft <= 100);
        if (timeLeft <= 0) end();
      }, 100);
    }

    startScreen();
  }

  /* ── Helpers for decks ── */
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  function shuffleOptions(correct, wrongs) {
    const options = [correct, ...wrongs].sort(() => Math.random() - .5);
    return { options, a: options.indexOf(correct) };
  }
  // Cycle through a fixed card list in random order, reshuffling when exhausted
  function cycle(cards) {
    let bag = [];
    return () => {
      if (!bag.length) bag = [...cards].sort(() => Math.random() - .5);
      return bag.pop();
    };
  }

  return { mount, pick, rand, shuffleOptions, cycle };
})();

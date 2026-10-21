/* ═══════════════════════════════════════════════════════
   AzNetMove — State Manager (localStorage)
   ═══════════════════════════════════════════════════════ */

const LEVELS = [
  { xp: 0,    title: 'Trainee',         icon: '🌱' },
  { xp: 100,  title: 'IP Explorer',     icon: '🔢' },
  { xp: 250,  title: 'VNet Builder',    icon: '🏗️' },
  { xp: 450,  title: 'NSG Guardian',    icon: '🛡️' },
  { xp: 700,  title: 'Route Master',    icon: '🗺️' },
  { xp: 1000, title: 'Network Architect', icon: '⚙️' },
  { xp: 1400, title: 'Firewall Wizard', icon: '🔥' },
  { xp: 1900, title: 'Traffic Engineer', icon: '🚦' },
  { xp: 2500, title: 'Endpoint Expert', icon: '🔌' },
  { xp: 3200, title: 'DNS Sage',        icon: '🌐' },
  { xp: 4000, title: 'Azure Architect', icon: '⬡' },
];

const DEFAULT_STATE = {
  xp: 0,
  completedModules: [],
  moduleScores: {},
  lastModule: 'welcome',
};

const State = (() => {
  const KEY = 'aznetmove_state';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { ...DEFAULT_STATE };
    } catch { return { ...DEFAULT_STATE }; }
  }

  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  }

  let _state = load();

  function get() { return _state; }

  function addXP(amount) {
    const before = _state.xp;
    _state.xp += amount;
    save(_state);
    return { before, after: _state.xp, gained: amount };
  }

  function completeModule(id, score) {
    if (!_state.completedModules.includes(id)) {
      _state.completedModules.push(id);
    }
    _state.moduleScores[id] = Math.max(_state.moduleScores[id] || 0, score);
    _state.lastModule = id;
    save(_state);
  }

  function isCompleted(id) {
    return _state.completedModules.includes(id);
  }

  function getLevel(xp = _state.xp) {
    let level = 0;
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (xp >= LEVELS[i].xp) { level = i; break; }
    }
    const current = LEVELS[level];
    const next = LEVELS[level + 1];
    const xpInLevel = xp - current.xp;
    const xpNeeded = next ? next.xp - current.xp : 1000;
    const progress = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));
    return { level: level + 1, title: current.title, icon: current.icon, progress, xpInLevel, xpNeeded, xp };
  }

  function reset() {
    _state = { ...DEFAULT_STATE };
    save(_state);
  }

  return { get, addXP, completeModule, isCompleted, getLevel, reset, LEVELS };
})();

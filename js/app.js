/* ═══════════════════════════════════════════════════════
   App Router — Azure Networking Learning Platform
   ═══════════════════════════════════════════════════════ */

const MODULES = {
  welcome:   WelcomeModule,
  ip:        IPModule,
  vnet:      VNetModule,
  nsg:       NSGModule,
  routing:   RoutingModule,
  netgroups: NetGroupsModule,
  firewall:  FirewallModule,
  traffic:   TrafficModule,
  endpoints: EndpointsModule,
  dns:       DnsModule,
};

let currentModule = null;

function loadModule(id) {
  const mod = MODULES[id];
  if (!mod) return;

  currentModule = id;
  State.get().lastModule = id;
  localStorage.setItem('aznetmove_state', JSON.stringify(State.get()));

  // Render HTML into container
  const container = document.getElementById('module-container');
  UI.render(mod.render());
  document.getElementById('content').scrollTop = 0;
  window.scrollTo(0, 0);

  // Mount event listeners after DOM update
  requestAnimationFrame(() => {
    mod.mount(container);
  });

  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-module="${id}"]`);
  if (activeNav) {
    activeNav.classList.add('active');
    // Scroll sidebar to keep active item visible
    activeNav.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Close mobile sidebar if open
  document.getElementById('sidebar').classList.remove('open');
}

function init() {
  // Restore XP bar from saved state
  UI.refreshXPBar();
  UI.refreshBadges();

  // Nav click handlers
  document.querySelectorAll('.nav-item[data-module]').forEach(item => {
    item.addEventListener('click', () => {
      loadModule(item.dataset.module);
    });
  });

  // Welcome module card clicks (emitted as nav clicks)
  document.addEventListener('click', e => {
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      loadModule(goto.dataset.goto);
    }
  });

  // Mobile hamburger
  const ham = document.getElementById('hamburger');
  if (ham) {
    ham.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
  }

  // Reset progress button
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Reset all progress and XP? This cannot be undone.')) {
        State.reset();
        UI.refreshXPBar();
        UI.refreshBadges();
        // Clear all badge text
        document.querySelectorAll('.nav-badge').forEach(b => { b.textContent = ''; b.classList.remove('show'); });
        loadModule('welcome');
      }
    });
  }

  // Load last visited module or welcome
  const saved = State.get().lastModule || 'welcome';
  loadModule(saved);
}

// Boot when DOM is ready
document.addEventListener('DOMContentLoaded', init);

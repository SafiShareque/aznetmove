/* ═══════════════════════════════════════════════════════
   AzNetMove — adds the Portal Lab and Arcade tabs to a module
   ═══════════════════════════════════════════════════════ */

const Extras = (() => {

  function addTab(container, key, label, mountFn) {
    const bar = container.querySelector('.tab-bar');
    const panels = container.querySelectorAll('.tab-panel');
    if (!bar || !panels.length) return;
    bar.insertAdjacentHTML('beforeend', `<div class="tab" data-tab="${key}">${label}</div>`);
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.id = 'panel-' + key;
    panel.innerHTML = '<div></div>';
    panels[panels.length - 1].after(panel);
    mountFn(panel.firstElementChild);
  }

  // Called right after a module renders, before its mount() wires up the tabs
  function inject(container, moduleId) {
    const sc = PORTAL_SCENARIOS[moduleId];
    const deck = ARCADE_DECKS[moduleId];
    if (sc) addTab(container, 'portal', '☁️ Portal Lab', el => Portal.mount(el, sc));
    if (deck) addTab(container, 'arcade', '⚡ Arcade', el => Arcade.mount(el, deck));
  }

  return { inject };
})();

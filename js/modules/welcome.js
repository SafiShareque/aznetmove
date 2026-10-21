/* ═══════════════════════════════════════════════════════
   Module: Welcome
   ═══════════════════════════════════════════════════════ */

const WelcomeModule = (() => {

  const MODULES_INFO = [
    { id: 'ip',        icon: '🔢', title: 'IP Addresses & CIDR',          desc: 'Every device needs an address. Learn how IPs and subnet masks work in Azure.' },
    { id: 'vnet',      icon: '🏗️', title: 'VNet & Subnets',               desc: 'Your private network in the cloud — isolation, peering, and hub-spoke design.' },
    { id: 'nsg',       icon: '🛡️', title: 'NSG & Security Rules',         desc: 'Traffic police for your subnets. Inbound/outbound rules, priorities, and stateful tracking.' },
    { id: 'routing',   icon: '🗺️', title: 'Routing & UDR',                desc: 'How packets find their path — system routes vs. custom routes and route tables.' },
    { id: 'netgroups', icon: '🔗', title: 'Network Groups',                desc: 'Manage hundreds of VNets at scale with Azure Virtual Network Manager.' },
    { id: 'firewall',  icon: '🔥', title: 'Azure Firewall',                desc: 'Centralised L7 firewall with FQDN rules, SNAT, and threat intelligence.' },
    { id: 'traffic',   icon: '🚦', title: 'Traffic Flow Management',       desc: 'System routes, BGP, ECMP — how traffic actually moves through your topology.' },
    { id: 'endpoints', icon: '🔌', title: 'Private & Service Endpoints',   desc: 'Keep traffic off the internet — private IPs for Azure services inside your VNet.' },
    { id: 'dns',       icon: '🌐', title: 'DNS & Private Zones',           desc: 'Name resolution for Private Endpoints and custom domains inside Azure.' },
  ];

  function render() {
    const state = State.get();
    const completed = state.completedModules.length;
    const totalXP = state.xp;
    const lvl = State.getLevel();

    return `
      <div class="welcome-hero fade-in">
        <h1>Welcome to AzNetMove 🔷</h1>
        <p>Your hands-on lab for Azure Networking — built around a real Cloudera → Azure migration.
           Learn each concept in depth with analogies, then reinforce it through an interactive game.</p>
        <div class="hero-meta">
          <span>📚 9 Modules</span>
          <span>🎮 9 Games</span>
          <span>⭐ ${completed} Completed</span>
          <span>${lvl.icon} Level ${lvl.level} — ${lvl.title}</span>
        </div>
      </div>

      <div class="card fade-in" style="margin-bottom:20px">
        <h3>🏗️ Your Architecture Context</h3>
        <p style="color:var(--text-sub);margin-bottom:16px">
          Everything in this platform connects to a real migration: moving a <strong>Cloudera CDP platform</strong>
          to <strong>Azure</strong>. As you learn each concept, you'll see how it fits into this actual design.
        </p>
        <div class="diagram" style="font-family:monospace;font-size:13px;line-height:2">
          <div style="text-align:center;margin-bottom:8px;font-weight:700;color:var(--blue)">Hub-Spoke VNet Topology</div>
          <div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap">
            <div style="text-align:center">
              <div style="background:#1b1a19;color:#fff;padding:10px 20px;border-radius:8px;font-weight:700">
                🔷 Hub VNet<br><span style="font-size:11px;color:#6ecbf5">10.0.0.0/16</span><br>
                <span style="font-size:11px;color:rgba(255,255,255,.5)">Firewall · Bastion · Gateway · DNS</span>
              </div>
            </div>
          </div>
          <div style="display:flex;justify-content:center;gap:6px;margin:6px 0;color:var(--text-muted)">
            ──── VNet Peering ────
          </div>
          <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap">
            ${[
              ['🟢 Data Spoke','10.1.0.0/16','ADLS · Event Hubs · Key Vault','#dff6dd','#004b1c'],
              ['🔵 Compute Spoke','10.2.0.0/16','Databricks · AKS · ADF · Synapse','#deecf9','#003d6b'],
              ['🟠 Mgmt Spoke','10.3.0.0/16','DevOps · Monitor · Purview','#fff4ce','#5c3d00'],
            ].map(([name, cidr, svc, bg, color]) => `
              <div style="background:${bg};color:${color};padding:10px 16px;border-radius:8px;text-align:center;font-weight:700;min-width:160px">
                ${name}<br><span style="font-size:11px">${cidr}</span><br>
                <span style="font-size:11px;opacity:.8">${svc}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div style="font-size:17px;font-weight:700;margin-bottom:14px">📚 Learning Modules</div>
      <div class="grid-3">
        ${MODULES_INFO.map(m => {
          const done = state.completedModules.includes(m.id);
          return `
            <div class="module-card" data-goto="${m.id}">
              <div class="module-card-icon">${m.icon}</div>
              <div class="module-card-title">${m.title}</div>
              <div class="module-card-desc">${m.desc}</div>
              ${done
                ? `<span class="module-card-status status-done">✓ Done</span>`
                : `<span class="module-card-status status-new">New</span>`
              }
            </div>
          `;
        }).join('')}
      </div>

      <div class="card" style="margin-top:24px;background:#f8f8f8">
        <h4>HOW IT WORKS</h4>
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:8px">
          ${[
            ['📖 Learn','Read the concept explained with real-life analogies and architecture examples.'],
            ['🎮 Play','Complete an interactive game — quiz, drag-drop, or simulator.'],
            ['⭐ Level Up','Earn XP with each game. Unlock new titles as you progress.'],
          ].map(([t, d]) => `
            <div style="flex:1;min-width:160px">
              <div style="font-weight:700;margin-bottom:4px">${t}</div>
              <div style="font-size:13px;color:var(--text-sub)">${d}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function mount(container) {
    container.querySelectorAll('[data-goto]').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.goto;
        const navItem = document.querySelector(`.nav-item[data-module="${id}"]`);
        if (navItem) navItem.click();
      });
    });
  }

  return { render, mount };
})();

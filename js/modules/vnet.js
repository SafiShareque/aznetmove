/* ═══════════════════════════════════════════════════════
   Module: VNet & Subnets
   ═══════════════════════════════════════════════════════ */

const VNetModule = (() => {

  // Subnet planner data: the actual subnets in the migration architecture
  const ARCH_SUBNETS = [
    { vnet: 'Hub (10.0.0.0/16)',     name: 'AzureFirewallSubnet',    cidr: '10.0.0.0/26',  color: '#ff8c00', use: 'Azure Firewall (required name)' },
    { vnet: 'Hub (10.0.0.0/16)',     name: 'GatewaySubnet',          cidr: '10.0.1.0/27',  color: '#d83b01', use: 'ExpressRoute + VPN Gateway' },
    { vnet: 'Hub (10.0.0.0/16)',     name: 'AzureBastionSubnet',     cidr: '10.0.2.0/27',  color: '#8a4fff', use: 'Azure Bastion (required name)' },
    { vnet: 'Hub (10.0.0.0/16)',     name: 'dns-subnet',             cidr: '10.0.3.0/28',  color: '#0078d4', use: 'Azure Private DNS Resolver' },
    { vnet: 'Data Spoke (10.1.0.0/16)', name: 'adls-pe-subnet',     cidr: '10.1.0.0/24',  color: '#107c10', use: 'ADLS Gen2 Private Endpoints' },
    { vnet: 'Data Spoke (10.1.0.0/16)', name: 'eventhub-pe-subnet', cidr: '10.1.1.0/24',  color: '#107c10', use: 'Event Hubs Private Endpoints' },
    { vnet: 'Compute Spoke (10.2.0.0/16)', name: 'dbx-host-subnet', cidr: '10.2.0.0/22',  color: '#005a9e', use: 'Databricks host VMs (1,019 IPs)' },
    { vnet: 'Compute Spoke (10.2.0.0/16)', name: 'dbx-container-subnet', cidr: '10.2.4.0/22', color: '#005a9e', use: 'Databricks containers (1,019 IPs)' },
    { vnet: 'Compute Spoke (10.2.0.0/16)', name: 'aks-subnet',      cidr: '10.2.8.0/22',  color: '#0078d4', use: 'AKS nodes (ML workloads)' },
    { vnet: 'Compute Spoke (10.2.0.0/16)', name: 'adf-shir-subnet', cidr: '10.2.12.0/24', color: '#0078d4', use: 'ADF Self-Hosted IR (HA pair)' },
  ];

  const QUIZ = [
    {
      question: 'In a Hub-Spoke topology, which VNet hosts the Azure Firewall and ExpressRoute Gateway?',
      options: ['Data Spoke', 'Compute Spoke', 'Hub VNet', 'Management Spoke'],
      correct: 2,
      explanation: 'The Hub VNet contains shared services: Azure Firewall for centralised egress, ExpressRoute/VPN gateways for on-prem connectivity, and Azure Bastion for secure VM access. Spokes connect to the hub via VNet peering.'
    },
    {
      question: 'VNet peering in Azure is: (select the most accurate statement)',
      options: [
        'Transitive — Spoke A can reach Spoke B via Hub automatically',
        'Non-transitive — Spoke A cannot reach Spoke B via Hub without explicit routing',
        'Always encrypted with IPSec',
        'Limited to VNets in the same resource group'
      ],
      correct: 1,
      explanation: 'VNet peering is NON-TRANSITIVE. Spoke A cannot talk to Spoke B through the Hub without a User Defined Route (UDR) or a transit NVA (like Azure Firewall). This is why the hub firewall is critical for cross-spoke traffic.'
    },
    {
      question: 'Azure Databricks VNet injection requires the subnet to have a specific minimum delegation. What is it?',
      options: [
        'Microsoft.Web/serverFarms',
        'Microsoft.Databricks/workspaces',
        'Microsoft.ContainerService/managedClusters',
        'Microsoft.Network/virtualNetworks'
      ],
      correct: 1,
      explanation: 'Databricks VNet injection requires both subnets to be delegated to "Microsoft.Databricks/workspaces". This tells Azure that Databricks will manage NICs and NSGs within those subnets.'
    },
    {
      question: 'The AzureFirewallSubnet must be a specific name AND a minimum size. What is the minimum CIDR?',
      options: ['/32', '/29', '/26', '/16'],
      correct: 2,
      explanation: 'AzureFirewallSubnet must be named exactly "AzureFirewallSubnet" (case-sensitive) and must be at least /26. This allows Azure Firewall to deploy multiple backend instances for availability.'
    },
    {
      question: 'Two VNets in Azure are peered. Resources in VNet-A use address space 10.1.0.0/16. Resources in VNet-B also use 10.1.0.0/16. What happens?',
      options: [
        'Peering succeeds, Azure handles the overlap with NAT',
        'Peering fails — overlapping address spaces are not allowed',
        'Peering succeeds but only TCP traffic is routed',
        'Azure automatically re-IPs one of the VNets'
      ],
      correct: 1,
      explanation: 'Azure VNet peering requires non-overlapping address spaces. This is why your Hub-Spoke design uses distinct /16 blocks: 10.0/16, 10.1/16, 10.2/16, 10.3/16 — no overlap anywhere.'
    },
  ];

  // Subnet planner game state
  let plannerSubnets = [];
  let plannerBase = '10.2.0.0';
  let plannerAvail = 65534;

  function calcSubnetInfo(prefix) {
    const total = Math.pow(2, 32 - prefix);
    return { total, usable: total - 5 };
  }

  function renderPlannerRows() {
    const tbody = document.getElementById('planner-tbody');
    if (!tbody) return;
    let used = 0;
    tbody.innerHTML = plannerSubnets.map((s, i) => {
      const { usable } = calcSubnetInfo(s.prefix);
      used += Math.pow(2, 32 - s.prefix);
      const pct = Math.min(100, Math.round((Math.pow(2, 32 - s.prefix) / 65536) * 100));
      const colors = ['#0078d4','#107c10','#d83b01','#8a4fff','#ff8c00','#005a9e'];
      const col = colors[i % colors.length];
      return `
        <tr>
          <td><input id="sn-name-${i}" value="${s.name}" placeholder="subnet name" style="border:1px solid var(--border2);border-radius:4px;padding:4px 8px;font-size:13px;width:140px"></td>
          <td><select id="sn-prefix-${i}" style="border:1px solid var(--border2);border-radius:4px;padding:4px;font-size:13px">
            ${[26,27,24,23,22,21,20].map(p => `<option value="${p}" ${s.prefix==p?'selected':''}>${'/' + p} (${calcSubnetInfo(p).usable} usable)</option>`).join('')}
          </select></td>
          <td style="font-family:monospace;font-size:13px">${computeSubnetCIDR(i)}</td>
          <td>
            <div class="subnet-bar-wrap">
              <div class="subnet-bar-fill" style="width:${pct}%;background:${col}"></div>
            </div>
          </td>
          <td><button class="btn btn-secondary btn-sm" onclick="VNetModule._removePlannerRow(${i})">✕</button></td>
        </tr>
      `;
    }).join('');
    document.getElementById('planner-used').textContent = used.toLocaleString() + ' IPs used';
  }

  function computeSubnetCIDR(idx) {
    let offset = 0;
    for (let i = 0; i < idx; i++) {
      offset += Math.pow(2, 32 - plannerSubnets[i].prefix);
    }
    const base = plannerBase.split('.').map(Number);
    const baseInt = (base[0] << 24) | (base[1] << 16) | (base[2] << 8) | base[3];
    const addr = (baseInt + offset) >>> 0;
    const ip = [(addr >>> 24) & 0xFF, (addr >>> 16) & 0xFF, (addr >>> 8) & 0xFF, addr & 0xFF];
    return ip.join('.') + '/' + plannerSubnets[idx].prefix;
  }

  function _removePlannerRow(i) {
    plannerSubnets.splice(i, 1);
    renderPlannerRows();
  }

  function render() {
    plannerSubnets = [
      { name: 'dbx-host-subnet', prefix: 22 },
      { name: 'dbx-container-subnet', prefix: 22 },
    ];

    return `
      <div class="module-header">
        <div class="module-eyebrow">Module 2</div>
        <div class="module-title">🏗️ VNet & Subnets</div>
        <div class="module-desc">A Virtual Network (VNet) is your private, isolated slice of Azure's network — the foundation every other resource sits inside. This module covers the full picture: VNets, subnets, peering, and the hub-spoke pattern.</div>
      </div>

      <div class="tab-bar">
        <div class="tab active" data-tab="learn">📖 Learn</div>
        <div class="tab" data-tab="game">🎮 Quiz</div>
        <div class="tab" data-tab="lab">🧪 Subnet Planner</div>
      </div>

      <!-- LEARN -->
      <div class="tab-panel active" id="panel-learn">

        <div class="card">
          <h3>What is an Azure Virtual Network?</h3>
          <p>An Azure VNet is a logically isolated network in the cloud. Think of it as your private office building — the internet outside can't walk in, you control who enters, and departments (subnets) are separated by internal walls.</p>

          <div class="analogy">
            <span class="analogy-label">🏢 Real-Life Analogy</span>
            An Azure VNet is your company's private office building in the cloud. The building has a single street address range (say, 10.2.0.0/16 — your entire building). Inside, there are floors/departments (subnets): the Databricks floor (10.2.0.0/22), the AKS floor (10.2.8.0/22), and the ADF floor (10.2.12.0/24). The reception desk controls who enters from outside (NSG). And internal intercoms let one floor call another (VNet routing).
          </div>
        </div>

        <div class="card">
          <h3>Subnets — Dividing the VNet</h3>
          <p>A VNet address space is split into subnets. Each subnet is a range of IPs within the VNet, and each has its own NSG and route table.</p>
          <pre><code><span class="kw">VNet</span>: 10.2.0.0/16 (Compute Spoke)
├── <span class="prop">dbx-host-subnet</span>:      10.2.0.0/22   <span class="cm">← 1,019 IPs for Databricks VMs</span>
├── <span class="prop">dbx-container-subnet</span>: 10.2.4.0/22   <span class="cm">← 1,019 IPs for Databricks containers</span>
├── <span class="prop">aks-subnet</span>:           10.2.8.0/22   <span class="cm">← 1,019 IPs for AKS pods/nodes</span>
├── <span class="prop">adf-shir-subnet</span>:      10.2.12.0/24  <span class="cm">← 251 IPs for ADF Self-Hosted IR</span>
└── <span class="prop">synapse-subnet</span>:       10.2.13.0/24  <span class="cm">← 251 IPs for Synapse managed VNet</span></code></pre>

          <div class="callout">
            <strong>Subnets in the same VNet can talk to each other by default</strong> — no peering needed. NSG rules control whether that traffic is allowed.
          </div>
        </div>

        <div class="card">
          <h3>Hub-Spoke VNet Topology</h3>
          <p>Your architecture uses the <strong>Hub-Spoke pattern</strong> — the most common enterprise Azure design. It solves the problem of managing shared services (firewall, DNS, VPN) once, instead of duplicating them in every spoke.</p>

          <div style="background:var(--surface2);border-radius:var(--radius-lg);padding:24px;text-align:center;margin:16px 0">
            <div style="display:inline-flex;flex-direction:column;align-items:center;gap:0">
              <div style="background:#1b1a19;color:#fff;padding:10px 32px;border-radius:8px;font-weight:700;font-size:13px">
                🔷 Hub VNet (10.0.0.0/16)<br>
                <span style="font-size:11px;color:rgba(255,255,255,.5)">Firewall · Gateway · Bastion · DNS</span>
              </div>
              <div style="display:flex;gap:4px;margin:0;color:var(--text-muted);font-size:20px;letter-spacing:-2px">⋮</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:-8px;margin-bottom:4px">VNet Peering (non-transitive)</div>
              <div style="display:flex;gap:16px">
                ${[
                  ['🟢 Data Spoke','10.1.x','#dff6dd','#004b1c'],
                  ['🔵 Compute Spoke','10.2.x','#deecf9','#003d6b'],
                  ['🟠 Mgmt Spoke','10.3.x','#fff4ce','#5c3d00'],
                ].map(([n,ip,bg,c]) => `
                  <div style="background:${bg};color:${c};padding:10px 16px;border-radius:8px;font-weight:700;font-size:12px;text-align:center">
                    ${n}<br><code style="background:none;color:${c};padding:0">${ip}</code>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="warn">
            <strong>⚠️ VNet Peering is Non-Transitive!</strong> If Data Spoke and Compute Spoke are both peered to Hub, they CANNOT talk to each other directly. Traffic from Compute→Data must go Compute→Hub→Data. In your architecture, the Azure Firewall in the Hub acts as the transit point — everything routes through it.
          </div>

          <div class="arch-box">
            <span class="arch-label">🏗️ In Your Migration</span>
            The Databricks workspace sits in Compute Spoke (10.2.x). When Databricks jobs read from ADLS Gen2 (in Data Spoke 10.1.x), the traffic path is: Databricks VM → Compute Spoke → Hub Firewall (inspected) → Data Spoke → ADLS Private Endpoint. This centralises all egress through the firewall for logging and policy enforcement.
          </div>
        </div>

        <div class="card">
          <h3>VNet Peering Key Facts</h3>
          <table>
            <tr><th>Property</th><th>Detail</th></tr>
            <tr><td>Latency</td><td>Same as within a VNet — uses Microsoft backbone, not public internet</td></tr>
            <tr><td>Bandwidth</td><td>Limited by VM NIC bandwidth, not the peering link itself</td></tr>
            <tr><td>Transitive</td><td>❌ No — must add UDR or NVA for spoke-to-spoke routing</td></tr>
            <tr><td>Cross-region</td><td>✅ Global VNet peering supported (higher latency than same-region)</td></tr>
            <tr><td>Encryption</td><td>Traffic is on Microsoft backbone — not encrypted by default</td></tr>
            <tr><td>Cost</td><td>Charged per GB transferred over the peering link</td></tr>
          </table>
        </div>

      </div>

      <!-- QUIZ -->
      <div class="tab-panel" id="panel-game">
        <div class="game-wrapper">
          <div class="game-topbar">
            <div class="game-topbar-title">🎮 VNet & Subnets Quiz</div>
            <div class="game-topbar-meta"><span>⭐ 20 XP per question</span><span>5 Questions</span></div>
          </div>
          <div class="game-body" id="quiz-vnet"></div>
        </div>
      </div>

      <!-- SUBNET PLANNER LAB -->
      <div class="tab-panel" id="panel-lab">
        <div class="card">
          <h3>🧪 Subnet Planner</h3>
          <p style="color:var(--text-sub);margin-bottom:16px">Plan subnets for the Compute Spoke (10.2.0.0/16). Add or remove subnets and see CIDRs auto-calculated.</p>

          <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
            <div>
              <label style="font-size:12px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">BASE ADDRESS</label>
              <input id="planner-base" value="10.2.0.0" style="padding:7px 12px;border:1.5px solid var(--border2);border-radius:6px;font-family:monospace;font-size:14px;width:140px">
            </div>
            <div style="margin-top:20px">
              <button class="btn btn-primary" id="planner-add">+ Add Subnet</button>
            </div>
            <div id="planner-used" style="margin-top:20px;font-size:13px;color:var(--text-sub)"></div>
          </div>

          <table style="width:100%">
            <thead><tr>
              <th>Subnet Name</th><th>CIDR Size</th><th>Calculated CIDR</th><th>Space</th><th></th>
            </tr></thead>
            <tbody id="planner-tbody"></tbody>
          </table>

          <div class="callout" style="margin-top:16px">
            <strong>💡 Try building the real Compute Spoke:</strong> dbx-host (/22), dbx-container (/22), aks-subnet (/22), adf-shir-subnet (/24)
          </div>
        </div>
      </div>
    `;
  }

  function mount(container) {
    UI.initTabs(container);

    UI.buildQuiz({
      id: 'quiz-vnet',
      questions: QUIZ,
      xpPerQuestion: 20,
      moduleId: 'vnet',
      onComplete: (score, total) => {
        State.completeModule('vnet', score);
        UI.updateBadge('vnet');
        UI.showScore({ emoji: '🏗️', title: 'VNet Architect!', sub: `${score}/${total} correct — Hub-Spoke mastered.`, xp: score * 20 });
      }
    });

    // Planner
    renderPlannerRows();
    container.querySelector('#planner-add').addEventListener('click', () => {
      plannerSubnets.push({ name: 'new-subnet', prefix: 24 });
      renderPlannerRows();
    });
    container.querySelector('#planner-base').addEventListener('change', e => {
      plannerBase = e.target.value;
      renderPlannerRows();
    });
    // delegate change events on dynamically created rows
    document.getElementById('planner-tbody').addEventListener('change', () => {
      plannerSubnets.forEach((s, i) => {
        const nameEl = document.getElementById(`sn-name-${i}`);
        const prefixEl = document.getElementById(`sn-prefix-${i}`);
        if (nameEl) s.name = nameEl.value;
        if (prefixEl) s.prefix = parseInt(prefixEl.value);
      });
      renderPlannerRows();
    });
  }

  return { render, mount, _removePlannerRow };
})();

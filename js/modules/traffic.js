/* ═══════════════════════════════════════════════════════
   Module: Traffic Flow Management
   ═══════════════════════════════════════════════════════ */

const TrafficModule = (() => {

  const QUIZ = [
    {
      question: 'A packet leaves a Databricks VM (10.2.0.5) destined for 8.8.8.8 (internet). What is the correct traffic path in your Hub-Spoke architecture?',
      options: [
        '10.2.0.5 → Internet directly via NAT Gateway',
        '10.2.0.5 → Compute Spoke UDR → Hub Firewall (SNAT) → Internet',
        '10.2.0.5 → Data Spoke → Hub Firewall → Internet',
        '10.2.0.5 → GatewaySubnet → ExpressRoute → Internet'
      ],
      correct: 1,
      explanation: 'A UDR on the Databricks subnet routes 0.0.0.0/0 to the Firewall (Virtual Appliance: 10.0.0.4). The Firewall SNATs the traffic (replaces source 10.2.0.5 with its public IP) and forwards to the internet. The packet never goes to the Data Spoke or ExpressRoute.'
    },
    {
      question: 'On-prem (connected via ExpressRoute) sends traffic to Databricks (10.2.0.0/22). With NO UDR on GatewaySubnet, what happens?',
      options: [
        'Traffic is blocked — ExpressRoute cannot reach spoke VNets',
        'Traffic goes through the Firewall for inspection',
        'Traffic bypasses the Firewall and reaches Databricks directly via VNet peering',
        'Traffic is SNAT\'d by the ExpressRoute Gateway'
      ],
      correct: 2,
      explanation: 'Without a UDR on GatewaySubnet, the default ExpressRoute/VPN gateway behaviour is to use system routes for peered VNets — sending traffic directly to the spoke without passing through the Hub Firewall. A UDR on GatewaySubnet is REQUIRED to force on-prem traffic through the Firewall.'
    },
    {
      question: 'What is BGP route propagation in the context of VNet route tables?',
      options: [
        'Azure automatically imports BGP routes from ExpressRoute/VPN into subnet route tables',
        'BGP routes are only used for inter-region traffic',
        'BGP propagation replaces UDRs for spoke-to-spoke routing',
        'BGP propagation is required for Private Endpoints to work'
      ],
      correct: 0,
      explanation: 'When BGP route propagation is ENABLED on a route table, Azure automatically adds routes learned from the ExpressRoute/VPN gateway. When DISABLED (recommended in hub-spoke), it prevents spoke subnets from learning on-prem routes directly — forcing all traffic through the Firewall via explicit UDRs instead.'
    },
    {
      question: 'Traffic between two VMs in the SAME subnet — does it go through the NSG and route table?',
      options: [
        'Yes — all traffic goes through NSGs and route tables',
        'No — intra-subnet traffic bypasses route tables but goes through NSGs',
        'No — intra-subnet traffic bypasses both NSGs and route tables',
        'Yes — but only the outbound NSG is evaluated'
      ],
      correct: 1,
      explanation: 'Traffic between VMs in the same subnet uses the VNetLocal system route (no UDR applies). However, NSG rules on the subnet ARE evaluated. This means your intra-subnet NSG rules still control pod-to-pod or VM-to-VM traffic within a subnet.'
    },
    {
      question: 'Azure Firewall has "Forced Tunneling" mode. When would you use it?',
      options: [
        'When you want to inspect traffic between VNet subnets',
        'When you want to route the Firewall\'s own management traffic through an NVA or on-prem for compliance',
        'When forced tunneling is required for Private Endpoints',
        'When you need SNAT for multiple public IPs'
      ],
      correct: 1,
      explanation: 'Forced Tunneling routes the Azure Firewall\'s own management traffic (its outbound internet access for signature updates etc.) through an on-premises path or an NVA. Required in some compliance environments where ALL internet-bound traffic must leave via a specific on-prem security stack.'
    },
  ];

  // Traffic path simulator
  const SCENARIOS = [
    {
      id: 'dbx-internet',
      label: 'Databricks → Internet (PyPI)',
      from: 'Databricks VM\n10.2.0.5',
      fromClass: 'resource',
      steps: [
        { label: 'UDR: 0.0.0.0/0 →\nFirewall', nodeClass: 'subnet', nodeLabel: 'Compute Spoke\nUDR applied' },
        { label: 'Inspect App Rule\n*.pypi.org ALLOW', nodeClass: 'firewall', nodeLabel: 'Azure Firewall\nSNAT: 52.168.x.y' },
        { label: 'SNAT\'d to\npublic IP', nodeClass: 'internet', nodeLabel: 'Internet\npypi.org' },
      ]
    },
    {
      id: 'dbx-adls',
      label: 'Databricks → ADLS (Private)',
      from: 'Databricks VM\n10.2.0.5',
      fromClass: 'resource',
      steps: [
        { label: 'UDR: 10.1.0.0/16 →\nHub Peering', nodeClass: 'subnet', nodeLabel: 'Compute Spoke\nVNet Peering' },
        { label: 'Net Rule Allow\n10.2→10.1:443', nodeClass: 'firewall', nodeLabel: 'Hub Firewall\n10.0.0.4' },
        { label: 'Private Endpoint\nNo internet!', nodeClass: 'resource', nodeLabel: 'ADLS Gen2\n10.1.0.5 (PE)' },
      ]
    },
    {
      id: 'onprem-dbx',
      label: 'On-Prem → Databricks (via ER)',
      from: 'On-Prem\n192.168.1.0',
      fromClass: 'internet',
      steps: [
        { label: 'ExpressRoute\n1 Gbps', nodeClass: 'subnet', nodeLabel: 'GatewaySubnet\n10.0.1.0/27' },
        { label: 'UDR on GW\n→ Firewall', nodeClass: 'firewall', nodeLabel: 'Hub Firewall\nInspection' },
        { label: 'Net Rule Allow\nCorp → Databricks', nodeClass: 'resource', nodeLabel: 'Databricks\n10.2.0.5' },
      ]
    },
  ];

  let activeScenario = 0;

  function renderSimulator() {
    const sc = SCENARIOS[activeScenario];
    return `
      <div class="game-wrapper">
        <div class="game-topbar">
          <div class="game-topbar-title">🚦 Traffic Flow Simulator</div>
          <div class="game-topbar-meta"><span>⭐ 30 XP per scenario</span></div>
        </div>
        <div class="game-body">
          <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
            ${SCENARIOS.map((s, i) => `
              <button class="btn ${i === activeScenario ? 'btn-primary' : 'btn-secondary'} btn-sm" data-scenario="${i}">${s.label}</button>
            `).join('')}
          </div>

          <div class="flow-diagram" id="flow-diag">
            <div class="flow-node ${sc.fromClass}" style="white-space:pre-line">${sc.from}</div>
            ${sc.steps.map((s, i) => `
              <div class="flow-arrow" id="arrow-${i}">
                <div class="flow-arrow-label" style="font-size:10px;white-space:pre-line">${s.label}</div>
              </div>
              <div class="flow-node ${s.nodeClass}" id="node-${i}" style="white-space:pre-line;opacity:.4">${s.nodeLabel}</div>
            `).join('')}
          </div>

          <div style="display:flex;gap:12px;margin-top:20px">
            <button class="btn btn-primary" id="flow-play">▶ Animate Flow</button>
            <button class="btn btn-secondary" id="flow-reset">↩ Reset</button>
          </div>
          <div id="flow-explain" style="margin-top:14px;font-size:13px;color:var(--text-sub);min-height:40px"></div>
        </div>
      </div>
    `;
  }

  function render() {
    return `
      <div class="module-header">
        <div class="module-eyebrow">Module 7</div>
        <div class="module-title">🚦 Traffic Flow Management</div>
        <div class="module-desc">Understanding exactly how packets move through your Azure environment — from a Databricks VM to ADLS, from on-prem through ExpressRoute, or from the internet to your bastion — is critical for troubleshooting and design.</div>
      </div>

      <div class="tab-bar">
        <div class="tab active" data-tab="learn">📖 Learn</div>
        <div class="tab" data-tab="game">🎮 Quiz</div>
        <div class="tab" data-tab="lab">🧪 Flow Simulator</div>
      </div>

      <!-- LEARN -->
      <div class="tab-panel active" id="panel-learn">

        <div class="card">
          <h3>How Azure Decides Where Packets Go</h3>
          <p>Azure's traffic routing involves multiple layers evaluated in order for each packet:</p>
          <ol style="font-size:14px;line-height:2.5;padding-left:20px">
            <li><strong>Route table lookup</strong> — which UDR or system route matches? (Longest prefix match wins)</li>
            <li><strong>NSG evaluation</strong> — is this traffic permitted by the subnet/NIC NSG?</li>
            <li><strong>Azure Firewall policy</strong> — (if Firewall is the next hop) does a rule allow this?</li>
            <li><strong>Destination processing</strong> — the packet arrives at its destination</li>
          </ol>

          <div class="analogy">
            <span class="analogy-label">✈️ Real-Life Analogy</span>
            Think of traffic flow like an airplane journey. The route table is the flight plan — it decides which airport you fly through. NSGs are the departure gate check — are you allowed on this flight? The Firewall is Customs at the transit airport — are you permitted to pass? If all checks pass, you land at your destination.
          </div>
        </div>

        <div class="card">
          <h3>Critical Traffic Paths in Your Architecture</h3>
          <table>
            <tr><th>Flow</th><th>Path</th><th>Key rules required</th></tr>
            <tr>
              <td>Databricks → ADLS</td>
              <td>Compute Spoke → Hub Firewall → Data Spoke → PE</td>
              <td>UDR: 10.1.0.0/16 → Firewall; Net Rule: Allow 10.2.0.0/16 → 10.1.0.0/16:443</td>
            </tr>
            <tr>
              <td>Databricks → Internet</td>
              <td>Compute Spoke → Hub Firewall (SNAT) → Internet</td>
              <td>UDR: 0.0.0.0/0 → Firewall; App Rule: Allow *.pypi.org, *.github.com</td>
            </tr>
            <tr>
              <td>On-Prem → Databricks</td>
              <td>ExpressRoute → GatewaySubnet → Firewall → Compute Spoke</td>
              <td>UDR on GatewaySubnet: 10.2.0.0/16 → Firewall; Net Rule: Allow corp ranges</td>
            </tr>
            <tr>
              <td>ADF SHIR → Source DBs</td>
              <td>Compute Spoke → Hub Firewall → ExpressRoute → On-Prem DBs</td>
              <td>UDR on SHIR subnet; Net Rule: Allow 10.2.12.0/24 → on-prem SQL:1433</td>
            </tr>
            <tr>
              <td>Power BI → Synapse</td>
              <td>Internet → Public Endpoint (Synapse Serverless) — OR — Power BI Gateway</td>
              <td>Synapse workspace firewall: allow Power BI IPs; Private Endpoint preferred</td>
            </tr>
          </table>
        </div>

        <div class="card">
          <h3>BGP Route Propagation — Enable or Disable?</h3>
          <p>Every Azure route table has a "BGP route propagation" toggle. Here's the decision:</p>
          <div class="grid-2">
            <div class="arch-box" style="margin:0">
              <span class="arch-label" style="color:var(--red)">❌ DISABLE (your architecture)</span>
              Disable BGP propagation on spoke subnet route tables so spokes don't automatically learn on-prem routes via ExpressRoute gateway. This forces all traffic through the explicit UDR → Firewall path. Result: complete visibility and control.
            </div>
            <div class="callout" style="margin:0">
              <strong>✅ When to ENABLE</strong>
              Enable on GatewaySubnet so the gateway itself learns spoke routes (needed for return traffic). Some simple designs enable it everywhere — but then on-prem traffic can bypass the Firewall.
            </div>
          </div>
        </div>

        <div class="card">
          <h3>Troubleshooting Traffic Flows</h3>
          <p>When traffic isn't flowing as expected, use this checklist in order:</p>
          <ol style="font-size:14px;line-height:2.2;padding-left:20px">
            <li><strong>Check the effective route table</strong> — Azure portal shows "Effective Routes" for any NIC. Does the right route exist?</li>
            <li><strong>Check NSG flow logs</strong> — Is NSG blocking before the packet even reaches the Firewall?</li>
            <li><strong>Check Azure Firewall logs</strong> — AZFWNetworkRule and AZFWApplicationRule logs in Log Analytics</li>
            <li><strong>Use Network Watcher IP Flow Verify</strong> — simulates a packet and tells you if an NSG would allow/deny it</li>
            <li><strong>Use Network Watcher Next Hop</strong> — shows which route table entry applies for a given source/destination</li>
          </ol>
          <div class="arch-box">
            <span class="arch-label">🏗️ In Your Migration</span>
            When migrating Spark jobs from Cloudera to Databricks, the most common traffic issue is missing Firewall rules. A job that worked in dev suddenly fails in prod because the Firewall policy in prod is stricter. Always test the full traffic path: Databricks → Firewall → target resource, and check the Firewall Application/Network rule logs first.
          </div>
        </div>

      </div>

      <!-- QUIZ -->
      <div class="tab-panel" id="panel-game">
        <div class="game-wrapper">
          <div class="game-topbar">
            <div class="game-topbar-title">🎮 Traffic Flow Quiz</div>
            <div class="game-topbar-meta"><span>⭐ 20 XP per question</span><span>5 Questions</span></div>
          </div>
          <div class="game-body" id="quiz-traffic"></div>
        </div>
      </div>

      <!-- SIMULATOR -->
      <div class="tab-panel" id="panel-lab">
        <div id="sim-wrap">${renderSimulator()}</div>
      </div>
    `;
  }

  function mountSimulator(wrap) {
    wrap.querySelectorAll('[data-scenario]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeScenario = parseInt(btn.dataset.scenario);
        document.getElementById('sim-wrap').innerHTML = renderSimulator();
        mountSimulator(document.getElementById('sim-wrap'));
      });
    });

    const sc = SCENARIOS[activeScenario];
    const explains = [
      `Step 1: Packet leaves Databricks VM. Route table is checked — the UDR for this traffic kicks in.`,
      `Step 2: Packet reaches Azure Firewall in the Hub VNet. Policy is evaluated against rules.`,
      `Step 3: Firewall allows/NATting the packet to its final destination.`,
    ];

    let step = 0;
    const playBtn = document.getElementById('flow-play');
    const explainEl = document.getElementById('flow-explain');

    function animateStep() {
      if (step >= sc.steps.length) {
        playBtn.textContent = '✓ Done';
        playBtn.disabled = true;
        UI.awardXP(30, playBtn);
        State.completeModule('traffic', activeScenario + 1);
        UI.updateBadge('traffic');
        return;
      }
      const arrow = document.getElementById(`arrow-${step}`);
      const node = document.getElementById(`node-${step}`);
      if (arrow) arrow.classList.add('active');
      if (node) { node.style.opacity = '1'; node.classList.add('pulse'); }
      explainEl.textContent = explains[step] || '';
      step++;
    }

    playBtn.addEventListener('click', animateStep);
    document.getElementById('flow-reset').addEventListener('click', () => {
      document.getElementById('sim-wrap').innerHTML = renderSimulator();
      mountSimulator(document.getElementById('sim-wrap'));
    });
  }

  function mount(container) {
    UI.initTabs(container);

    UI.buildQuiz({
      id: 'quiz-traffic',
      questions: QUIZ,
      xpPerQuestion: 20,
      moduleId: 'traffic',
      onComplete: (score, total) => {
        State.completeModule('traffic', score);
        UI.updateBadge('traffic');
        UI.showScore({ emoji: '🚦', title: 'Traffic Engineer!', sub: `${score}/${total} correct — flow mastered.`, xp: score * 20 });
      }
    });

    const simWrap = document.getElementById('sim-wrap');
    if (simWrap) mountSimulator(simWrap);
  }

  return { render, mount };
})();

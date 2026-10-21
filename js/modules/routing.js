/* ═══════════════════════════════════════════════════════
   Module: Routing & UDR
   ═══════════════════════════════════════════════════════ */

const RoutingModule = (() => {

  const QUIZ = [
    {
      question: 'Azure automatically creates "system routes" for every subnet. Which destination is NOT a default system route?',
      options: [
        'The VNet address space (e.g. 10.0.0.0/16)',
        '0.0.0.0/0 → Internet',
        '10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 → None (dropped)',
        '168.63.129.16/32 → Internet (Azure metadata)'
      ],
      correct: 3,
      explanation: 'Azure system routes include: the VNet space, 0.0.0.0/0 to Internet, and the RFC1918 ranges to "None" (dropped). The metadata IP 168.63.129.16 is reachable but not a separately listed system route — it is included via the 0.0.0.0/0 Internet route.'
    },
    {
      question: 'You want ALL internet-bound traffic from the Compute Spoke to flow through the Azure Firewall in the Hub. Which resource do you use?',
      options: [
        'An NSG with a Deny rule for 0.0.0.0/0',
        'A User Defined Route (UDR) with 0.0.0.0/0 → Virtual Appliance (Firewall IP)',
        'VNet peering traffic forwarding setting',
        'An Azure Application Gateway in the Hub'
      ],
      correct: 1,
      explanation: 'A UDR (User Defined Route) overrides the system route for 0.0.0.0/0. You point it to the Azure Firewall\'s private IP as the next hop type "Virtual Appliance". This forces all internet-bound traffic through the firewall for inspection and SNAT.'
    },
    {
      question: 'What is "longest prefix match" in routing?',
      options: [
        'Azure prefers routes with the longest name',
        'The most specific route (highest prefix length) wins when multiple routes match a destination IP',
        'Routes with the most destinations are preferred',
        'The route that has been in the table the longest takes priority'
      ],
      correct: 1,
      explanation: 'Longest prefix match means the most specific route wins. If a packet goes to 10.2.5.10, a route for 10.2.0.0/22 beats a route for 10.0.0.0/8 — even if both match. This is fundamental to how all IP routing works.'
    },
    {
      question: 'You add a UDR to the GatewaySubnet to route 10.2.0.0/16 to the Azure Firewall. What problem does this solve?',
      options: [
        'It allows the ExpressRoute gateway to reach Databricks subnets',
        'It ensures on-premises traffic to Compute Spoke goes through the Firewall instead of directly via peering',
        'It prevents the Firewall from routing traffic back to the gateway',
        'It enables BGP route propagation from on-premises'
      ],
      correct: 1,
      explanation: 'Without a UDR on GatewaySubnet, traffic from on-premises (arriving via ExpressRoute/VPN) destined for Compute Spoke would bypass the Firewall and go directly through VNet peering. A UDR on GatewaySubnet redirects this traffic through the Firewall for inspection.'
    },
    {
      question: 'NAT Gateway in your Databricks subnet serves what purpose?',
      options: [
        'It gives each Databricks VM its own public IP for inbound connections',
        'It provides a single stable outbound public IP for all Databricks cluster VMs when accessing the internet',
        'It translates private RFC1918 IPs to link-local IPs',
        'It replaces the Azure Firewall for internet egress'
      ],
      correct: 1,
      explanation: 'NAT Gateway provides SNAT (Source Network Address Translation) for outbound internet traffic. All Databricks VMs in the subnet appear to come from the same stable public IP. This is useful for IP-whitelisting at external APIs. In your architecture, NAT Gateway and Azure Firewall both provide SNAT — NAT Gateway for direct internet paths, Firewall for policy-controlled paths.'
    },
  ];

  // Route table drag-n-drop game
  const ROUTES_TO_SORT = [
    { prefix: '10.2.0.0/16', next: 'VNetLocal', desc: 'Compute Spoke VNet (automatic)' },
    { prefix: '0.0.0.0/0', next: 'Virtual Appliance (10.0.0.4)', desc: 'All internet traffic → Firewall' },
    { prefix: '10.0.0.0/16', next: 'VNet Peering (Hub)', desc: 'Hub VNet via peering' },
    { prefix: '10.1.0.0/16', next: 'VNet Peering (Hub)', desc: 'Data Spoke via Hub' },
    { prefix: '172.16.0.0/12', next: 'None', desc: 'Private range — drop (RFC1918)' },
  ];

  function render() {
    return `
      <div class="module-header">
        <div class="module-eyebrow">Module 4</div>
        <div class="module-title">🗺️ Routing & UDR</div>
        <div class="module-desc">Azure automatically routes traffic within your VNet — but you control the flow with User Defined Routes (UDR). This is how you force all traffic through the Azure Firewall and keep your hub-spoke topology secure.</div>
      </div>

      <div class="tab-bar">
        <div class="tab active" data-tab="learn">📖 Learn</div>
        <div class="tab" data-tab="game">🎮 Quiz</div>
        <div class="tab" data-tab="lab">🧪 Route Table Lab</div>
      </div>

      <!-- LEARN -->
      <div class="tab-panel active" id="panel-learn">

        <div class="card">
          <h3>How Azure Routing Works</h3>
          <p>Every packet in Azure goes through a routing decision. Azure checks the destination IP against a route table associated with the subnet, picks the best-matching route, and forwards accordingly.</p>

          <div class="analogy">
            <span class="analogy-label">🚗 Real-Life Analogy</span>
            Think of routing like a GPS system in your car (the subnet). When you enter a destination (target IP), the GPS (route table) checks its maps for the best path. It might say "take the highway" (via Firewall) or "use the local road" (direct VNet peering). A custom rule (UDR) is like a "local knowledge" override — "always take the tunnel regardless of what the GPS says."
          </div>
        </div>

        <div class="card">
          <h3>System Routes vs User Defined Routes</h3>
          <div class="grid-2">
            <div>
              <h4>System Routes (automatic)</h4>
              <p style="font-size:13px;color:var(--text-sub);margin-bottom:10px">Created automatically by Azure, cannot be deleted</p>
              <table style="font-size:13px">
                <tr><th>Destination</th><th>Next Hop</th></tr>
                <tr><td><code>10.2.0.0/16</code></td><td>VNetLocal</td></tr>
                <tr><td><code>0.0.0.0/0</code></td><td>Internet</td></tr>
                <tr><td><code>10.0.0.0/8</code></td><td>None (drop)</td></tr>
                <tr><td><code>172.16.0.0/12</code></td><td>None (drop)</td></tr>
                <tr><td><code>192.168.0.0/16</code></td><td>None (drop)</td></tr>
              </table>
            </div>
            <div>
              <h4>UDR (User Defined Routes)</h4>
              <p style="font-size:13px;color:var(--text-sub);margin-bottom:10px">Override system routes — your custom routing policy</p>
              <table style="font-size:13px">
                <tr><th>Destination</th><th>Next Hop</th></tr>
                <tr><td><code>0.0.0.0/0</code></td><td>10.0.0.4 (Firewall) ←⭐</td></tr>
                <tr><td><code>10.0.0.0/16</code></td><td>VNet Peering (Hub)</td></tr>
                <tr><td><code>10.1.0.0/16</code></td><td>VNet Peering (Hub)</td></tr>
                <tr><td><code>10.3.0.0/16</code></td><td>VNet Peering (Hub)</td></tr>
              </table>
              <div style="font-size:12px;color:var(--text-muted);margin-top:6px">⭐ This overrides the default Internet hop</div>
            </div>
          </div>

          <div class="callout" style="margin-top:12px">
            <strong>Longest Prefix Match wins.</strong> A UDR for 0.0.0.0/0 (default route) is overridden by any more-specific route. So your peering routes for 10.1.0.0/16 and 10.0.0.0/16 take priority over the 0.0.0.0/0 → Firewall for those specific ranges.
          </div>
        </div>

        <div class="card">
          <h3>Next Hop Types</h3>
          <table>
            <tr><th>Next Hop Type</th><th>What it means</th><th>Use case</th></tr>
            <tr><td><strong>VirtualNetworkGateway</strong></td><td>Send to ExpressRoute/VPN gateway</td><td>On-prem bound traffic</td></tr>
            <tr><td><strong>VNetLocal</strong></td><td>Route within the same VNet</td><td>Default for VNet subnets</td></tr>
            <tr><td><strong>Internet</strong></td><td>Send to public internet via Azure edge</td><td>Public endpoints, system default</td></tr>
            <tr><td><strong>VirtualAppliance</strong></td><td>Send to a specific IP (NVA/Firewall)</td><td>Azure Firewall, 3rd-party NVAs</td></tr>
            <tr><td><strong>None</strong></td><td>Drop the packet (black hole)</td><td>Block RFC1918 ranges, security</td></tr>
          </table>
        </div>

        <div class="card">
          <h3>The Complete Hub-Spoke Traffic Path</h3>
          <pre><code><span class="cm">// Databricks Job → ADLS Gen2 (Private Endpoint in Data Spoke)</span>

Databricks VM (10.2.0.5)
  └→ Route Table (Compute Spoke): 10.1.0.0/16 → VNet Peering (Hub)
      └→ Hub VNet arrives at Azure Firewall (10.0.0.4)
          └→ Firewall Policy: Allow Compute Spoke → Storage (10.1.0.0/16)
              └→ Route Table (Hub): 10.1.0.0/16 → VNet Peering (Data Spoke)
                  └→ Data Spoke: 10.1.0.5 (ADLS Private Endpoint)
                      └→ ADLS Gen2 storage account responds

<span class="cm">// Total path: Compute Spoke → Hub (Firewall) → Data Spoke</span>
<span class="cm">// Traffic NEVER leaves Azure backbone — fully private</span></code></pre>

          <div class="arch-box">
            <span class="arch-label">🏗️ In Your Migration</span>
            This path is critical. All 100 parallel Databricks job clusters reading from ADLS Gen2 go through the Firewall. The Firewall logs every connection, giving you full visibility into data access patterns — something you never had in Cloudera. Azure Monitor ingests these logs for alerting on anomalous access.
          </div>
        </div>

      </div>

      <!-- QUIZ -->
      <div class="tab-panel" id="panel-game">
        <div class="game-wrapper">
          <div class="game-topbar">
            <div class="game-topbar-title">🎮 Routing & UDR Quiz</div>
            <div class="game-topbar-meta"><span>⭐ 20 XP per question</span><span>5 Questions</span></div>
          </div>
          <div class="game-body" id="quiz-routing"></div>
        </div>
      </div>

      <!-- ROUTE TABLE LAB -->
      <div class="tab-panel" id="panel-lab">
        <div class="card">
          <h3>🧪 Route Table Builder</h3>
          <p style="color:var(--text-sub);margin-bottom:16px">Build the UDR for the Compute Spoke subnet. Add routes and see which one wins for different destination IPs.</p>

          <div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:16px;flex-wrap:wrap">
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">DESTINATION PREFIX</label>
              <input id="rt-dest" value="0.0.0.0/0" style="padding:8px 12px;border:1.5px solid var(--border2);border-radius:6px;font-family:monospace;font-size:14px;width:160px">
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">NEXT HOP TYPE</label>
              <select id="rt-hop" style="padding:8px 12px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px">
                <option>VirtualAppliance</option>
                <option>VNetLocal</option>
                <option>Internet</option>
                <option>None</option>
                <option>VirtualNetworkGateway</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">NEXT HOP IP (if Appliance)</label>
              <input id="rt-hopip" value="10.0.0.4" placeholder="10.0.0.4" style="padding:8px 12px;border:1.5px solid var(--border2);border-radius:6px;font-family:monospace;font-size:14px;width:160px">
            </div>
            <button class="btn btn-primary" id="rt-add">+ Add Route</button>
          </div>

          <table style="width:100%">
            <thead><tr><th>#</th><th>Destination</th><th>Next Hop</th><th>Source</th><th></th></tr></thead>
            <tbody id="rt-tbody"></tbody>
          </table>

          <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
            <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--text-sub)">TEST A DESTINATION IP</div>
            <div style="display:flex;gap:8px;align-items:center">
              <input id="rt-test-ip" value="8.8.8.8" placeholder="Destination IP" style="padding:8px 12px;border:1.5px solid var(--border2);border-radius:6px;font-family:monospace;font-size:14px;width:160px">
              <button class="btn btn-secondary" id="rt-test">▶ Test</button>
              <div id="rt-result" style="font-size:14px;font-weight:700;color:var(--blue)"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  let customRoutes = [];
  const systemRoutes = [
    { dest: '10.2.0.0/16', hop: 'VNetLocal', hopIP: '', src: 'System' },
    { dest: '0.0.0.0/0', hop: 'Internet', hopIP: '', src: 'System' },
    { dest: '10.0.0.0/8', hop: 'None', hopIP: '', src: 'System' },
  ];

  function ipToInt(ip) {
    try { return ip.split('.').reduce((a,b) => (a << 8) | parseInt(b), 0) >>> 0; }
    catch { return 0; }
  }

  function matchesPrefix(ip, cidr) {
    const [net, prefix] = cidr.split('/');
    const p = parseInt(prefix);
    const mask = p === 0 ? 0 : ((0xFFFFFFFF << (32 - p)) >>> 0);
    return (ipToInt(ip) & mask) === (ipToInt(net) & mask);
  }

  function renderRouteTable() {
    const tbody = document.getElementById('rt-tbody');
    if (!tbody) return;
    const all = [...customRoutes.map(r => ({...r, src:'Custom'})), ...systemRoutes];
    tbody.innerHTML = all.map((r, i) => `
      <tr>
        <td style="font-size:12px;color:var(--text-muted)">${i+1}</td>
        <td><code>${r.dest}</code></td>
        <td>${r.hop}${r.hopIP ? ' <code style="font-size:11px">→ ' + r.hopIP + '</code>' : ''}</td>
        <td><span class="pill ${r.src==='Custom'?'pill-blue':'pill-green'}" style="margin:0">${r.src}</span></td>
        <td>${r.src==='Custom' ? `<button class="btn btn-secondary btn-sm" data-del="${i}">✕</button>` : ''}</td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        customRoutes.splice(parseInt(btn.dataset.del), 1);
        renderRouteTable();
      });
    });
  }

  function testRoute(ip) {
    const all = [...customRoutes, ...systemRoutes];
    let best = null; let bestLen = -1;
    for (const r of all) {
      const [, prefix] = r.dest.split('/');
      const pLen = parseInt(prefix || '0');
      if (matchesPrefix(ip, r.dest) && pLen > bestLen) { best = r; bestLen = pLen; }
    }
    return best;
  }

  function mount(container) {
    UI.initTabs(container);

    UI.buildQuiz({
      id: 'quiz-routing',
      questions: QUIZ,
      xpPerQuestion: 20,
      moduleId: 'routing',
      onComplete: (score, total) => {
        State.completeModule('routing', score);
        UI.updateBadge('routing');
        UI.showScore({ emoji: '🗺️', title: 'Route Master!', sub: `${score}/${total} correct — routing nailed.`, xp: score * 20 });
      }
    });

    // Route table lab
    renderRouteTable();
    container.querySelector('#rt-add').addEventListener('click', () => {
      customRoutes.unshift({
        dest: document.getElementById('rt-dest').value || '0.0.0.0/0',
        hop: document.getElementById('rt-hop').value,
        hopIP: document.getElementById('rt-hopip').value,
      });
      renderRouteTable();
    });
    container.querySelector('#rt-test').addEventListener('click', () => {
      const ip = document.getElementById('rt-test-ip').value;
      const match = testRoute(ip);
      const el = document.getElementById('rt-result');
      if (match) {
        el.innerHTML = `✓ Matched: <strong>${match.dest}</strong> → ${match.hop}${match.hopIP ? ' (' + match.hopIP + ')' : ''}`;
        el.style.color = 'var(--green)';
      } else {
        el.textContent = '✗ No route matched — dropped';
        el.style.color = 'var(--red)';
      }
    });
  }

  return { render, mount };
})();

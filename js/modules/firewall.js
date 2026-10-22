/* ═══════════════════════════════════════════════════════
   Module: Azure Firewall
   ═══════════════════════════════════════════════════════ */

const FirewallModule = (() => {

  const QUIZ = [
    {
      question: 'Azure Firewall Standard vs Premium: what feature does Premium add that Standard lacks?',
      options: [
        'SNAT (Source Network Address Translation)',
        'TLS inspection and IDPS (Intrusion Detection & Prevention System)',
        'FQDN-based filtering',
        'Integration with Azure Monitor'
      ],
      correct: 1,
      explanation: 'Azure Firewall Premium adds TLS inspection (decrypt, inspect, re-encrypt HTTPS traffic) and IDPS (signature-based threat detection). Standard has SNAT, FQDN filtering, and threat intelligence — but no deep packet inspection of encrypted traffic.'
    },
    {
      question: 'A Databricks job tries to reach "pypi.org" to install a Python package. Azure Firewall has an Application Rule. Which field in the rule controls this?',
      options: [
        'Target IP addresses',
        'Destination FQDNs (Fully Qualified Domain Names)',
        'Destination ports',
        'Source service tags'
      ],
      correct: 1,
      explanation: 'Application Rules in Azure Firewall use FQDN-based filtering. You can allow "*.pypi.org" as the target FQDN with protocol HTTPS:443. This is far easier to maintain than keeping a list of PyPI IP ranges (which change constantly).'
    },
    {
      question: 'What is SNAT and why is it critical for your Databricks architecture?',
      options: [
        'Source NAT — Firewall replaces the source IP with its own public IP, giving Databricks VMs a stable outbound identity',
        'Secure NAT — encrypts all outbound traffic leaving the Firewall',
        'Static NAT — maps a private IP permanently to a public IP for inbound access',
        'Subnet NAT — translates between subnet CIDR ranges'
      ],
      correct: 0,
      explanation: 'SNAT (Source NAT) means the Firewall replaces the source IP of outbound packets with its own public IP. So all 1000+ Databricks worker VMs (with different private IPs) appear to external services as a single IP. This enables IP-whitelisting at external data sources like partner APIs or on-prem systems.'
    },
    {
      question: 'Azure Firewall rule collections are processed in order: Network Rules, then Application Rules, then NAT Rules. True or false?',
      options: [
        'True — this is the correct order',
        'False — NAT Rules first, then Network Rules, then Application Rules',
        'False — Application Rules first, then Network Rules, then NAT Rules',
        'False — all rule types are evaluated simultaneously by priority'
      ],
      correct: 1,
      explanation: 'Azure Firewall processes rule collections in this order: 1) NAT Rules (for inbound DNAT — translating public IP to internal), 2) Network Rules (L3/L4 IP:port matching), 3) Application Rules (L7 FQDN/URL matching). Within each type, lower priority number = evaluated first.'
    },
    {
      question: 'Your Azure Firewall is in the Hub VNet (10.0.0.0/16). Databricks in Compute Spoke sends traffic to ADLS (in Data Spoke). Which rule type handles this spoke-to-spoke traffic?',
      options: [
        'Application Rule (FQDN-based)',
        'Network Rule (IP:port matching)',
        'NAT Rule (DNAT)',
        'Security Admin Rule (AVNM)'
      ],
      correct: 1,
      explanation: 'Spoke-to-spoke traffic (Compute → Data) traverses the Firewall as an internal flow. This is handled by Network Rules (L3/L4) matching the source subnet and destination IP range. Application Rules are for external internet traffic using FQDNs. NAT Rules are for inbound public-to-private translation.'
    },
  ];

  // Policy builder game
  const FIREWALL_CHALLENGES = [
    {
      question: 'Databricks needs to download Python packages from "*.pypi.org" over HTTPS. Create the correct Application Rule.',
      expected: { type: 'app', fqdn: 'pypi.org', protocol: 'Https', port: '443', action: 'Allow' },
      checkFn: r => r.type === 'app' && r.fqdn.includes('pypi') && r.port === '443' && r.action === 'Allow',
      hint: 'Application Rule → Target FQDN: *.pypi.org → Protocol: Https:443 → Allow'
    },
    {
      question: 'Block all outbound traffic to port 23 (Telnet) from any source.',
      expected: { type: 'net', destPort: '23', action: 'Deny' },
      checkFn: r => r.type === 'net' && r.destPort === '23' && r.action === 'Deny',
      hint: 'Network Rule → Source: * → Destination: * → Protocol: TCP → Port: 23 → Deny'
    },
    {
      question: 'Allow ADF Self-Hosted IR (10.2.12.0/24) to reach Azure SQL via its service tag on port 1433.',
      expected: { type: 'net', source: '10.2.12', destPort: '1433', action: 'Allow' },
      checkFn: r => r.type === 'net' && r.source && r.source.includes('10.2.12') && r.destPort === '1433' && r.action === 'Allow',
      hint: 'Network Rule → Source: 10.2.12.0/24 → Destination: Sql (service tag) → Port: 1433 → Allow'
    },
  ];

  let policyChallenge = 0;

  function renderPolicyGame() {
    const c = FIREWALL_CHALLENGES[policyChallenge % FIREWALL_CHALLENGES.length];
    return `
      <div class="callout" style="margin-bottom:16px">
        <strong>Challenge ${policyChallenge + 1}/${FIREWALL_CHALLENGES.length}:</strong> ${c.question}<br>
        <span style="font-size:12px;opacity:.8">Hint: ${c.hint}</span>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">RULE TYPE</label>
          <select id="fw-type" style="padding:8px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px">
            <option value="net">Network Rule</option>
            <option value="app">Application Rule</option>
            <option value="nat">NAT Rule</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">ACTION</label>
          <select id="fw-action" style="padding:8px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px">
            <option>Allow</option><option>Deny</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">SOURCE (IP/Tag)</label>
          <input id="fw-source" value="*" style="padding:8px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px;width:160px">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">DEST FQDN (App Rule)</label>
          <input id="fw-fqdn" placeholder="*.pypi.org" style="padding:8px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px;width:160px">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">PROTOCOL</label>
          <select id="fw-protocol" style="padding:8px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px">
            <option>Https</option><option>Http</option><option>TCP</option><option>UDP</option><option>Any</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">PORT</label>
          <input id="fw-port" value="443" style="padding:8px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px;width:80px">
        </div>
      </div>

      <button class="btn btn-primary" id="fw-check">✓ Check Rule</button>
      <div id="fw-feedback" style="margin-top:12px;display:none"></div>
    `;
  }

  function render() {
    return `
      <div class="module-header">
        <div class="module-eyebrow">Module 6</div>
        <div class="module-title">🔥 Azure Firewall</div>
        <div class="module-desc">Azure Firewall is the centralised egress point in your Hub VNet. It inspects, filters, and logs all traffic leaving your Azure environment — and provides a single stable public IP for all your workloads via SNAT.</div>
      </div>

      <div class="tab-bar">
        <div class="tab active" data-tab="learn">📖 Learn</div>
        <div class="tab" data-tab="game">🎮 Quiz</div>
        <div class="tab" data-tab="lab">🧪 Policy Builder</div>
      </div>

      <!-- LEARN -->
      <div class="tab-panel active" id="panel-learn">

        <div class="card">
          <h3>What is Azure Firewall?</h3>
          <p>Azure Firewall is a managed, cloud-native L3–L7 network security service. It's deployed in its own subnet (<code>AzureFirewallSubnet</code>, min /26) in the Hub VNet and processes traffic via UDRs in spoke subnets.</p>

          <div class="analogy">
            <span class="analogy-label">🚦 Real-Life Analogy</span>
            Azure Firewall is like Customs & Immigration at an international airport. Every passenger (packet) going in or out must pass through the checkpoint. The officer checks your passport (IP), your declared destination (FQDN), and your purpose (port/protocol). The SNAT function is like the airport giving you a "visitor's ID number" when you exit — external entities only see the airport's ID, not your private passport.
          </div>
        </div>

        <div class="card">
          <h3>Three Types of Firewall Rules</h3>
          <div class="grid-3">
            <div class="card" style="border-color:#0078d4;padding:16px">
              <h4 style="color:var(--blue)">🔒 NAT Rules</h4>
              <p style="font-size:13px">DNAT — translate inbound public IP:port to internal private IP. Used for inbound traffic.</p>
              <code style="font-size:11px">Public:80 → 10.0.0.10:80</code>
            </div>
            <div class="card" style="border-color:#107c10;padding:16px">
              <h4 style="color:var(--green)">🌐 Network Rules</h4>
              <p style="font-size:13px">L3/L4 rules matching source IP, dest IP, protocol, and port. For non-HTTP traffic.</p>
              <code style="font-size:11px">10.2.0.0/22 → Sql:1433 Allow</code>
            </div>
            <div class="card" style="border-color:#d83b01;padding:16px">
              <h4 style="color:var(--orange)">🌍 Application Rules</h4>
              <p style="font-size:13px">L7 rules matching FQDNs/URLs. For HTTP/HTTPS internet-bound traffic.</p>
              <code style="font-size:11px">*.pypi.org:Https Allow</code>
            </div>
          </div>
          <div class="callout" style="margin-top:8px">
            <strong>Processing order:</strong> NAT Rules → Network Rules → Application Rules. First match wins.
          </div>
        </div>

        <div class="card">
          <h3>SNAT — Giving Your Architecture a Single Identity</h3>
          <pre><code><span class="cm">// Without SNAT:</span>
Databricks VM 1 (10.2.0.5)  → External API → appears as 10.2.0.5 (private, not routable!)
Databricks VM 2 (10.2.0.6)  → External API → appears as 10.2.0.6 (different IP every time!)
<span class="cm">// Problem: Can't whitelist dynamic private IPs at external systems</span>

<span class="cm">// With Azure Firewall SNAT:</span>
Databricks VM 1 (10.2.0.5)  → Firewall SNAT → External API → appears as 52.168.x.y ✓
Databricks VM 2 (10.2.0.6)  → Firewall SNAT → External API → appears as 52.168.x.y ✓
Databricks VM 100 (10.2.3.x) → Firewall SNAT → External API → appears as 52.168.x.y ✓
<span class="cm">// Solution: All 1000+ VMs have ONE stable public IP to whitelist</span></code></pre>

          <div class="arch-box">
            <span class="arch-label">🏗️ In Your Migration</span>
            Your Cloudera environment had a fixed set of edge nodes with known IPs. External data partners whitelisted those IPs. In Azure, Databricks clusters are ephemeral — VMs come and go with different private IPs. Azure Firewall's SNAT gives you the same stable public IP for whitelisting, even as cluster VMs cycle.
          </div>
        </div>

        <div class="card">
          <h3>Firewall Policy for Your Databricks Architecture</h3>
          <table>
            <tr><th>Rule Type</th><th>Name</th><th>Source</th><th>Destination</th><th>Port</th><th>Action</th></tr>
            <tr><td>App</td><td>Allow-PyPI</td><td>10.2.0.0/16</td><td>*.pypi.org</td><td>Https</td><td style="color:var(--green)">Allow</td></tr>
            <tr><td>App</td><td>Allow-Maven</td><td>10.2.0.0/16</td><td>*.maven.org</td><td>Https</td><td style="color:var(--green)">Allow</td></tr>
            <tr><td>App</td><td>Allow-Databricks</td><td>10.2.0.0/16</td><td>*.azuredatabricks.net</td><td>Https</td><td style="color:var(--green)">Allow</td></tr>
            <tr><td>Net</td><td>Allow-ADLS-PE</td><td>10.2.0.0/16</td><td>10.1.0.0/24</td><td>443</td><td style="color:var(--green)">Allow</td></tr>
            <tr><td>Net</td><td>Allow-ADF-SQL</td><td>10.2.12.0/24</td><td>Sql (tag)</td><td>1433</td><td style="color:var(--green)">Allow</td></tr>
            <tr><td>Net</td><td>Deny-All</td><td>*</td><td>*</td><td>*</td><td style="color:var(--red)">Deny</td></tr>
          </table>
        </div>

      </div>

      <!-- QUIZ -->
      <div class="tab-panel" id="panel-game">
        <div class="game-wrapper">
          <div class="game-topbar">
            <div class="game-topbar-title">🎮 Azure Firewall Quiz</div>
            <div class="game-topbar-meta"><span>⭐ 20 XP per question</span><span>5 Questions</span></div>
          </div>
          <div class="game-body" id="quiz-firewall"></div>
        </div>
      </div>

      <!-- POLICY BUILDER -->
      <div class="tab-panel" id="panel-lab">
        <div class="game-wrapper">
          <div class="game-topbar">
            <div class="game-topbar-title">🧪 Firewall Policy Builder</div>
            <div class="game-topbar-meta"><span>⭐ 50 XP per challenge</span></div>
          </div>
          <div class="game-body" id="fw-policy-body">${renderPolicyGame()}</div>
        </div>
      </div>
    `;
  }

  function bindPolicyGame() {
    const checkBtn = document.getElementById('fw-check');
    if (!checkBtn) return;
    checkBtn.addEventListener('click', () => {
      const rule = {
        type: document.getElementById('fw-type').value,
        action: document.getElementById('fw-action').value,
        source: document.getElementById('fw-source').value,
        fqdn: document.getElementById('fw-fqdn').value,
        protocol: document.getElementById('fw-protocol').value,
        port: document.getElementById('fw-port').value,
        destPort: document.getElementById('fw-port').value,
      };
      const c = FIREWALL_CHALLENGES[policyChallenge % FIREWALL_CHALLENGES.length];
      const fb = document.getElementById('fw-feedback');
      fb.style.display = 'block';
      if (c.checkFn(rule)) {
        fb.className = 'quiz-feedback show ok';
        fb.innerHTML = `<strong>✓ Correct!</strong> That rule matches the challenge. +50 XP`;
        UI.awardXP(50, checkBtn);
        policyChallenge++;
        if (policyChallenge < FIREWALL_CHALLENGES.length) {
          setTimeout(() => {
            const body = document.getElementById('fw-policy-body');
            if (!body) return; // user navigated away
            body.innerHTML = renderPolicyGame();
            bindPolicyGame();
          }, 1800);
        } else {
          State.completeModule('firewall', FIREWALL_CHALLENGES.length);
          UI.updateBadge('firewall');
          fb.innerHTML += '<br><strong>🎉 All firewall challenges complete!</strong>';
        }
      } else {
        fb.className = 'quiz-feedback show bad';
        fb.innerHTML = `<strong>✗ Not quite.</strong> Re-read the challenge and hint carefully.`;
      }
    });
  }

  function mount(container) {
    UI.initTabs(container);

    UI.buildQuiz({
      id: 'quiz-firewall',
      questions: QUIZ,
      xpPerQuestion: 20,
      moduleId: 'firewall',
      onComplete: (score, total) => {
        State.completeModule('firewall', score);
        UI.updateBadge('firewall');
        UI.showScore({ emoji: '🔥', title: 'Firewall Wizard!', sub: `${score}/${total} correct — Azure Firewall mastered.`, xp: score * 20 });
      }
    });

    bindPolicyGame();
  }

  return { render, mount };
})();

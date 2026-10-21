/* ═══════════════════════════════════════════════════════
   Module: NSG & Security Rules
   ═══════════════════════════════════════════════════════ */

const NSGModule = (() => {

  const QUIZ = [
    {
      question: 'NSG rules are evaluated in order of priority. Lower numbers = higher priority. Which rule wins when two rules conflict?',
      options: [
        'The rule with the higher priority number',
        'The rule with the lower priority number (evaluated first)',
        'Deny rules always win regardless of priority',
        'Allow rules always win regardless of priority'
      ],
      correct: 1,
      explanation: 'NSG rules are processed from lowest number to highest (100 before 200 before 65000). The first matching rule wins. Azure has three default rules at priority 65000–65500 that always exist at the bottom.'
    },
    {
      question: 'Your Databricks host subnet has an NSG. A VM sends a request to ADLS Gen2. The NSG has no rule for this traffic. What happens?',
      options: [
        'Traffic is allowed — the default is allow-all',
        'Traffic is denied — NSGs default-deny all inbound',
        'Traffic is denied — NSGs default-deny all outbound by default via the DenyAllOutbound rule at priority 65500',
        'Traffic is allowed — the DenyAllOutbound rule only blocks internet traffic'
      ],
      correct: 3,
      explanation: 'NSGs have a default "DenyAllOutBound" rule at priority 65500 that blocks all outbound except what is explicitly allowed. However, there is also a "AllowVnetOutBound" rule at 65000 that permits traffic to the VirtualNetwork service tag — which includes Private Endpoints inside your VNet. So ADLS traffic via Private Endpoint flows!'
    },
    {
      question: 'What is an NSG "service tag" and why is it useful?',
      options: [
        'A label for grouping NSGs by cost centre',
        'A named group of IP prefixes for Azure services, updated automatically by Microsoft',
        'A tag on an Azure resource for billing purposes',
        'A VLAN tag for L2 traffic isolation'
      ],
      correct: 1,
      explanation: 'Service tags (like "AzureDataFactory", "Storage", "AzureMonitor") represent the IP ranges of Azure services. Microsoft keeps them updated — you don't need to maintain IP lists. This is essential for allowing ADF SHIR to reach its control plane.'
    },
    {
      question: 'NSGs are stateful. What does this mean for a TCP connection?',
      options: [
        'You must create both an inbound and outbound rule for every connection',
        'Azure tracks the connection — return traffic is automatically allowed without a matching outbound rule',
        'NSGs only track state for UDP, not TCP',
        'Stateful means NSG rules persist after the resource is deleted'
      ],
      correct: 1,
      explanation: 'NSGs are stateful — if you allow inbound TCP:443 to a VM, the return traffic (TCP response from VM back to client) is automatically permitted. You do NOT need a matching outbound rule. This is identical to AWS Security Groups.'
    },
    {
      question: 'For Databricks VNet injection, which NSG rule must exist on both host and container subnets?',
      options: [
        'Allow all inbound from the internet on port 443',
        'Allow inbound and outbound between the two Databricks subnets on all ports',
        'Deny all outbound traffic except to Azure Storage',
        'Allow inbound from AzureLoadBalancer service tag on port 80'
      ],
      correct: 1,
      explanation: 'Databricks clusters need to communicate internally between the host subnet (driver) and container subnet (workers) on all ports. Without this rule, cluster creation will fail. Microsoft also requires AzureLoadBalancer inbound allow for health probes.'
    },
  ];

  // Rule builder game
  const RULE_CHALLENGES = [
    {
      title: 'Allow HTTPS from the internet to Azure Firewall only',
      hint: 'Source: Internet, Destination: AzureFirewall IP, Port: 443',
      check: r => r.source === 'Internet' && r.port === '443' && r.action === 'Allow',
    },
    {
      title: 'Block all inbound SSH (port 22) from any source',
      hint: 'Source: Any, Protocol: TCP, Port: 22, Action: Deny',
      check: r => r.port === '22' && r.action === 'Deny',
    },
    {
      title: 'Allow Databricks host subnet to reach container subnet on all ports',
      hint: 'Source: host subnet CIDR, Destination: container subnet CIDR, Port: *',
      check: r => r.port === '*' && r.action === 'Allow' && r.source.includes('10.2'),
    },
  ];

  let ruleChallenge = 0;
  let rules = [];

  function renderRuleGame() {
    const c = RULE_CHALLENGES[ruleChallenge % RULE_CHALLENGES.length];
    return `
      <div class="game-wrapper">
        <div class="game-topbar">
          <div class="game-topbar-title">🛡️ NSG Rule Builder</div>
          <div class="game-topbar-meta"><span>⭐ 50 XP per challenge</span></div>
        </div>
        <div class="game-body">
          <div class="callout" style="margin-bottom:16px">
            <strong>Challenge:</strong> ${c.title}<br>
            <span style="font-size:13px;opacity:.8">Hint: ${c.hint}</span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">PRIORITY</label>
              <input id="rule-priority" type="number" value="200" min="100" max="4096"
                style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px">
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">ACTION</label>
              <select id="rule-action" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px">
                <option>Allow</option><option>Deny</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">DIRECTION</label>
              <select id="rule-dir" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px">
                <option>Inbound</option><option>Outbound</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">PROTOCOL</label>
              <select id="rule-protocol" style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px">
                <option>TCP</option><option>UDP</option><option value="*">Any</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">SOURCE</label>
              <input id="rule-source" value="Internet" placeholder="IP / Service Tag / *"
                style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px">
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-sub);display:block;margin-bottom:4px">DEST PORT</label>
              <input id="rule-port" value="443" placeholder="80 / 443 / 22 / *"
                style="width:100%;padding:8px;border:1.5px solid var(--border2);border-radius:6px;font-size:14px">
            </div>
          </div>

          <button class="btn btn-primary" id="rule-check">✓ Check Rule</button>
          <div id="rule-feedback" style="margin-top:12px;display:none"></div>
        </div>
      </div>
    `;
  }

  function render() {
    return `
      <div class="module-header">
        <div class="module-eyebrow">Module 3</div>
        <div class="module-title">🛡️ NSG & Security Rules</div>
        <div class="module-desc">Network Security Groups are Azure's built-in traffic police. They sit on subnets (or individual NICs) and evaluate every packet against a priority-ordered list of rules.</div>
      </div>

      <div class="tab-bar">
        <div class="tab active" data-tab="learn">📖 Learn</div>
        <div class="tab" data-tab="game">🎮 Quiz</div>
        <div class="tab" data-tab="lab">🧪 Rule Builder</div>
      </div>

      <!-- LEARN -->
      <div class="tab-panel active" id="panel-learn">

        <div class="card">
          <h3>What is an NSG?</h3>
          <p>A Network Security Group (NSG) is a stateful, layer-4 firewall attached to either a subnet or a VM's NIC. It contains a list of rules that each ALLOW or DENY traffic based on IP, port, and protocol.</p>

          <div class="analogy">
            <span class="analogy-label">👮 Real-Life Analogy</span>
            An NSG is like a bouncer at each floor of your office building (subnet). Each bouncer has a clipboard (rule list) sorted by priority. They check every visitor: "Where are you from? Where are you going? Which door?" The first rule that matches decides: in or out. If nothing matches, the default rule at the bottom says "no entry."
          </div>
        </div>

        <div class="card">
          <h3>NSG Rule Anatomy</h3>
          <p>Every NSG rule has 5 fields:</p>
          <table>
            <tr><th>Field</th><th>Example</th><th>What it means</th></tr>
            <tr><td><strong>Priority</strong></td><td><code>200</code></td><td>100–4096 — lower = evaluated first</td></tr>
            <tr><td><strong>Source</strong></td><td><code>Internet</code>, <code>10.2.0.0/22</code>, <code>VirtualNetwork</code></td><td>Where traffic comes from</td></tr>
            <tr><td><strong>Destination</strong></td><td><code>10.1.0.0/24</code>, <code>Storage</code>, <code>*</code></td><td>Where traffic goes</td></tr>
            <tr><td><strong>Protocol / Port</strong></td><td><code>TCP:443</code>, <code>*:*</code></td><td>Protocol and port range</td></tr>
            <tr><td><strong>Action</strong></td><td><code>Allow</code> / <code>Deny</code></td><td>What happens if the rule matches</td></tr>
          </table>
        </div>

        <div class="card">
          <h3>Default NSG Rules (Always Present)</h3>
          <p>Every NSG starts with three inbound and three outbound default rules that cannot be deleted:</p>
          <table>
            <tr><th>Priority</th><th>Name</th><th>Direction</th><th>Source→Dest</th><th>Action</th></tr>
            <tr><td>65000</td><td>AllowVNetInBound</td><td>In</td><td>VirtualNetwork→VirtualNetwork</td><td style="color:var(--green);font-weight:700">Allow</td></tr>
            <tr><td>65001</td><td>AllowAzureLBInBound</td><td>In</td><td>AzureLoadBalancer→Any</td><td style="color:var(--green);font-weight:700">Allow</td></tr>
            <tr><td>65500</td><td>DenyAllInBound</td><td>In</td><td>Any→Any</td><td style="color:var(--red);font-weight:700">Deny</td></tr>
            <tr><td>65000</td><td>AllowVNetOutBound</td><td>Out</td><td>VirtualNetwork→VirtualNetwork</td><td style="color:var(--green);font-weight:700">Allow</td></tr>
            <tr><td>65001</td><td>AllowInternetOutBound</td><td>Out</td><td>Any→Internet</td><td style="color:var(--green);font-weight:700">Allow</td></tr>
            <tr><td>65500</td><td>DenyAllOutBound</td><td>Out</td><td>Any→Any</td><td style="color:var(--red);font-weight:700">Deny</td></tr>
          </table>
          <div class="warn">
            <strong>⚠️ AllowInternetOutBound at priority 65001!</strong> By default, VMs can reach the internet. In your architecture this is overridden — a custom NSG rule + UDR forces all internet-bound traffic through the Azure Firewall instead.
          </div>
        </div>

        <div class="card">
          <h3>NSG for Databricks VNet Injection</h3>
          <p>Databricks has specific NSG requirements or cluster creation will silently fail. These rules must exist on BOTH the host and container subnets:</p>
          <table>
            <tr><th>Priority</th><th>Direction</th><th>Source</th><th>Dest</th><th>Port</th><th>Action</th></tr>
            <tr><td>100</td><td>Inbound</td><td><code>10.2.0.0/22</code> (host)</td><td><code>10.2.4.0/22</code> (container)</td><td>*</td><td style="color:var(--green);font-weight:700">Allow</td></tr>
            <tr><td>101</td><td>Inbound</td><td><code>10.2.4.0/22</code> (container)</td><td><code>10.2.0.0/22</code> (host)</td><td>*</td><td style="color:var(--green);font-weight:700">Allow</td></tr>
            <tr><td>110</td><td>Inbound</td><td>AzureLoadBalancer</td><td>*</td><td>*</td><td style="color:var(--green);font-weight:700">Allow</td></tr>
            <tr><td>100</td><td>Outbound</td><td><code>10.2.0.0/22</code></td><td><code>10.2.4.0/22</code></td><td>*</td><td style="color:var(--green);font-weight:700">Allow</td></tr>
            <tr><td>110</td><td>Outbound</td><td>*</td><td>AzureDatabricks</td><td>443</td><td style="color:var(--green);font-weight:700">Allow</td></tr>
            <tr><td>120</td><td>Outbound</td><td>*</td><td>Storage</td><td>443</td><td style="color:var(--green);font-weight:700">Allow</td></tr>
          </table>

          <div class="arch-box">
            <span class="arch-label">🏗️ In Your Migration</span>
            Without the subnet-to-subnet allow rules, Databricks cluster creation appears to succeed in the portal but the cluster will fail to start (nodes can't communicate). This is a very common gotcha during VNet injection setup. The AzureDatabricks outbound rule lets nodes register with the Databricks control plane.
          </div>
        </div>

      </div>

      <!-- QUIZ -->
      <div class="tab-panel" id="panel-game">
        <div class="game-wrapper">
          <div class="game-topbar">
            <div class="game-topbar-title">🎮 NSG Quiz</div>
            <div class="game-topbar-meta"><span>⭐ 20 XP per question</span><span>5 Questions</span></div>
          </div>
          <div class="game-body" id="quiz-nsg"></div>
        </div>
      </div>

      <!-- RULE BUILDER -->
      <div class="tab-panel" id="panel-lab">
        <div id="rule-game-container">${renderRuleGame()}</div>
      </div>
    `;
  }

  function mount(container) {
    UI.initTabs(container);

    UI.buildQuiz({
      id: 'quiz-nsg',
      questions: QUIZ,
      xpPerQuestion: 20,
      moduleId: 'nsg',
      onComplete: (score, total) => {
        State.completeModule('nsg', score);
        UI.updateBadge('nsg');
        UI.showScore({ emoji: '🛡️', title: 'NSG Guardian!', sub: `${score}/${total} correct — security rules mastered.`, xp: score * 20 });
      }
    });

    // Rule builder
    function bindRuleGame() {
      const checkBtn = document.getElementById('rule-check');
      if (!checkBtn) return;
      checkBtn.addEventListener('click', () => {
        const rule = {
          action: document.getElementById('rule-action').value,
          source: document.getElementById('rule-source').value,
          port: document.getElementById('rule-port').value,
          priority: document.getElementById('rule-priority').value,
        };
        const c = RULE_CHALLENGES[ruleChallenge % RULE_CHALLENGES.length];
        const fb = document.getElementById('rule-feedback');
        fb.style.display = 'block';
        if (c.check(rule)) {
          fb.className = 'quiz-feedback show ok';
          fb.innerHTML = `<strong>✓ Correct rule!</strong> Great work — this NSG rule correctly addresses the challenge. +50 XP`;
          UI.awardXP(50, checkBtn);
          ruleChallenge++;
          State.completeModule('nsg-lab', ruleChallenge);
          setTimeout(() => {
            document.getElementById('rule-game-container').innerHTML = renderRuleGame();
            bindRuleGame();
          }, 2000);
        } else {
          fb.className = 'quiz-feedback show bad';
          fb.innerHTML = `<strong>✗ Not quite.</strong> Re-read the challenge and hint. Check your Source, Port, and Action fields.`;
        }
      });
    }
    bindRuleGame();
  }

  return { render, mount };
})();

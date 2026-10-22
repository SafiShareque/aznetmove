/* ═══════════════════════════════════════════════════════
   Module: Network Groups (Azure Virtual Network Manager)
   ═══════════════════════════════════════════════════════ */

const NetGroupsModule = (() => {

  const QUIZ = [
    {
      question: 'What problem does Azure Virtual Network Manager (AVNM) solve that manual VNet peering does not?',
      options: [
        'It provides faster peering than standard VNet peering',
        'It lets you manage and apply policies to groups of VNets at scale from a single control plane',
        'It enables transitive routing between spokes without a hub',
        'It replaces NSGs with a more modern security model'
      ],
      correct: 1,
      explanation: 'AVNM solves the management problem: when you have 50+ VNets across subscriptions, managing peering and policies manually becomes error-prone. AVNM groups VNets into "network groups" and lets you apply connectivity and security configurations centrally.'
    },
    {
      question: 'In AVNM, what is a "Network Group"?',
      options: [
        'A set of NSG rules shared across subnets',
        'A logical grouping of VNets to which you apply topology and security configurations',
        'A group of IP addresses for firewall whitelisting',
        'An Azure resource group that contains network resources'
      ],
      correct: 1,
      explanation: 'A Network Group in AVNM is a logical collection of VNets. You can add VNets statically or define dynamic membership rules (e.g., "all VNets tagged with env:prod"). You then apply Connectivity Configurations and Security Admin Configurations to the group.'
    },
    {
      question: 'AVNM Security Admin Rules differ from NSG rules in one key way. What is it?',
      options: [
        'Security Admin Rules support UDP while NSGs only support TCP',
        'Security Admin Rules are enforced at scale across all VNets in the group and cannot be overridden by individual NSG rules at lower priority',
        'Security Admin Rules only work with Azure Firewall Premium',
        'Security Admin Rules replace UDRs for routing policy'
      ],
      correct: 1,
      explanation: 'Security Admin Rules in AVNM override individual NSG rules when set to higher priority. This lets your central network team enforce non-negotiable policy (e.g., "never allow port 22 from internet across any spoke") that app teams cannot accidentally bypass with their own NSGs.'
    },
    {
      question: 'Which AVNM configuration type manages VNet peering topology?',
      options: [
        'Routing Configuration',
        'Security Admin Configuration',
        'Connectivity Configuration',
        'DNS Configuration'
      ],
      correct: 2,
      explanation: 'Connectivity Configuration in AVNM defines the topology — Hub-and-Spoke or Mesh — and automatically creates and manages VNet peering between VNets in the network group. This replaces manually creating peering connections one by one.'
    },
    {
      question: 'Your migration spans 3 subscriptions: Networking, Data, and Compute. You want to peer all spoke VNets to the hub. What is the easiest AVNM approach?',
      options: [
        'Create individual peering connections in each subscription',
        'Create an AVNM instance at Management Group scope, define a network group across subscriptions, apply Hub-Spoke connectivity configuration',
        'Use ExpressRoute to connect subscriptions instead of peering',
        'AVNM does not support cross-subscription VNet management'
      ],
      correct: 1,
      explanation: 'AVNM works at Management Group scope, meaning it can see VNets across multiple subscriptions and apply configurations. A Hub-Spoke Connectivity Configuration automatically creates all required peering connections — you define the hub VNet and the spoke group once.'
    },
  ];

  // Drag-and-drop: assign VNets to correct network groups
  const VNETS = [
    { id: 'vnet-hub',     name: 'Hub VNet (10.0.0.0/16)',      tags: 'env:prod, role:hub', group: 'hub' },
    { id: 'vnet-data',    name: 'Data Spoke (10.1.0.0/16)',     tags: 'env:prod, role:data', group: 'spoke' },
    { id: 'vnet-compute', name: 'Compute Spoke (10.2.0.0/16)',  tags: 'env:prod, role:compute', group: 'spoke' },
    { id: 'vnet-mgmt',    name: 'Mgmt Spoke (10.3.0.0/16)',     tags: 'env:prod, role:mgmt', group: 'spoke' },
    { id: 'vnet-dev',     name: 'Dev VNet (10.4.0.0/16)',       tags: 'env:dev', group: 'dev' },
  ];

  let placed = {};
  let dragId = null;

  function renderGame() {
    return `
      <div class="game-wrapper">
        <div class="game-topbar">
          <div class="game-topbar-title">🔗 Network Group Classifier</div>
          <div class="game-topbar-meta"><span>⭐ 60 XP on completion</span></div>
        </div>
        <div class="game-body">
          <p style="margin-bottom:16px;color:var(--text-sub)">Drag each VNet into the correct Network Group — or tap a VNet, then tap a group. Use the tags to decide!</p>

          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px">
            ${VNETS.map(v => `
              <div class="drag-chip ${placed[v.id] ? 'placed' : ''}"
                   draggable="${!placed[v.id]}"
                   data-id="${v.id}"
                   id="chip-${v.id}">
                🔷 ${v.name.split(' ')[0]} <small style="font-size:10px;opacity:.7">${v.tags}</small>
              </div>
            `).join('')}
          </div>

          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${[
              { id: 'hub',   label: '🔷 Hub Group', desc: 'Shared services VNets' },
              { id: 'spoke', label: '📡 Prod Spoke Group', desc: 'Production workload spokes' },
              { id: 'dev',   label: '🧪 Dev Group', desc: 'Non-production VNets' },
            ].map(g => `
              <div style="flex:1;min-width:180px">
                <div style="font-size:13px;font-weight:700;margin-bottom:6px">${g.label}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${g.desc}</div>
                <div class="drag-zone" id="zone-${g.id}" data-group="${g.id}">
                  <span class="drag-zone-empty">Drop VNets here</span>
                </div>
              </div>
            `).join('')}
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
            <button class="btn btn-secondary" id="ng-reset">↩ Reset</button>
            <button class="btn btn-primary" id="ng-check">✓ Check Groups</button>
          </div>
          <div id="ng-feedback" style="margin-top:12px;display:none"></div>
        </div>
      </div>
    `;
  }

  function render() {
    return `
      <div class="module-header">
        <div class="module-eyebrow">Module 5</div>
        <div class="module-title">🔗 Network Groups & AVNM</div>
        <div class="module-desc">When you have dozens of VNets across subscriptions, Azure Virtual Network Manager (AVNM) lets you manage topology and security policies at scale — without clicking through every VNet individually.</div>
      </div>

      <div class="tab-bar">
        <div class="tab active" data-tab="learn">📖 Learn</div>
        <div class="tab" data-tab="game">🎮 Quiz</div>
        <div class="tab" data-tab="lab">🎮 VNet Grouping Game</div>
      </div>

      <!-- LEARN -->
      <div class="tab-panel active" id="panel-learn">

        <div class="card">
          <h3>The Scale Problem</h3>
          <p>Imagine you have 50 VNets across 10 subscriptions and 3 regions. You need:</p>
          <ul style="font-size:14px;line-height:2.2;padding-left:20px">
            <li>Hub-spoke peering for all of them</li>
            <li>A security policy: "No SSH from internet" applied everywhere</li>
            <li>The ability to add a new spoke and automatically connect it to the hub</li>
          </ul>
          <p style="margin-top:12px">Doing this manually = 50 peering connections + 50 NSG updates + error-prone procedures. This is the problem AVNM solves.</p>

          <div class="analogy">
            <span class="analogy-label">🏙️ Real-Life Analogy</span>
            Think of AVNM as a city planning authority. Individual buildings (VNets) can have their own floor plans (NSGs, UDRs). But the city authority sets the master plan: which roads connect which districts (peering topology), and city-wide rules like "no skyscrapers in the heritage zone" (security admin rules that no individual building owner can override).
          </div>
        </div>

        <div class="card">
          <h3>AVNM Architecture</h3>
          <table>
            <tr><th>Component</th><th>What it does</th></tr>
            <tr><td><strong>AVNM Instance</strong></td><td>Top-level resource, scoped to a subscription or management group</td></tr>
            <tr><td><strong>Network Group</strong></td><td>Logical collection of VNets (static membership or dynamic via Azure Policy)</td></tr>
            <tr><td><strong>Connectivity Configuration</strong></td><td>Hub-spoke or mesh topology — auto-creates VNet peering</td></tr>
            <tr><td><strong>Security Admin Configuration</strong></td><td>High-priority security rules pushed to all VNets in the group</td></tr>
            <tr><td><strong>Deployment</strong></td><td>Configurations don't take effect until explicitly deployed to a region</td></tr>
          </table>
        </div>

        <div class="card">
          <h3>Hub-Spoke vs Mesh Topology in AVNM</h3>
          <div class="grid-2">
            <div>
              <h4>Hub-and-Spoke</h4>
              <ul style="font-size:14px;line-height:2;padding-left:16px">
                <li>You designate one VNet as Hub</li>
                <li>All others connect to Hub only</li>
                <li>Direct spoke-to-spoke peering: optional</li>
                <li>Your architecture uses this pattern</li>
                <li>Hub VNet must exist before applying config</li>
              </ul>
            </div>
            <div>
              <h4>Mesh</h4>
              <ul style="font-size:14px;line-height:2;padding-left:16px">
                <li>Every VNet peers with every other VNet</li>
                <li>No hub required</li>
                <li>Good for peer-to-peer collaboration scenarios</li>
                <li>Can get expensive at scale (N² connections)</li>
                <li>AVNM manages all connections automatically</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="card">
          <h3>Security Admin Rules vs NSG Rules</h3>
          <table>
            <tr><th>Feature</th><th>NSG Rules</th><th>Security Admin Rules</th></tr>
            <tr><td>Scope</td><td>One subnet or NIC</td><td>All VNets in network group</td></tr>
            <tr><td>Managed by</td><td>App teams (per-resource)</td><td>Central network team</td></tr>
            <tr><td>Can be overridden?</td><td>Higher-priority NSG rule wins</td><td>❌ Cannot be overridden by NSGs</td></tr>
            <tr><td>Actions</td><td>Allow / Deny</td><td>Allow / Deny / AlwaysAllow</td></tr>
            <tr><td>Statefulness</td><td>Stateful (return traffic auto-allowed)</td><td>Stateless (must define both directions)</td></tr>
          </table>

          <div class="arch-box">
            <span class="arch-label">🏗️ In Your Migration</span>
            As you migrate from Cloudera to Azure, you'll start with 4 VNets and may grow to 10+ as you add dev/staging environments and new regions. AVNM means the central network team (your platform team) defines the hub-spoke topology once, and each new spoke VNet automatically connects correctly without ticket-driven peering requests.
          </div>
        </div>

      </div>

      <!-- QUIZ -->
      <div class="tab-panel" id="panel-game">
        <div class="game-wrapper">
          <div class="game-topbar">
            <div class="game-topbar-title">🎮 Network Groups Quiz</div>
            <div class="game-topbar-meta"><span>⭐ 20 XP per question</span><span>5 Questions</span></div>
          </div>
          <div class="game-body" id="quiz-netgroups"></div>
        </div>
      </div>

      <!-- GROUPING GAME -->
      <div class="tab-panel" id="panel-lab">
        <div id="ng-game-wrap">${renderGame()}</div>
      </div>
    `;
  }

  function mountGame(wrap) {
    placed = {};
    dragId = null;

    // Drag from chips
    wrap.querySelectorAll('.drag-chip').forEach(chip => {
      chip.addEventListener('dragstart', e => { dragId = chip.dataset.id; chip.style.opacity = '.5'; });
      chip.addEventListener('dragend', e => { chip.style.opacity = ''; });
    });

    // Tap-to-place (touch screens): tap a chip, then tap a zone
    let selectedId = null;
    wrap.querySelectorAll('.drag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (placed[chip.dataset.id]) return;
        const same = selectedId === chip.dataset.id;
        wrap.querySelectorAll('.drag-chip.selected').forEach(c => c.classList.remove('selected'));
        selectedId = same ? null : chip.dataset.id;
        if (selectedId) chip.classList.add('selected');
        wrap.querySelectorAll('.drag-zone').forEach(z => z.classList.toggle('armed', !!selectedId));
      });
    });

    function placeChip(id, zone) {
      const v = VNETS.find(x => x.id === id);
      if (!v) return;
      // Move chip into zone
      const chip = document.getElementById('chip-' + id);
      if (chip) {
        const clone = chip.cloneNode(true);
        clone.classList.remove('selected');
        clone.setAttribute('draggable', 'false');
        clone.classList.add('placed');
        zone.querySelector('.drag-zone-empty')?.remove();
        zone.appendChild(clone);
        chip.remove();
      }
      placed[id] = zone.dataset.group;
    }

    // Drop zones
    wrap.querySelectorAll('.drag-zone').forEach(zone => {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('over');
        if (!dragId) return;
        placeChip(dragId, zone);
        dragId = null;
      });
      zone.addEventListener('click', () => {
        if (!selectedId) return;
        placeChip(selectedId, zone);
        selectedId = null;
        wrap.querySelectorAll('.drag-zone').forEach(z => z.classList.remove('armed'));
      });
    });

    // Check
    wrap.querySelector('#ng-check').addEventListener('click', () => {
      let correct = 0;
      VNETS.forEach(v => {
        if (placed[v.id] === v.group) correct++;
      });
      const fb = wrap.querySelector('#ng-feedback');
      fb.style.display = 'block';
      const allPlaced = Object.keys(placed).length === VNETS.length;
      if (!allPlaced) {
        fb.className = 'quiz-feedback show bad';
        fb.innerHTML = `<strong>Place all ${VNETS.length} VNets first.</strong> You've placed ${Object.keys(placed).length} so far.`;
        return;
      }
      if (correct === VNETS.length) {
        fb.className = 'quiz-feedback show ok';
        fb.innerHTML = `<strong>✓ Perfect!</strong> All VNets correctly grouped. +60 XP`;
        UI.awardXP(60, wrap.querySelector('#ng-check'));
        State.completeModule('netgroups', VNETS.length);
        UI.updateBadge('netgroups');
      } else {
        fb.className = 'quiz-feedback show bad';
        fb.innerHTML = `<strong>✗ ${correct}/${VNETS.length} correct.</strong> Check the VNet tags — env:prod spokes go in the Prod Spoke Group.`;
      }
    });

    wrap.querySelector('#ng-reset').addEventListener('click', () => {
      wrap.innerHTML = renderGame();
      mountGame(wrap);
    });
  }

  function mount(container) {
    UI.initTabs(container);

    UI.buildQuiz({
      id: 'quiz-netgroups',
      questions: QUIZ,
      xpPerQuestion: 20,
      moduleId: 'netgroups',
      onComplete: (score, total) => {
        State.completeModule('netgroups', score);
        UI.updateBadge('netgroups');
        UI.showScore({ emoji: '🔗', title: 'Network Manager Pro!', sub: `${score}/${total} correct — AVNM mastered.`, xp: score * 20 });
      }
    });

    const wrap = document.getElementById('ng-game-wrap');
    if (wrap) mountGame(wrap);
  }

  return { render, mount };
})();

/* ═══════════════════════════════════════════════════════
   Module: DNS & Private Zones
   ═══════════════════════════════════════════════════════ */

const DnsModule = (() => {

  const QUIZ = [
    {
      question: 'You create a Private Endpoint for your ADLS account. Without any DNS configuration, what happens when Databricks tries to connect to mystorageaccount.dfs.core.windows.net?',
      options: [
        'It automatically resolves to the private IP because PE intercepts DNS',
        'It resolves to the PUBLIC IP of ADLS — the Private Endpoint is bypassed',
        'DNS resolution fails completely',
        'It resolves to the Private Endpoint IP through Azure\'s built-in DNS'
      ],
      correct: 1,
      explanation: 'Without a Private DNS Zone, public DNS still returns ADLS\'s public IP. The Private Endpoint NIC (10.1.0.5) exists in your VNet, but nothing is telling DNS to use it. Your traffic goes to the public endpoint — which may still work if you haven\'t disabled public access, but defeats the purpose of the PE entirely.'
    },
    {
      question: 'What is an Azure Private DNS Zone?',
      options: [
        'A DNS server you deploy in your VNet',
        'An Azure-managed DNS zone linked to VNets that overrides public DNS resolution for specific FQDNs',
        'A feature that blocks all public DNS lookups from your VNet',
        'A DNS zone used only for on-premises name resolution'
      ],
      correct: 1,
      explanation: 'Azure Private DNS Zones are hosted DNS zones (like privatelink.dfs.core.windows.net) that you link to your VNets. When a VM in a linked VNet resolves mystorageaccount.dfs.core.windows.net, Azure\'s internal resolver checks the Private DNS Zone first and returns the private IP (10.1.0.5) instead of the public one.'
    },
    {
      question: 'Which Private DNS Zone is required for ADLS Gen2 (Data Lake Storage) Private Endpoints?',
      options: [
        'privatelink.blob.core.windows.net',
        'privatelink.dfs.core.windows.net',
        'privatelink.file.core.windows.net',
        'privatelink.azuredatalakestore.net'
      ],
      correct: 1,
      explanation: 'ADLS Gen2 uses the Data Lake Storage (DFS) endpoint: .dfs.core.windows.net. The corresponding Private DNS Zone is privatelink.dfs.core.windows.net. Note: if your app also uses blob API for the same account, you need privatelink.blob.core.windows.net as a second zone.'
    },
    {
      question: 'Your architecture has a Hub VNet and 3 Spoke VNets. You create Private Endpoints for ADLS in the Data Spoke. How should DNS be configured?',
      options: [
        'Create a Private DNS Zone per VNet — 4 zones total',
        'Create one Private DNS Zone, link it to ALL VNets (Hub + all Spokes)',
        'Create the zone only in the Data Spoke — other spokes use public DNS',
        'Deploy a custom DNS server in the Hub to forward queries'
      ],
      correct: 1,
      explanation: 'One Private DNS Zone per service, linked to ALL VNets that need to resolve it. This way, whether the query comes from the Compute Spoke (Databricks), Hub (Firewall health checks), or Mgmt Spoke (admin tools), they all get the correct private IP. Missing a VNet link means that VNet falls back to public DNS.'
    },
    {
      question: 'On-premises servers (connected via ExpressRoute) need to resolve your ADLS private endpoint. What additional configuration is required?',
      options: [
        'Nothing — ExpressRoute automatically uses Azure Private DNS',
        'A DNS Forwarder VM in Azure that forwards on-prem queries to Azure DNS (168.63.129.16)',
        'A custom DNS server on-premises with static host entries',
        'ExpressRoute Gateway handles DNS forwarding automatically'
      ],
      correct: 1,
      explanation: 'Azure\'s internal resolver (168.63.129.16) is only accessible from WITHIN Azure VNets. On-premises DNS cannot reach it directly. Solution: deploy a DNS Private Resolver (or a simple DNS forwarder VM) in Azure, configure on-prem DNS to forward *.privatelink.* queries to it, and the forwarder queries 168.63.129.16 within Azure and returns the private IP.'
    },
  ];

  // DNS resolution builder game
  const ZONES = [
    { id: 'adls', fqdn: 'mystorageaccount.dfs.core.windows.net', zone: 'privatelink.dfs.core.windows.net', privateIp: '10.1.0.5', service: 'ADLS Gen2' },
    { id: 'kv',   fqdn: 'mykeyvault.vault.azure.net',             zone: 'privatelink.vaultcore.azure.net', privateIp: '10.1.0.10', service: 'Key Vault' },
    { id: 'sql',  fqdn: 'mysqlserver.database.windows.net',       zone: 'privatelink.database.windows.net', privateIp: '10.1.0.15', service: 'Azure SQL' },
    { id: 'acr',  fqdn: 'myregistry.azurecr.io',                  zone: 'privatelink.azurecr.io',           privateIp: '10.2.0.10', service: 'Container Registry' },
  ];

  // Shuffle zone names for matching
  const ZONE_NAMES = ZONES.map(z => z.zone);

  let answers = {};

  function renderGame() {
    const shuffled = [...ZONE_NAMES].sort(() => Math.random() - 0.5);
    return `
      <div class="game-wrapper">
        <div class="game-topbar">
          <div class="game-topbar-title">🗺️ Private DNS Zone Mapper</div>
          <div class="game-topbar-meta"><span>⭐ 25 XP per correct match</span></div>
        </div>
        <div class="game-body">
          <p style="color:var(--text-sub);font-size:13px;margin-bottom:16px">
            Match each Azure service's FQDN to its correct Private DNS Zone. This determines which zone you must create to make Private Endpoint DNS resolution work.
          </p>

          <div style="background:var(--bg-alt);border-radius:10px;padding:14px;margin-bottom:16px;font-size:12px">
            <strong>Available DNS Zones:</strong>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
              ${shuffled.map(z => `<code style="background:var(--bg-card);padding:3px 8px;border-radius:4px;font-size:11px">${z}</code>`).join('')}
            </div>
          </div>

          ${ZONES.map(z => `
            <div class="card" style="margin-bottom:10px;padding:12px 16px" id="dns-row-${z.id}">
              <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                <div style="flex:1;min-width:200px">
                  <div style="font-weight:600;font-size:13px">${z.service}</div>
                  <code style="font-size:11px;color:var(--accent)">${z.fqdn}</code>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:240px">
                  <span style="font-size:11px;color:var(--text-muted);white-space:nowrap">→ DNS Zone:</span>
                  <select class="dns-select" data-id="${z.id}" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);font-size:12px;font-family:monospace">
                    <option value="">-- select zone --</option>
                    ${shuffled.map(name => `<option value="${name}">${name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div id="dns-fb-${z.id}" style="display:none;margin-top:8px;font-size:12px;padding:6px 10px;border-radius:5px"></div>
            </div>
          `).join('')}

          <div style="display:flex;justify-content:space-between;margin-top:12px">
            <button class="btn btn-secondary btn-sm" id="dns-reset">↩ Reset</button>
            <button class="btn btn-primary" id="dns-check">✓ Check Mappings</button>
          </div>
          <div id="dns-final" style="display:none;margin-top:14px"></div>
        </div>
      </div>
    `;
  }

  function render() {
    return `
      <div class="module-header">
        <div class="module-eyebrow">Module 9</div>
        <div class="module-title">🌐 DNS & Private Zones</div>
        <div class="module-desc">Private Endpoints solve the network path problem, but DNS is what makes them actually work. Without correct DNS configuration, your services still resolve to public IPs — defeating the purpose of Private Endpoints entirely. This is the most-missed step in Azure networking.</div>
      </div>

      <div class="tab-bar">
        <div class="tab active" data-tab="learn">📖 Learn</div>
        <div class="tab" data-tab="game">🎮 Quiz</div>
        <div class="tab" data-tab="lab">🧪 DNS Zone Mapper</div>
      </div>

      <!-- LEARN -->
      <div class="tab-panel active" id="panel-learn">

        <div class="card">
          <h3>Why DNS Matters for Private Endpoints</h3>
          <p>When you create a Private Endpoint for ADLS, Azure creates a NIC with IP 10.1.0.5. But your application still calls <code>mystorageaccount.dfs.core.windows.net</code>. DNS must return <strong>10.1.0.5</strong> for that name — not the public IP.</p>

          <div class="analogy">
            <span class="analogy-label">📞 Real-Life Analogy</span>
            A Private Endpoint is like opening a private hotline to the ADLS team inside your office. But if your phone book still lists the old public number, you'll call the wrong line. Azure Private DNS Zone is updating the office phone book so your colleagues look up the right (private) number automatically.
          </div>

          <div class="flow-diagram" style="margin-top:16px">
            <div class="flow-node subnet" style="white-space:pre-line">Databricks\nlooks up FQDN</div>
            <div class="flow-arrow"><div class="flow-arrow-label">DNS query</div></div>
            <div class="flow-node firewall" style="white-space:pre-line">Azure DNS\n168.63.129.16</div>
            <div class="flow-arrow"><div class="flow-arrow-label">Checks linked Private DNS Zones</div></div>
            <div class="flow-node resource" style="white-space:pre-line">Returns\n10.1.0.5 ✓</div>
          </div>
        </div>

        <div class="card">
          <h3>How Azure Private DNS Zones Work</h3>
          <ol style="font-size:14px;line-height:2.5;padding-left:20px">
            <li><strong>Create the zone</strong> — e.g. <code>privatelink.dfs.core.windows.net</code> as an Azure resource</li>
            <li><strong>Link it to your VNets</strong> — Hub, Data Spoke, Compute Spoke, Mgmt Spoke</li>
            <li><strong>Enable auto-registration</strong> — when creating the PE, let Azure auto-add the A record</li>
            <li><strong>A record auto-created</strong> — <code>mystorageaccount → 10.1.0.5</code></li>
            <li><strong>Resolution works</strong> — any VM in a linked VNet gets the private IP</li>
          </ol>

          <div class="code-block">
# Create Private DNS Zone
az network private-dns zone create \
  --resource-group rg-dns \
  --name "privatelink.dfs.core.windows.net"

# Link to Hub VNet
az network private-dns link vnet create \
  --resource-group rg-dns \
  --zone-name "privatelink.dfs.core.windows.net" \
  --name link-hub \
  --virtual-network vnet-hub \
  --registration-enabled false

# Link to Compute Spoke (Databricks lives here)
az network private-dns link vnet create \
  --resource-group rg-dns \
  --zone-name "privatelink.dfs.core.windows.net" \
  --name link-compute \
  --virtual-network vnet-compute \
  --registration-enabled false</div>
        </div>

        <div class="card">
          <h3>Private DNS Zones Reference: Your Architecture</h3>
          <table>
            <tr><th>Service</th><th>FQDN Pattern</th><th>Private DNS Zone</th></tr>
            <tr><td>ADLS Gen2 (DFS)</td><td>*.dfs.core.windows.net</td><td>privatelink.dfs.core.windows.net</td></tr>
            <tr><td>ADLS Gen2 (Blob)</td><td>*.blob.core.windows.net</td><td>privatelink.blob.core.windows.net</td></tr>
            <tr><td>Azure Key Vault</td><td>*.vault.azure.net</td><td>privatelink.vaultcore.azure.net</td></tr>
            <tr><td>Azure SQL Database</td><td>*.database.windows.net</td><td>privatelink.database.windows.net</td></tr>
            <tr><td>Azure Container Registry</td><td>*.azurecr.io</td><td>privatelink.azurecr.io</td></tr>
            <tr><td>Azure Databricks</td><td>*.azuredatabricks.net</td><td>privatelink.azuredatabricks.net</td></tr>
            <tr><td>Azure Service Bus</td><td>*.servicebus.windows.net</td><td>privatelink.servicebus.windows.net</td></tr>
            <tr><td>Synapse Analytics</td><td>*.azuresynapse.net</td><td>privatelink.azuresynapse.net</td></tr>
          </table>
        </div>

        <div class="card">
          <h3>On-Premises DNS Resolution</h3>
          <p>ExpressRoute clients on-premises CANNOT use Azure's internal resolver (168.63.129.16) directly — it's a virtual IP only reachable inside Azure. The solution in your architecture:</p>
          <div class="flow-diagram">
            <div class="flow-node internet" style="white-space:pre-line">On-Prem Server\nDNS lookup</div>
            <div class="flow-arrow"><div class="flow-arrow-label">Forward *.privatelink.* queries</div></div>
            <div class="flow-node subnet" style="white-space:pre-line">DNS Private Resolver\n10.0.2.4 (Hub VNet)</div>
            <div class="flow-arrow"><div class="flow-arrow-label">Query 168.63.129.16</div></div>
            <div class="flow-node firewall" style="white-space:pre-line">Azure DNS\nPrivate Zone lookup</div>
            <div class="flow-arrow"><div class="flow-arrow-label">Returns private IP</div></div>
            <div class="flow-node resource" style="white-space:pre-line">On-Prem gets\n10.1.0.5 ✓</div>
          </div>
          <p style="margin-top:12px;font-size:13px;color:var(--text-sub)">Azure DNS Private Resolver (preview → GA) replaces custom forwarder VMs. It's a managed service that accepts inbound DNS queries and forwards them through Azure DNS — cleaner, no VMs to maintain.</p>
        </div>

        <div class="card">
          <h3>Debugging DNS — Common Issues</h3>
          <table>
            <tr><th>Symptom</th><th>Likely Cause</th><th>Fix</th></tr>
            <tr><td>nslookup returns public IP</td><td>Private DNS Zone not linked to this VNet</td><td>Add VNet link to the zone</td></tr>
            <tr><td>PE created but no A record</td><td>Auto-registration not enabled during PE creation</td><td>Manually create A record in zone</td></tr>
            <tr><td>On-prem can't resolve</td><td>DNS forwarder not configured</td><td>Deploy DNS Private Resolver in Hub</td></tr>
            <tr><td>Works in Dev, not Prod</td><td>Missing VNet link in Prod subscription</td><td>Link zone to Prod VNets</td></tr>
            <tr><td>Databricks job fails with connection refused</td><td>Public access disabled but PE DNS not configured</td><td>Check DNS zone → verify A record exists</td></tr>
          </table>
          <div class="code-block">
# Test DNS resolution from a VM in your VNet
nslookup mystorageaccount.dfs.core.windows.net
# Should return: 10.1.0.5 (private IP)
# If returns: 52.239.x.x — DNS zone not linked!

# Dig with Azure DNS explicitly
dig mystorageaccount.dfs.core.windows.net @168.63.129.16</div>
        </div>

      </div>

      <!-- QUIZ -->
      <div class="tab-panel" id="panel-game">
        <div class="game-wrapper">
          <div class="game-topbar">
            <div class="game-topbar-title">🎮 DNS & Private Zones Quiz</div>
            <div class="game-topbar-meta"><span>⭐ 20 XP per question</span><span>5 Questions</span></div>
          </div>
          <div class="game-body" id="quiz-dns"></div>
        </div>
      </div>

      <!-- DNS MAPPER -->
      <div class="tab-panel" id="panel-lab">
        <div id="dns-game-wrap">${renderGame()}</div>
      </div>
    `;
  }

  function mountGame(wrap) {
    answers = {};

    wrap.querySelector('#dns-check').addEventListener('click', () => {
      let correct = 0;
      ZONES.forEach(z => {
        const sel = wrap.querySelector(`.dns-select[data-id="${z.id}"]`);
        const chosen = sel ? sel.value : '';
        const isCorrect = chosen === z.zone;
        if (isCorrect) correct++;

        const fb = document.getElementById(`dns-fb-${z.id}`);
        fb.style.display = 'block';
        fb.style.background = isCorrect ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)';
        fb.style.color = isCorrect ? 'var(--green)' : 'var(--red)';
        fb.textContent = isCorrect
          ? `✓ Correct! ${z.zone} maps ${z.service} to ${z.privateIp}.`
          : `✗ Correct answer: ${z.zone} (you chose: ${chosen || 'nothing'})`;
      });

      const final = document.getElementById('dns-final');
      final.style.display = 'block';
      if (correct === ZONES.length) {
        final.innerHTML = `<div class="quiz-feedback show ok"><strong>🎯 Perfect! All DNS zones correct.</strong> +${correct * 25} XP</div>`;
        UI.awardXP(correct * 25, wrap.querySelector('#dns-check'));
      } else {
        final.innerHTML = `<div class="quiz-feedback show bad"><strong>${correct}/${ZONES.length} correct.</strong> Review the Private DNS Zone reference table in the Learn tab.</div>`;
        if (correct > 0) UI.awardXP(correct * 25, wrap.querySelector('#dns-check'));
      }
      State.completeModule('dns', correct);
      UI.updateBadge('dns');
    });

    wrap.querySelector('#dns-reset').addEventListener('click', () => {
      wrap.innerHTML = renderGame();
      mountGame(wrap);
    });
  }

  function mount(container) {
    UI.initTabs(container);

    UI.buildQuiz({
      id: 'quiz-dns',
      questions: QUIZ,
      xpPerQuestion: 20,
      moduleId: 'dns',
      onComplete: (score, total) => {
        State.completeModule('dns', score);
        UI.updateBadge('dns');
        UI.showScore({ emoji: '🌐', title: 'DNS Master!', sub: `${score}/${total} correct — Private DNS unlocked.`, xp: score * 20 });
      }
    });

    const wrap = document.getElementById('dns-game-wrap');
    if (wrap) mountGame(wrap);
  }

  return { render, mount };
})();

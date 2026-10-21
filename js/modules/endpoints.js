/* ═══════════════════════════════════════════════════════
   Module: Private & Service Endpoints
   ═══════════════════════════════════════════════════════ */

const EndpointsModule = (() => {

  const QUIZ = [
    {
      question: 'What is a Private Endpoint in Azure?',
      options: [
        'A firewall rule that blocks public access to a resource',
        'A private IP address in your VNet that maps to a specific Azure PaaS service',
        'A VPN connection to Azure PaaS services',
        'A subnet reserved for Azure-managed services'
      ],
      correct: 1,
      explanation: 'A Private Endpoint is a NIC (network interface card) placed inside your VNet with a private IP address. It maps directly to a specific Azure PaaS resource (like an ADLS account). Traffic to that resource flows entirely within the Azure backbone — never over the public internet.'
    },
    {
      question: 'Your Databricks cluster needs to reach ADLS Gen2 without going over the internet. Which approach is correct?',
      options: [
        'Create a Service Endpoint on the Databricks subnet targeting Microsoft.Storage',
        'Create a Private Endpoint for the ADLS account in the Data Spoke VNet',
        'Open port 443 outbound on the NSG and allow public access on ADLS',
        'Enable "Allow trusted Microsoft services" on ADLS firewall'
      ],
      correct: 1,
      explanation: 'A Private Endpoint in the Data Spoke gives ADLS a private IP (e.g. 10.1.0.5). Databricks traffic to that IP travels through the Firewall via peering — never leaving the Azure backbone. Service Endpoints work but don\'t give a private IP and don\'t traverse Firewall rules the same way.'
    },
    {
      question: 'What is the KEY difference between a Service Endpoint and a Private Endpoint?',
      options: [
        'Service Endpoints are cheaper; Private Endpoints are more secure',
        'Service Endpoints extend your VNet identity to the service but keep the service\'s public IP; Private Endpoints give the service a private IP in your VNet',
        'Private Endpoints only work with Storage; Service Endpoints work with all PaaS services',
        'Service Endpoints require DNS changes; Private Endpoints do not'
      ],
      correct: 1,
      explanation: 'Service Endpoints extend your VNet\'s identity to the PaaS service (so the ADLS firewall can trust your subnet) but the service still has a public IP. Private Endpoints give the service a real private IP inside your VNet — accessible without public internet, and fully compatible with Azure Firewall inspection.'
    },
    {
      question: 'After creating a Private Endpoint for Azure SQL, your Databricks job cannot connect. The most likely cause is:',
      options: [
        'Private Endpoints don\'t support Azure SQL',
        'DNS is still resolving the SQL server\'s public FQDN to its public IP instead of the PE\'s private IP',
        'The Private Endpoint needs a separate NSG',
        'Databricks cannot use Private Endpoints'
      ],
      correct: 1,
      explanation: 'This is the #1 Private Endpoint gotcha. After creating a PE, you MUST configure Azure Private DNS Zone (privatelink.database.windows.net) to override the public DNS record. Without it, your.sql.database.windows.net resolves to the public IP, bypassing the Private Endpoint entirely.'
    },
    {
      question: 'Which Azure services in your architecture MOST BENEFIT from Private Endpoints?',
      options: [
        'Azure Firewall and Azure Bastion',
        'ADLS Gen2, Azure SQL, Azure Key Vault, and Azure Databricks (control plane)',
        'ExpressRoute Gateway and Virtual Network Gateway',
        'Network Security Groups and Route Tables'
      ],
      correct: 1,
      explanation: 'PaaS services with sensitive data benefit most: ADLS Gen2 (your data lake), Azure SQL (metadata store), Key Vault (secrets), and Databricks control plane communication. Firewall and Bastion are infrastructure services that don\'t expose private endpoints in the same way.'
    },
  ];

  // Endpoint builder game — match service to correct endpoint type + reason
  const SERVICES = [
    {
      id: 'adls',
      name: 'ADLS Gen2',
      icon: '🗄️',
      desc: 'Your data lake — stores all Spark job input/output',
      correctType: 'private',
      reason: 'Sensitive data; needs Firewall inspection; used across VNets — Private Endpoint gives it a stable private IP in Data Spoke.'
    },
    {
      id: 'keyvault',
      name: 'Azure Key Vault',
      icon: '🔑',
      desc: 'Stores Databricks secrets and service principal credentials',
      correctType: 'private',
      reason: 'Secrets store — never expose publicly. Private Endpoint ensures all access stays within the VNet and goes through Firewall.'
    },
    {
      id: 'acr',
      name: 'Azure Container Registry',
      icon: '📦',
      desc: 'Docker images for Databricks init scripts and MLflow containers',
      correctType: 'private',
      reason: 'Images may contain proprietary code. Private Endpoint prevents public pull — Databricks pulls from private IP only.'
    },
    {
      id: 'servicebus',
      name: 'Azure Service Bus',
      icon: '📨',
      desc: 'Message queue for pipeline orchestration events',
      correctType: 'private',
      reason: 'Messaging layer for internal pipelines — Private Endpoint preferred, though Service Endpoint works for simpler setups.'
    },
    {
      id: 'synapse',
      name: 'Synapse Serverless SQL',
      icon: '⚡',
      desc: 'Ad-hoc SQL queries over ADLS for Power BI',
      correctType: 'private',
      reason: 'Power BI can connect via Managed Private Endpoint from Power BI to Synapse. Keeps query traffic off the public internet.'
    },
  ];

  let placed = {};

  function renderGame() {
    return `
      <div class="game-wrapper">
        <div class="game-topbar">
          <div class="game-topbar-title">🔌 Endpoint Type Selector</div>
          <div class="game-topbar-meta"><span>⭐ 20 XP per correct answer</span></div>
        </div>
        <div class="game-body">
          <p style="color:var(--text-sub);font-size:13px;margin-bottom:16px">
            For each Azure service, choose: <strong>Private Endpoint</strong> (private IP in VNet) or <strong>Service Endpoint</strong> (subnet identity, public IP). In your architecture, which is correct?
          </p>

          <div id="ep-services">
            ${SERVICES.map(s => `
              <div class="card" style="margin-bottom:12px;padding:14px 16px" id="row-${s.id}">
                <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
                  <div style="font-size:24px">${s.icon}</div>
                  <div style="flex:1;min-width:180px">
                    <div style="font-weight:700;font-size:14px">${s.name}</div>
                    <div style="color:var(--text-sub);font-size:12px;margin-top:2px">${s.desc}</div>
                  </div>
                  <div style="display:flex;gap:8px;align-items:center">
                    <button class="btn btn-secondary btn-sm ep-choice" data-id="${s.id}" data-choice="private" id="btn-${s.id}-private">🔒 Private Endpoint</button>
                    <button class="btn btn-secondary btn-sm ep-choice" data-id="${s.id}" data-choice="service" id="btn-${s.id}-service">🏷️ Service Endpoint</button>
                  </div>
                </div>
                <div id="fb-${s.id}" style="display:none;margin-top:10px;font-size:13px;padding:8px 12px;border-radius:6px"></div>
              </div>
            `).join('')}
          </div>

          <div id="ep-final" style="display:none;margin-top:16px"></div>
        </div>
      </div>
    `;
  }

  function render() {
    return `
      <div class="module-header">
        <div class="module-eyebrow">Module 8</div>
        <div class="module-title">🔌 Private & Service Endpoints</div>
        <div class="module-desc">One of the most important decisions in your Azure architecture: how should Databricks reach ADLS, Key Vault, and Azure SQL — over the public internet, via Service Endpoints, or via Private Endpoints? This module explains the difference and helps you pick the right approach.</div>
      </div>

      <div class="tab-bar">
        <div class="tab active" data-tab="learn">📖 Learn</div>
        <div class="tab" data-tab="game">🎮 Quiz</div>
        <div class="tab" data-tab="lab">🧪 Endpoint Selector</div>
      </div>

      <!-- LEARN -->
      <div class="tab-panel active" id="panel-learn">

        <div class="card">
          <h3>The Problem: PaaS Services Have Public IPs</h3>
          <p>Azure PaaS services (ADLS, Key Vault, Azure SQL, etc.) are publicly hosted by default — they have public IP addresses and FQDN endpoints like <code>mystorageaccount.blob.core.windows.net</code>. Without intervention, traffic from your Databricks VM travels over the <strong>public internet</strong> to reach them.</p>

          <div class="analogy">
            <span class="analogy-label">📮 Real-Life Analogy</span>
            Imagine your office is in a secure corporate campus (your VNet). The company archives (ADLS) are normally stored in a public warehouse across town — anyone with a key can access them from anywhere. <strong>Service Endpoint</strong> is like giving the warehouse a list of "trusted couriers" (your subnet) — they still go through public streets, but the warehouse recognizes them. <strong>Private Endpoint</strong> is like moving a copy of the archive <em>inside your campus</em> — no one leaves the building, zero public exposure.
          </div>
        </div>

        <div class="card">
          <h3>Service Endpoints vs Private Endpoints</h3>
          <table>
            <tr><th>Feature</th><th>Service Endpoint</th><th>Private Endpoint</th></tr>
            <tr>
              <td>What changes</td>
              <td>Extends VNet subnet identity to service</td>
              <td>Creates a NIC with private IP in your VNet</td>
            </tr>
            <tr>
              <td>Service still has public IP?</td>
              <td>✅ Yes — public FQDN still resolves publicly</td>
              <td>❌ No — DNS overrides to private IP</td>
            </tr>
            <tr>
              <td>DNS change required?</td>
              <td>No</td>
              <td>Yes — Azure Private DNS Zone required</td>
            </tr>
            <tr>
              <td>Works across VNets?</td>
              <td>❌ Only from the configured subnet</td>
              <td>✅ Yes — via VNet peering</td>
            </tr>
            <tr>
              <td>Azure Firewall can inspect?</td>
              <td>⚠️ Partial — traffic bypasses Firewall for service</td>
              <td>✅ Yes — traffic routes through Firewall normally</td>
            </tr>
            <tr>
              <td>Cost</td>
              <td>Free</td>
              <td>~$7/month per endpoint + data processing</td>
            </tr>
            <tr>
              <td>Best for</td>
              <td>Simple single-subnet access, dev environments</td>
              <td>Production, cross-VNet, high security</td>
            </tr>
          </table>
        </div>

        <div class="card">
          <h3>Private Endpoints in Your Architecture</h3>
          <div class="arch-box">
            <span class="arch-label">🏗️ Your Private Endpoint Layout</span>
            <table style="margin-top:8px">
              <tr><th>Service</th><th>Private Endpoint Location</th><th>Private IP</th><th>DNS Zone</th></tr>
              <tr><td>ADLS Gen2</td><td>Data Spoke (10.1.x.x)</td><td>10.1.0.5</td><td>privatelink.dfs.core.windows.net</td></tr>
              <tr><td>Azure Key Vault</td><td>Hub or Data Spoke</td><td>10.1.0.10</td><td>privatelink.vaultcore.azure.net</td></tr>
              <tr><td>Azure SQL</td><td>Data Spoke</td><td>10.1.0.15</td><td>privatelink.database.windows.net</td></tr>
              <tr><td>Azure Container Registry</td><td>Hub or Compute Spoke</td><td>10.2.0.10</td><td>privatelink.azurecr.io</td></tr>
              <tr><td>Databricks (control plane)</td><td>Compute Spoke</td><td>10.2.0.20</td><td>privatelink.azuredatabricks.net</td></tr>
            </table>
          </div>
        </div>

        <div class="card">
          <h3>Traffic Flow: Databricks → ADLS via Private Endpoint</h3>
          <div class="flow-diagram">
            <div class="flow-node resource" style="white-space:pre-line">Databricks\n10.2.0.5</div>
            <div class="flow-arrow"><div class="flow-arrow-label">DNS: mystorageaccount.dfs.core.windows.net → 10.1.0.5</div></div>
            <div class="flow-node firewall" style="white-space:pre-line">Hub Firewall\nNet Rule Allow</div>
            <div class="flow-arrow"><div class="flow-arrow-label">Private IP traffic within Azure backbone</div></div>
            <div class="flow-node resource" style="white-space:pre-line">ADLS PE NIC\n10.1.0.5</div>
            <div class="flow-arrow"><div class="flow-arrow-label">Internal mapping</div></div>
            <div class="flow-node subnet" style="white-space:pre-line">ADLS Gen2\nActual Service</div>
          </div>
          <p style="font-size:13px;margin-top:12px;color:var(--text-sub)">The key: DNS returns <code>10.1.0.5</code> (not the public IP). The traffic goes through the Firewall, then to the PE NIC in the Data Spoke, which forwards to ADLS — entirely within Azure's private backbone.</p>
        </div>

        <div class="card">
          <h3>Disabling Public Access</h3>
          <p>After creating Private Endpoints, <strong>disable public network access</strong> on the PaaS service to enforce private-only connectivity:</p>
          <div class="code-block">
# Disable public access on ADLS
az storage account update \
  --name mystorageaccount \
  --resource-group rg-data \
  --public-network-access Disabled

# Only Private Endpoint connections are now accepted
# Even with valid credentials, public access is denied</div>
          <div class="warn">
            <strong>⚠️ Do this AFTER</strong> creating and testing the Private Endpoint. Disabling public access first will break existing connections before the PE is ready.
          </div>
        </div>

      </div>

      <!-- QUIZ -->
      <div class="tab-panel" id="panel-game">
        <div class="game-wrapper">
          <div class="game-topbar">
            <div class="game-topbar-title">🎮 Endpoints Quiz</div>
            <div class="game-topbar-meta"><span>⭐ 20 XP per question</span><span>5 Questions</span></div>
          </div>
          <div class="game-body" id="quiz-endpoints"></div>
        </div>
      </div>

      <!-- ENDPOINT SELECTOR LAB -->
      <div class="tab-panel" id="panel-lab">
        <div id="ep-game-wrap">${renderGame()}</div>
      </div>
    `;
  }

  function mountGame(wrap) {
    placed = {};
    let correctCount = 0;

    wrap.querySelectorAll('.ep-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const choice = btn.dataset.choice;
        if (placed[id]) return; // already answered

        const svc = SERVICES.find(s => s.id === id);
        const isCorrect = choice === svc.correctType;
        placed[id] = choice;

        // Update button styles
        const privateBtn = document.getElementById(`btn-${id}-private`);
        const serviceBtn = document.getElementById(`btn-${id}-service`);
        privateBtn.disabled = true;
        serviceBtn.disabled = true;

        if (isCorrect) {
          btn.classList.remove('btn-secondary');
          btn.classList.add('btn-primary');
          correctCount++;
          UI.awardXP(20, btn);
        } else {
          btn.style.border = '2px solid var(--red)';
          // Highlight correct one
          const correctBtn = document.getElementById(`btn-${id}-${svc.correctType}`);
          if (correctBtn) { correctBtn.classList.remove('btn-secondary'); correctBtn.classList.add('btn-primary'); }
        }

        // Show feedback
        const fb = document.getElementById(`fb-${id}`);
        fb.style.display = 'block';
        fb.style.background = isCorrect ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)';
        fb.style.color = isCorrect ? 'var(--green)' : 'var(--red)';
        fb.innerHTML = `${isCorrect ? '✓' : '✗'} <strong>${isCorrect ? 'Correct!' : 'Not quite.'}</strong> ${svc.reason}`;

        // Check if all answered
        if (Object.keys(placed).length === SERVICES.length) {
          const final = document.getElementById('ep-final');
          final.style.display = 'block';
          State.completeModule('endpoints', correctCount);
          UI.updateBadge('endpoints');
          final.innerHTML = `
            <div class="quiz-feedback show ok">
              <strong>✅ Lab complete!</strong> ${correctCount}/${SERVICES.length} correct.
              In production, always prefer Private Endpoints for data and secrets.
            </div>
          `;
        }
      });
    });
  }

  function mount(container) {
    UI.initTabs(container);

    UI.buildQuiz({
      id: 'quiz-endpoints',
      questions: QUIZ,
      xpPerQuestion: 20,
      moduleId: 'endpoints',
      onComplete: (score, total) => {
        State.completeModule('endpoints', score);
        UI.updateBadge('endpoints');
        UI.showScore({ emoji: '🔌', title: 'Endpoint Expert!', sub: `${score}/${total} correct — Private Endpoints mastered.`, xp: score * 20 });
      }
    });

    const wrap = document.getElementById('ep-game-wrap');
    if (wrap) mountGame(wrap);
  }

  return { render, mount };
})();

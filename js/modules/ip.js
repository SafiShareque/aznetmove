/* ═══════════════════════════════════════════════════════
   Module: IP Addresses & CIDR
   ═══════════════════════════════════════════════════════ */

const IPModule = (() => {

  const QUIZ = [
    {
      question: 'Your Compute Spoke VNet is 10.2.0.0/16. How many usable IP addresses are available?',
      options: ['254', '1,024', '65,534', '65,536'],
      correct: 2,
      explanation: 'A /16 prefix gives 2^(32-16) = 65,536 total IPs. Azure reserves 5 per subnet, but the VNet itself has 65,534 usable addresses.'
    },
    {
      question: 'Which of these is NOT a valid private IP range per RFC 1918?',
      options: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10'],
      correct: 3,
      explanation: '100.64.0.0/10 is the "Shared Address Space" (RFC 6598) used by ISPs — it is not an RFC 1918 private range. The three private ranges are 10.x, 172.16–31.x, and 192.168.x.'
    },
    {
      question: 'Databricks VNet injection requires two subnets. Each needs at least /26. How many IPs does a /26 provide?',
      options: ['32', '64', '62', '126'],
      correct: 2,
      explanation: 'A /26 gives 2^(32-26)=64 IPs total. Azure reserves 5 (network, broadcast, gateway, DHCP, future). So 64−5=59 usable — often quoted as ~62 because Azure reserves only 5.'
    },
    {
      question: 'Your Hub VNet is 10.0.0.0/16. You want a GatewaySubnet. Azure requires it to be at least:',
      options: ['/32', '/29', '/27', '/16'],
      correct: 1,
      explanation: 'Azure recommends /27 or larger for GatewaySubnet (at least /29 for basic scenarios). /27 gives 32 IPs so VPN/ExpressRoute gateway VMs have room to scale.'
    },
    {
      question: 'In CIDR notation, what does the "/22" in "10.2.0.0/22" represent?',
      options: [
        'The number of usable hosts',
        'The number of fixed bits in the network prefix',
        'The maximum number of subnets',
        'The broadcast address offset'
      ],
      correct: 1,
      explanation: 'The /22 means the first 22 bits are the network prefix (fixed). The remaining 32−22=10 bits are for hosts, giving 2^10=1,024 total IPs (1,019 usable after Azure reserves 5).'
    },
  ];

  function cidrCalc(ip, prefix) {
    const parts = ip.split('.').map(Number);
    const total = Math.pow(2, 32 - prefix);
    const usable = total - 5;
    const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
    const octets = [(mask >>> 24) & 0xFF, (mask >>> 16) & 0xFF, (mask >>> 8) & 0xFF, mask & 0xFF];
    return { total, usable, mask: octets.join('.') };
  }

  function renderCalc() {
    const ipInput = document.getElementById('calc-ip');
    const prefixInput = document.getElementById('calc-prefix');
    const ip = ipInput.value || '10.0.0.0';
    const prefix = parseInt(prefixInput.value || '16');
    const { total, usable, mask } = cidrCalc(ip, prefix);

    // Build bit display
    const ipParts = ip.split('.').map(Number);
    let bits = '';
    let bitIdx = 0;
    ipParts.forEach((part, pi) => {
      if (pi > 0) bits += '<span class="bit bit-sep">/</span>';
      for (let b = 7; b >= 0; b--) {
        const val = (part >> b) & 1;
        const cls = bitIdx < prefix ? 'bit-fixed' : 'bit-free';
        bits += `<span class="bit ${cls}" title="bit ${bitIdx+1}">${val}</span>`;
        bitIdx++;
      }
    });

    document.getElementById('calc-total').textContent = total.toLocaleString();
    document.getElementById('calc-usable').textContent = usable.toLocaleString();
    document.getElementById('calc-mask').textContent = mask;
    document.getElementById('cidr-display').textContent = `${ip}/${prefix}`;
    document.getElementById('cidr-bits').innerHTML = bits;
  }

  function render() {
    return `
      <div class="module-header">
        <div class="module-eyebrow">Module 1</div>
        <div class="module-title">🔢 IP Addresses & CIDR</div>
        <div class="module-desc">Before you can build anything in Azure networking, you need to speak the language of IP addresses and CIDR notation. Everything — VNets, subnets, firewall rules, NSGs — relies on this foundation.</div>
      </div>

      <div class="tab-bar">
        <div class="tab active" data-tab="learn">📖 Learn</div>
        <div class="tab" data-tab="game">🎮 Quiz Game</div>
        <div class="tab" data-tab="lab">🧪 CIDR Calculator</div>
      </div>

      <!-- LEARN TAB -->
      <div class="tab-panel active" id="panel-learn">

        <div class="card">
          <h3>What is an IP Address?</h3>
          <p>An IP (Internet Protocol) address is a unique number that identifies every device on a network — just like a street address identifies your house. In Azure, every resource (VM, load balancer, private endpoint) gets an IP address.</p>

          <div class="analogy">
            <span class="analogy-label">🏠 Real-Life Analogy</span>
            Think of an IP address like a postal address. Your house at "10 Maple Street" — that's specific enough for one building. A VNet is like a city, a subnet is like a neighbourhood, and individual IPs are like individual houses. The postman (router) uses the address to deliver packets to exactly the right door.
          </div>

          <h4 style="margin-top:20px">IPv4 Format</h4>
          <p>An IPv4 address is 32 bits written as four groups of 0–255 separated by dots:</p>
          <pre><code>10  .  2  .  0  .  50
│     │    │    └─ Host part
│     │    └────── Subnet part
│     └─────────── Network part
└───────────────── Class A private range</code></pre>
        </div>

        <div class="card">
          <h3>Private IP Ranges (RFC 1918)</h3>
          <p>Azure VNets must use private IP ranges — addresses that are not routable on the public internet. There are three ranges:</p>
          <table>
            <tr><th>Range</th><th>CIDR</th><th>Total IPs</th><th>Used in your architecture</th></tr>
            <tr><td><code>10.0.0.0</code> – <code>10.255.255.255</code></td><td><code>10.0.0.0/8</code></td><td>16.7 million</td><td>✅ All 4 VNets (10.0–10.3.x.x)</td></tr>
            <tr><td><code>172.16.0.0</code> – <code>172.31.255.255</code></td><td><code>172.16.0.0/12</code></td><td>1 million</td><td>—</td></tr>
            <tr><td><code>192.168.0.0</code> – <code>192.168.255.255</code></td><td><code>192.168.0.0/16</code></td><td>65,536</td><td>—</td></tr>
          </table>

          <div class="callout">
            <strong>Your architecture uses 10.0.0.0/8 space</strong> — divided into four /16 blocks: Hub (10.0), Data Spoke (10.1), Compute Spoke (10.2), Mgmt Spoke (10.3). Each /16 gives 65,534 usable IPs per VNet.
          </div>
        </div>

        <div class="card">
          <h3>CIDR Notation — Slash Numbers Explained</h3>
          <p>CIDR (Classless Inter-Domain Routing) uses a <strong>prefix length</strong> after the slash to define how many bits are the "network" part vs the "host" part.</p>

          <pre><code>10.2.0.0 / 22
         └────── Prefix length: 22 bits are FIXED (network)
                 Remaining: 32-22 = 10 bits for hosts
                 Total IPs: 2¹⁰ = 1,024
                 Usable IPs: 1,024 - 5 = 1,019 (Azure reserves 5)</code></pre>

          <table style="margin-top:16px">
            <tr><th>CIDR</th><th>Total IPs</th><th>Usable (Azure)</th><th>Common use</th></tr>
            <tr><td><code>/16</code></td><td>65,536</td><td>65,531</td><td>VNet address space</td></tr>
            <tr><td><code>/22</code></td><td>1,024</td><td>1,019</td><td>Databricks host/container subnets</td></tr>
            <tr><td><code>/24</code></td><td>256</td><td>251</td><td>General workload subnets</td></tr>
            <tr><td><code>/27</code></td><td>32</td><td>27</td><td>GatewaySubnet, AzureFirewallSubnet</td></tr>
            <tr><td><code>/29</code></td><td>8</td><td>3</td><td>Minimum subnet (Azure requires /29+)</td></tr>
          </table>

          <div class="warn">
            <strong>⚠️ Azure Reserved IPs:</strong> Azure always consumes 5 IPs from every subnet: x.x.x.0 (network), x.x.x.1 (default gateway), x.x.x.2–3 (Azure DNS), x.x.x.255 (broadcast). Plan your subnets larger than you think you need!
          </div>
        </div>

        <div class="card">
          <h3>IP Address Types in Azure</h3>
          <div class="grid-2">
            <div>
              <h4>Private IPs</h4>
              <ul style="font-size:14px;line-height:2;padding-left:16px">
                <li>Assigned within your VNet</li>
                <li>Static or Dynamic (DHCP)</li>
                <li>Used for Private Endpoints</li>
                <li>Not reachable from internet</li>
                <li>Example: <code>10.1.0.4</code></li>
              </ul>
            </div>
            <div>
              <h4>Public IPs</h4>
              <ul style="font-size:14px;line-height:2;padding-left:16px">
                <li>Internet-routable address</li>
                <li>Assigned to Azure resources</li>
                <li>Standard or Basic SKU</li>
                <li>In your arch: Azure Firewall SNAT</li>
                <li>Example: <code>52.168.100.45</code></li>
              </ul>
            </div>
          </div>

          <div class="arch-box">
            <span class="arch-label">🏗️ In Your Cloudera→Azure Migration</span>
            Databricks VNet injection requires two subnets: <code>host-subnet (10.2.0.0/22)</code> and <code>container-subnet (10.2.4.0/22)</code>. With 100 parallel job clusters, each cluster VM gets one IP — a /22 gives 1,019 IPs, enough for 100 clusters with room for growth. NAT Gateway provides a stable outbound public IP so your Databricks jobs always appear to come from a fixed IP when reaching external APIs.
          </div>
        </div>

      </div>

      <!-- QUIZ TAB -->
      <div class="tab-panel" id="panel-game">
        <div class="game-wrapper">
          <div class="game-topbar">
            <div class="game-topbar-title">🎮 IP & CIDR Quiz</div>
            <div class="game-topbar-meta">
              <span>⭐ 20 XP per question</span>
              <span>5 Questions</span>
            </div>
          </div>
          <div class="game-body" id="quiz-ip"></div>
        </div>
      </div>

      <!-- LAB TAB -->
      <div class="tab-panel" id="panel-lab">
        <div class="card">
          <h3>🧪 CIDR Calculator Lab</h3>
          <p style="color:var(--text-sub);margin-bottom:20px">Experiment with any IP + prefix to see exactly how many addresses you get. Try your actual Azure subnets!</p>

          <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:20px">
            <div>
              <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-sub)">IP ADDRESS</label>
              <input id="calc-ip" type="text" value="10.2.0.0" placeholder="10.0.0.0"
                style="padding:8px 12px;border:1.5px solid var(--border2);border-radius:6px;font-size:15px;font-family:monospace;width:160px">
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-sub)">PREFIX LENGTH</label>
              <input id="calc-prefix" type="range" min="8" max="30" value="22"
                style="width:160px;accent-color:var(--blue)">
              <span id="prefix-disp" style="font-weight:700;font-size:14px;margin-left:8px">/22</span>
            </div>
            <button class="btn btn-primary" id="calc-btn">Calculate</button>
          </div>

          <div style="background:var(--surface2);border-radius:var(--radius-lg);padding:24px">
            <div class="cidr-display" id="cidr-display">10.2.0.0/22</div>
            <div class="cidr-bits" id="cidr-bits"></div>
            <div style="display:flex;gap:12px;margin-top:8px;font-size:13px;flex-wrap:wrap">
              <span style="color:var(--blue);font-weight:700">■ Network bits (fixed)</span>
              <span style="color:var(--text-sub);font-weight:700">□ Host bits (free)</span>
            </div>
            <div style="display:flex;gap:32px;margin-top:20px;flex-wrap:wrap">
              <div><div style="font-size:11px;color:var(--text-muted);font-weight:700;margin-bottom:2px">TOTAL IPs</div><div style="font-size:22px;font-weight:800" id="calc-total">—</div></div>
              <div><div style="font-size:11px;color:var(--text-muted);font-weight:700;margin-bottom:2px">USABLE (Azure)</div><div style="font-size:22px;font-weight:800;color:var(--green)" id="calc-usable">—</div></div>
              <div><div style="font-size:11px;color:var(--text-muted);font-weight:700;margin-bottom:2px">SUBNET MASK</div><div style="font-size:22px;font-weight:700;font-family:monospace" id="calc-mask">—</div></div>
            </div>
          </div>

          <div class="callout" style="margin-top:16px">
            <strong>Try these from your architecture:</strong>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
              ${['10.0.0.0/16','10.1.0.0/16','10.2.0.0/22','10.2.4.0/22','10.0.0.0/27'].map(c => {
                const [ip, prefix] = c.split('/');
                return `<button class="btn btn-secondary btn-sm" data-calc-ip="${ip}" data-calc-prefix="${prefix}">${c}</button>`;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function mount(container) {
    UI.initTabs(container);

    // Quiz
    UI.buildQuiz({
      id: 'quiz-ip',
      questions: QUIZ,
      xpPerQuestion: 20,
      moduleId: 'ip',
      onComplete: (score, total) => {
        State.completeModule('ip', score);
        UI.updateBadge('ip');
        UI.showScore({
          emoji: '🔢',
          title: 'IP Master!',
          sub: `${score}/${total} correct — you understand IP addressing and CIDR.`,
          xp: score * 20,
          onNext: () => {},
        });
      }
    });

    // CIDR Calculator
    const ipInput = container.querySelector('#calc-ip');
    const prefixInput = container.querySelector('#calc-prefix');
    const prefixDisp = container.querySelector('#prefix-disp');

    function doCalc() {
      prefixDisp.textContent = '/' + prefixInput.value;
      renderCalc();
    }

    container.querySelector('#calc-btn').addEventListener('click', doCalc);
    prefixInput.addEventListener('input', doCalc);
    container.querySelectorAll('[data-calc-ip]').forEach(btn => {
      btn.addEventListener('click', () => {
        ipInput.value = btn.dataset.calcIp;
        prefixInput.value = btn.dataset.calcPrefix;
        doCalc();
      });
    });

    // initial render
    doCalc();
  }

  return { render, mount };
})();

/* ═══════════════════════════════════════════════════════
   AzNetMove — Arcade decks (one per module)
   next() returns { q, options, a, why }. Generated decks compute the
   answer with real logic (CIDR math, NSG/route evaluation).
   ═══════════════════════════════════════════════════════ */

const ARCADE_DECKS = (() => {
  const C = Portal.cidr;
  const { pick, rand, shuffleOptions, cycle } = Arcade;
  const ip = n => C.intToIp(n >>> 0);
  const decks = {};

  /* Fact cards are [question, correct, wrongs[], why]; options are re-shuffled on every draw */
  const factDeck = list => {
    const next = cycle(list);
    return () => { const f = next(); return { q: f[0], ...shuffleOptions(f[1], f[2]), why: f[3] }; };
  };
  /* Mix generated cards with a share of fact cards */
  const mix = (gens, factList, factShare = .3) => {
    const nextFact = factList && factList.length ? factDeck(factList) : null;
    return () => (nextFact && Math.random() < factShare) ? nextFact() : pick(gens)();
  };

  /* ── IP & CIDR ── */
  const PUBLIC_FIRST = [8, 13, 20, 23, 34, 40, 52, 104, 142, 151, 185, 203];
  decks.ip = {
    id: 'ip', icon: '🔢', title: 'Subnet Sprint', maxOptions: 4,
    howto: 'Private or public? Inside the block or not? How many usable IPs does Azure leave you? Answer fast — streaks multiply your score.',
    next: (() => {
      const privPub = () => {
        const kind = rand(0, 5);
        let addr, priv;
        if (kind === 0) { addr = `10.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`; priv = true; }
        else if (kind === 1) { addr = `172.${rand(16, 31)}.${rand(0, 255)}.${rand(1, 254)}`; priv = true; }
        else if (kind === 2) { addr = `192.168.${rand(0, 255)}.${rand(1, 254)}`; priv = true; }
        else if (kind === 3) { addr = `172.${pick([15, 32, 33])}.${rand(0, 255)}.${rand(1, 254)}`; priv = false; }   // near-miss
        else if (kind === 4) { addr = `192.${pick([167, 169])}.${rand(0, 255)}.${rand(1, 254)}`; priv = false; }  // near-miss
        else { addr = `${pick(PUBLIC_FIRST)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`; priv = false; }
        return { q: `Is <b class="mono">${addr}</b> private or public?`, options: ['Private (RFC 1918)', 'Public'], a: priv ? 0 : 1,
          why: `Private ranges are 10.0.0.0/8, 172.16.0.0/12 (172.16–172.31) and 192.168.0.0/16. ${addr} is ${priv ? 'inside' : 'outside'} them.` };
      };
      const usable = () => {
        const bits = rand(24, 29), total = 2 ** (32 - bits);
        const o = shuffleOptions(String(total - 5), [String(total), String(total - 2), String(total - 3)]);
        return { q: `Usable IPs in an <b>Azure</b> <b class="mono">/${bits}</b> subnet?`, ...o,
          why: `/${bits} = ${total} addresses. Azure reserves 5 (network, gateway, 2× DNS, broadcast) → ${total - 5}.` };
      };
      const inside = () => {
        const bits = rand(20, 26), size = 2 ** (32 - bits);
        const start = (C.ipToInt('10.0.0.0') + Math.floor(rand(0, 4 * 65536 - size) / size) * size) >>> 0;
        const block = `${ip(start)}/${bits}`;
        const isIn = Math.random() < .5;
        const test = isIn ? start + rand(0, size - 1) : (Math.random() < .5 && start > C.ipToInt('10.0.0.0') ? start - rand(1, 64) : start + size + rand(0, 64));
        return { q: `Is <b class="mono">${ip(test)}</b> inside <b class="mono">${block}</b>?`, options: ['Inside', 'Outside'], a: isIn ? 0 : 1,
          why: `${block} spans ${ip(start)} – ${ip(start + size - 1)} (${size} addresses).` };
      };
      return mix([privPub, usable, inside], null);
    })(),
  };

  /* ── VNET & SUBNETS ── */
  decks.vnet = {
    id: 'vnet', icon: '🏗️', title: 'Peer Pressure', maxOptions: 4,
    howto: 'Can these VNets peer, or do their address spaces overlap? Plus rapid-fire VNet facts.',
    next: mix([() => {
      const bitsA = pick([16, 18, 20, 22]), bitsB = pick([16, 18, 20, 22, 24]);
      const sizeA = 2 ** (32 - bitsA), sizeB = 2 ** (32 - bitsB);
      const base = C.ipToInt('10.0.0.0');
      const a = (base + Math.floor(rand(0, 4 * 65536 - sizeA) / sizeA) * sizeA) >>> 0;
      let b;
      if (Math.random() < .5) b = (a + Math.floor(rand(0, sizeA - 1) / sizeB) * sizeB) >>> 0;    // overlapping-ish
      else b = (base + Math.floor(rand(0, 4 * 65536 - sizeB) / sizeB) * sizeB) >>> 0;
      const A = `${ip(a)}/${bitsA}`, B = `${ip(b - (b % sizeB))}/${bitsB}`;
      const ov = C.overlaps(A, B);
      return { q: `VNet A <b class="mono">${A}</b><br>VNet B <b class="mono">${B}</b><br>Can they peer?`, options: ['Yes — no overlap', 'No — they overlap'], a: ov ? 1 : 0,
        why: `A spans ${ip(C.parse(A).start)}–${ip(C.parse(A).end)}, B spans ${ip(C.parse(B).start)}–${ip(C.parse(B).end)}. ${ov ? 'Overlapping spaces can never peer.' : 'No shared addresses, so peering works.'}` };
    }], [
      ['Spoke A ↔ Hub ↔ Spoke B are peered. Can A reach B with no UDR or firewall?', 'No', ['Yes'], 'Peering is not transitive — spoke-to-spoke needs a hub router/firewall plus UDRs (or direct peering).'],
      ['Required subnet name for a VPN / ExpressRoute gateway?', 'GatewaySubnet', ['snet-gateway', 'AzureGatewaySubnet', 'GwSubnet'], 'Azure only deploys gateways into a subnet named exactly GatewaySubnet.'],
      ['Required subnet name for Azure Firewall?', 'AzureFirewallSubnet', ['FirewallSubnet', 'snet-firewall', 'AzureFWSubnet'], 'Azure Firewall needs AzureFirewallSubnet, /26 or larger.'],
      ['Required subnet name for Azure Bastion?', 'AzureBastionSubnet', ['BastionSubnet', 'snet-bastion', 'GatewaySubnet'], 'Bastion needs AzureBastionSubnet, /26 or larger.'],
      ['Can you peer VNets in different Azure regions?', 'Yes — global peering', ['No', 'Only via VPN'], 'Global VNet peering connects VNets across regions over the Microsoft backbone.'],
      ['Databricks VNet injection needs how many dedicated subnets?', '2', ['1', '3', '4'], 'A host (public) and a container (private) subnet, both delegated to Microsoft.Databricks/workspaces.'],
      ['Does VNet peering traffic cross the public internet?', 'No', ['Yes', 'Only global peering'], 'Peered traffic stays on the Microsoft backbone, even across regions.'],
      ['A subnet can span…', 'One VNet only', ['Two peered VNets', 'Any VNet in the region', 'All availability zones of two VNets'], 'Subnets live inside a single VNet (but span all zones in its region).'],
      ['Spoke setting that lets it use the hub\'s ExpressRoute gateway?', 'Use remote gateway', ['Allow gateway transit', 'Allow forwarded traffic', 'Gateway propagation'], 'Hub: "Allow gateway transit". Spoke: "Use remote gateway".'],
    ]),
  };

  /* ── NSG ── */
  const NSG_RULES = [
    { p: 100, name: 'Allow-HTTPS-VNet', src: 'VirtualNetwork', port: 443, proto: 'TCP', allow: true },
    { p: 200, name: 'Deny-DBX-Range', src: '10.2.8.0/22', port: '*', proto: 'Any', allow: false },
    { p: 300, name: 'Allow-RDP-Bastion', src: '10.0.2.0/26', port: 3389, proto: 'TCP', allow: true },
    { p: 400, name: 'Allow-SSH-Mgmt', src: '10.3.0.0/16', port: 22, proto: 'TCP', allow: true },
    { p: 65000, name: 'AllowVnetInBound', src: 'VirtualNetwork', port: '*', proto: 'Any', allow: true },
    { p: 65500, name: 'DenyAllInBound', src: '*', port: '*', proto: 'Any', allow: false },
  ];
  // VirtualNetwork tag = VNet + peered VNets + on-prem ranges learned through the gateway
  const VNET_TAG = ['10.0.0.0/14', '192.168.0.0/16'];
  const srcMatch = (rule, addr) => rule.src === '*' ? true : rule.src === 'VirtualNetwork' ? VNET_TAG.some(b => C.ipIn(addr, b)) : C.ipIn(addr, rule.src);
  const SOURCES = [
    ['Bastion', () => `10.0.2.${rand(4, 62)}`], ['Databricks host', () => `10.2.${rand(8, 11)}.${rand(4, 250)}`],
    ['AKS', () => `10.2.${rand(12, 15)}.${rand(4, 250)}`], ['Mgmt spoke', () => `10.3.${rand(0, 3)}.${rand(4, 250)}`],
    ['Data spoke', () => `10.1.${rand(0, 3)}.${rand(4, 250)}`], ['On-prem Cloudera', () => `192.168.10.${rand(4, 250)}`],
    ['Internet', () => `${pick(PUBLIC_FIRST)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`],
  ];
  decks.nsg = {
    id: 'nsg', icon: '🛡️', title: 'Packet Bouncer', maxOptions: 2,
    howto: 'You are the NSG on <code>snet-shir</code>. Each inbound packet is checked against the rules — lowest priority number first, first match wins.',
    contextTitle: 'Inbound rules (snet-shir)',
    context: `<table class="arcade-rules-table">${NSG_RULES.map(r => `<tr class="${r.allow ? 'allow' : 'deny'}"><td>${r.p}</td><td>${r.allow ? 'Allow' : 'Deny'}</td><td>${r.proto}</td><td>${r.src}</td><td>:${r.port}</td></tr>`).join('')}</table>
      <div class="arcade-note">VirtualNetwork tag = 10.0.0.0/14 (local + peered) + on-prem 192.168.0.0/16 via the gateway.</div>`,
    next: () => {
      const [label, gen] = pick(SOURCES);
      const addr = gen();
      const port = pick([443, 3389, 22, 1433, 80]);
      const rule = NSG_RULES.find(r => srcMatch(r, addr) && (r.port === '*' || r.port === port));
      return { q: `<div class="arcade-packet">TCP <b class="mono">${addr}</b> → <b class="mono">:${port}</b></div><div class="arcade-sub">from ${label}</div>`,
        options: ['✅ Allow', '⛔ Deny'], a: rule.allow ? 0 : 1,
        why: `First match is rule ${rule.p} (${rule.name}) → ${rule.allow ? 'Allow' : 'Deny'}.` };
    },
  };

  /* ── ROUTING ── */
  const ROUTES = [
    { prefix: '10.2.0.0/16', hop: 'Local VNet', src: 'System' },
    { prefix: '10.0.0.0/16', hop: 'Hub peering', src: 'System' },
    { prefix: '10.2.12.0/24', hop: 'Firewall 10.0.0.4', src: 'User' },
    { prefix: '10.0.0.0/8', hop: 'Firewall 10.0.0.4', src: 'User' },
    { prefix: '172.16.0.0/12', hop: 'Dropped (None)', src: 'System' },
    { prefix: '192.168.0.0/16', hop: 'Firewall 10.0.0.4', src: 'User' },
    { prefix: '192.168.50.0/24', hop: 'ER Gateway', src: 'BGP' },
    { prefix: '0.0.0.0/0', hop: 'Firewall 10.0.0.4', src: 'User' },
  ];
  const HOPS = ['Local VNet', 'Hub peering', 'Firewall 10.0.0.4', 'ER Gateway', 'Dropped (None)'];
  const DESTS = [
    () => `10.2.${pick([0, 1, 4, 9])}.${rand(4, 250)}`, () => `10.2.12.${rand(4, 250)}`, () => `10.0.${rand(0, 3)}.${rand(4, 250)}`,
    () => `10.1.${rand(0, 9)}.${rand(4, 250)}`, () => `10.3.${rand(0, 9)}.${rand(4, 250)}`, () => `192.168.10.${rand(4, 250)}`,
    () => `192.168.50.${rand(4, 250)}`, () => `172.${rand(16, 31)}.${rand(0, 255)}.${rand(4, 250)}`, () => `${pick(PUBLIC_FIRST)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`,
  ];
  decks.routing = {
    id: 'routing', icon: '🗺️', title: 'Next Hop Hustle', maxOptions: 5,
    howto: 'A packet leaves a VM in the compute spoke. Pick its next hop — longest prefix match wins.',
    contextTitle: 'Effective routes (compute spoke)',
    context: `<table class="arcade-rules-table">${ROUTES.map(r => `<tr><td class="mono">${r.prefix}</td><td>${r.hop}</td><td>${r.src}</td></tr>`).join('')}</table>`,
    next: () => {
      const dest = pick(DESTS)();
      const r = ROUTES.filter(x => C.ipIn(dest, x.prefix)).sort((a, b) => C.parse(b.prefix).bits - C.parse(a.prefix).bits)[0];
      return { q: `Packet to <b class="mono">${dest}</b>`, options: HOPS, a: HOPS.indexOf(r.hop),
        why: `Longest matching prefix is ${r.prefix} (${r.src}) → ${r.hop}.` };
    },
  };

  /* ── NETWORK GROUPS ── */
  decks.netgroups = {
    id: 'netgroups', icon: '🔗', title: 'Tag Sorter', maxOptions: 4,
    howto: 'New VNets keep appearing. Read their tags and drop each into the right AVNM network group — before the policy does!',
    contextTitle: 'Dynamic membership rules',
    context: `<table class="arcade-rules-table">
      <tr><td>Hub group</td><td>env = prod AND role = hub</td></tr>
      <tr><td>Prod spokes</td><td>env = prod AND role ≠ hub</td></tr>
      <tr><td>Dev group</td><td>env = dev</td></tr>
      <tr><td>No group</td><td>anything else</td></tr></table>
      <div class="arcade-note">A missing tag counts as "≠" but never as "=".</div>`,
    next: () => {
      const env = pick(['prod', 'prod', 'dev', 'test', null]);
      const role = pick(['hub', 'data', 'compute', 'mgmt', null]);
      const tags = [env && `env=${env}`, role && `role=${role}`].filter(Boolean);
      const name = `vnet-${role || 'app'}-${env || 'x'}-${rand(10, 99)}`;
      let group;
      if (env === 'prod' && role === 'hub') group = 'Hub group';
      else if (env === 'prod') group = 'Prod spokes';
      else if (env === 'dev') group = 'Dev group';
      else group = 'No group';
      const opts = ['Hub group', 'Prod spokes', 'Dev group', 'No group'];
      return { q: `<b class="mono">${name}</b><div class="arcade-tags">${tags.map(t => `<span>${t}</span>`).join('') || '<span>no tags</span>'}</div>`,
        options: opts, a: opts.indexOf(group),
        why: `${tags.join(', ') || 'No tags'} → ${group}${env === 'prod' && !role ? ' (missing role counts as ≠ hub)' : ''}.` };
    },
  };

  /* ── FIREWALL ── */
  decks.firewall = {
    id: 'firewall', icon: '🔥', title: 'Rule Rush', maxOptions: 4,
    howto: 'Requests are flooding the security team. Pick the right Azure Firewall feature, rule type or tier for each.',
    next: factDeck([
      ['Allow Databricks → <b>*.pypi.org</b> over HTTPS', 'Application rule', ['Network rule', 'DNAT rule'], 'FQDN filtering of HTTP/S traffic is an application (L7) rule.'],
      ['Allow 10.2.0.0/16 → 192.168.10.5 on <b>TCP 10000</b>', 'Network rule', ['Application rule', 'DNAT rule'], 'IP + port + protocol = network (L4) rule.'],
      ['Publish an internal app on the firewall\'s <b>public IP :443</b>', 'DNAT rule', ['Network rule', 'Application rule'], 'Inbound port forwarding from the internet is a DNAT rule.'],
      ['Allow <b>ICMP</b> ping from mgmt spoke to compute spoke', 'Network rule', ['Application rule', 'DNAT rule'], 'ICMP is L3/L4 — network rule.'],
      ['Block <b>gambling</b> websites by category', 'Application rule', ['Network rule', 'Threat intelligence'], 'Web categories are matched in application rules.'],
      ['Minimum tier for <b>TLS inspection</b>', 'Premium', ['Basic', 'Standard'], 'TLS inspection, IDPS and URL filtering are Premium-only.'],
      ['Minimum tier for <b>IDPS</b>', 'Premium', ['Basic', 'Standard'], 'Signature-based intrusion detection & prevention is Premium.'],
      ['Minimum tier for <b>DNS proxy</b> & FQDNs in network rules', 'Standard', ['Basic', 'Premium'], 'Basic has no DNS proxy; Standard and Premium do.'],
      ['Rule processing order?', 'DNAT → Network → Application', ['Application → Network → DNAT', 'Network → DNAT → Application', 'All in parallel'], 'DNAT first, then network rules, then application rules. First match wins.'],
      ['A packet matches a network <b>allow</b> rule. Are application rules still checked?', 'No', ['Yes'], 'Processing stops at the first match.'],
      ['Spoke VM → pypi.org via the firewall. What source IP does pypi.org see?', 'Firewall public IP', ['VM private IP', 'Hub VNet gateway IP', '168.63.129.16'], 'Outbound internet traffic is SNATed to the firewall\'s public IP.'],
      ['Spoke → on-prem 192.168.10.5 via the firewall. Is it SNATed by default?', 'No', ['Yes'], 'By default the firewall doesn\'t SNAT traffic to private (RFC 1918) ranges.'],
      ['Automatically block traffic to known malicious IPs & domains', 'Threat intelligence (deny)', ['Application rule', 'NSG', 'DNAT rule'], 'Threat intel in "Alert and deny" uses Microsoft\'s feed.'],
      ['Firewall subnet name and minimum size?', 'AzureFirewallSubnet, /26', ['FirewallSubnet, /27', 'AzureFirewallSubnet, /29', 'GatewaySubnet, /26'], 'AzureFirewallSubnet, /26 or larger.'],
      ['UDR next hop type to send traffic to the firewall?', 'VirtualAppliance', ['VirtualNetworkGateway', 'Internet', 'VnetLocal'], 'VirtualAppliance + the firewall\'s private IP (10.0.0.4).'],
    ]),
  };

  /* ── TRAFFIC FLOW ── */
  decks.traffic = {
    id: 'traffic', icon: '🚦', title: 'Route Royale', maxOptions: 4,
    howto: 'Two routes enter, one route leaves. Decide which path traffic really takes.',
    next: factDeck([
      ['Same prefix <b>0.0.0.0/0</b> from a UDR and from BGP. Which wins?', 'UDR', ['BGP', 'System', 'Both (ECMP)'], 'For equal prefixes: User-defined > BGP > System.'],
      ['Same prefix from <b>BGP</b> and a <b>system</b> route. Which wins?', 'BGP', ['System', 'Neither — dropped'], 'BGP beats system routes for the same prefix.'],
      ['UDR <b>10.0.0.0/8</b> → firewall vs BGP <b>10.1.0.0/16</b> → gateway. Packet to 10.1.2.3?', 'Gateway (BGP /16)', ['Firewall (UDR /8)'], 'Longest prefix match is checked first — /16 beats /8, whatever the source.'],
      ['On-prem advertises 192.168.0.0/16 and 192.168.10.0/24. Packet to 192.168.10.7 follows…', 'The /24', ['The /16', 'Both (ECMP)'], 'Longest prefix wins.'],
      ['Two ER circuits advertise the same prefix with equal AS path and weight. Azure…', 'Load-balances (ECMP)', ['Uses the oldest circuit', 'Drops the traffic'], 'Equal routes from multiple connections are used with ECMP.'],
      ['Make Azure prefer circuit A over B for Azure → on-prem traffic', 'Higher connection weight on A', ['AS-path prepend in Azure', 'Lower NSG priority', 'Disable propagation on B'], 'Connection routing weight (higher wins) steers Azure → on-prem.'],
      ['Make on-prem prefer circuit A for on-prem → Azure traffic', 'Local preference on your routers', ['Connection weight in Azure', 'A UDR', 'FastPath'], 'Microsoft advertises the same prefixes on both — your edge routers choose.'],
      ['Firewall sees only the request, not the reply. Result?', 'Asymmetric routing — dropped', ['Works fine', 'Faster traffic'], 'Stateful firewalls drop flows they only see half of. Route both directions through it.'],
      ['Spoke → spoke through the hub firewall needs UDRs in…', 'Both spokes', ['Only the source spoke', 'Only the hub', 'Neither'], 'Each direction must be steered, or replies bypass the firewall.'],
      ['Where do you see the routes a VM actually uses?', 'NIC → Effective routes', ['Route table → Routes', 'VNet → Peerings', 'NSG → Flow logs'], 'Effective routes combine system, BGP and user routes for that NIC.'],
      ['Spoke route table has gateway propagation <b>disabled</b>. Do its subnets learn on-prem BGP routes?', 'No', ['Yes', 'Only /24s'], 'That\'s the point — force on-prem traffic through the firewall with UDRs.'],
      ['Default system route for <b>0.0.0.0/0</b>?', 'Internet', ['None', 'VirtualNetworkGateway', 'VnetLocal'], 'Without a UDR, Azure sends unmatched traffic to the internet.'],
      ['System route for <b>10.0.0.0/8</b> when it isn\'t in your VNet space?', 'None (drop)', ['Internet', 'VnetLocal'], 'Azure drops RFC 1918 ranges that aren\'t yours — add UDRs for other spokes.'],
    ]),
  };

  /* ── PRIVATE & SERVICE ENDPOINTS ── */
  decks.endpoints = {
    id: 'endpoints', icon: '🔌', title: 'Endpoint Showdown', maxOptions: 4,
    howto: 'Private Endpoint or Service Endpoint? And which sub-resource does each workload need?',
    next: factDeck([
      ['The service gets a <b>private IP inside your VNet</b>', 'Private Endpoint', ['Service Endpoint'], 'A PE is a NIC in your subnet mapped to one resource.'],
      ['Traffic still targets the service\'s <b>public IP</b>, but tagged with your subnet', 'Service Endpoint', ['Private Endpoint'], 'Service endpoints optimise the route and identify your subnet — the endpoint stays public.'],
      ['Reachable from <b>on-prem over ExpressRoute</b>', 'Private Endpoint', ['Service Endpoint'], 'Service endpoints only work from inside the VNet; PEs have a routable private IP.'],
      ['<b>Free</b>, switched on per subnet per service', 'Service Endpoint', ['Private Endpoint'], 'PEs are billed per hour and per GB; service endpoints are free.'],
      ['Mapped to <b>one specific</b> resource instance (exfiltration protection)', 'Private Endpoint', ['Service Endpoint'], 'A PE only reaches the resource it was created for.'],
      ['Needs a <b>private DNS zone</b> to work properly', 'Private Endpoint', ['Service Endpoint'], 'The public name must resolve to the PE\'s private IP.'],
      ['Databricks reads <b>abfss://…dfs.core.windows.net</b> — sub-resource?', 'dfs', ['blob', 'file', 'table'], 'ADLS Gen2 (abfss) uses the dfs endpoint.'],
      ['Azure SQL Database — sub-resource?', 'sqlServer', ['database', 'sql', 'dfs'], 'Azure SQL uses the sqlServer group ID.'],
      ['Key Vault — sub-resource?', 'vault', ['keyvault', 'secrets', 'blob'], 'Key Vault uses the vault group ID.'],
      ['Blob SDK / wasbs:// — sub-resource?', 'blob', ['dfs', 'file', 'queue'], 'Blob API = blob endpoint. ADLS often needs both blob and dfs PEs.'],
      ['Azure Files SMB share — sub-resource?', 'file', ['blob', 'smb', 'dfs'], 'File shares use the file endpoint.'],
      ['Event Hubs — sub-resource?', 'namespace', ['eventhub', 'servicebus', 'blob'], 'Event Hubs PEs target the namespace.'],
      ['Databricks workspace UI & REST API (front-end Private Link) — sub-resource?', 'databricks_ui_api', ['browser_authentication', 'dfs', 'workspace'], 'databricks_ui_api for front-end/back-end; browser_authentication is for SSO.'],
      ['You created a PE. Is the public endpoint closed automatically?', 'No', ['Yes'], 'Disable public network access on the resource separately.'],
    ]),
  };

  /* ── DNS ── */
  const ZONES = [
    ['stadlsprod001.blob.core.windows.net', 'privatelink.blob.core.windows.net'],
    ['stadlsprod001.dfs.core.windows.net', 'privatelink.dfs.core.windows.net'],
    ['stadlsprod001.file.core.windows.net', 'privatelink.file.core.windows.net'],
    ['stadlsprod001.queue.core.windows.net', 'privatelink.queue.core.windows.net'],
    ['sql-cloudera-meta.database.windows.net', 'privatelink.database.windows.net'],
    ['kv-data-prod.vault.azure.net', 'privatelink.vaultcore.azure.net'],
    ['adb-4815162342.7.azuredatabricks.net', 'privatelink.azuredatabricks.net'],
    ['adf-prod.eastus2.datafactory.azure.net', 'privatelink.datafactory.azure.net'],
    ['evh-ingest.servicebus.windows.net', 'privatelink.servicebus.windows.net'],
    ['acrprod.azurecr.io', 'privatelink.azurecr.io'],
    ['syn-prod.dev.azuresynapse.net', 'privatelink.dev.azuresynapse.net'],
  ];
  const TRAPS = { 'kv-data-prod.vault.azure.net': 'privatelink.vault.azure.net', 'stadlsprod001.dfs.core.windows.net': 'dfs.core.windows.net' };
  decks.dns = {
    id: 'dns', icon: '🌐', title: 'Zone Zapper', maxOptions: 4,
    howto: 'Match each service FQDN to the private DNS zone that answers for its private endpoint. Watch for traps!',
    next: mix([() => {
      const [host, zone] = pick(ZONES);
      const pool = ZONES.map(z => z[1]).filter(z => z !== zone);
      const wrongs = [];
      if (TRAPS[host]) wrongs.push(TRAPS[host]);
      while (wrongs.length < 3) { const w = pick(pool); if (!wrongs.includes(w)) wrongs.push(w); }
      return { q: `Private DNS zone for<br><b class="mono">${host}</b>`, ...shuffleOptions(zone, wrongs),
        why: `${host} CNAMEs to its privatelink name, which ${zone} answers with the private IP.` };
    }], [
      ['What is <b class="mono">168.63.129.16</b>?', 'Azure\'s virtual DNS / platform IP', ['Your firewall', 'The ER gateway', 'A public DNS server'], 'Azure-provided DNS inside every VNet. Not reachable from on-prem.'],
      ['On-prem conditional forwarder for ADLS should forward…', 'dfs.core.windows.net', ['privatelink.dfs.core.windows.net', 'windows.net', 'azure.com'], 'Clients query the public name; the CNAME chain leads to the private zone.'],
      ['Auto-registration on a <b>privatelink</b> zone?', 'Off', ['On'], 'Auto-registration creates VM records — never wanted in privatelink zones.'],
      ['On-prem forwards Azure queries to…', 'Private Resolver inbound endpoint', ['168.63.129.16', 'The firewall public IP', 'The PE\'s IP'], 'The inbound endpoint is a private IP reachable over ExpressRoute.'],
      ['Azure VMs need to resolve <b>corp.cloudera.local</b> on-prem. Use…', 'Resolver outbound endpoint + forwarding ruleset', ['Inbound endpoint', 'Private DNS zone', 'A hosts file'], 'Outbound endpoint + ruleset forwards Azure → on-prem queries.'],
      ['Private DNS zone must be ___ to the VNet whose resolver queries it', 'Linked', ['Peered', 'Delegated', 'Associated'], 'Zones answer only for VNets that have a virtual network link.'],
    ], .35),
  };

  return decks;
})();

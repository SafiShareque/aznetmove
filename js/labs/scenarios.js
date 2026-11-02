/* ═══════════════════════════════════════════════════════
   AzNetMove — Portal Lab scenarios (one per module)
   Each scenario: wizard steps + work-ticket objectives + Bicep.
   Architecture: Hub 10.0.0.0/16 (FW 10.0.0.4, GatewaySubnet
   10.0.1.0/27, Bastion 10.0.2.0/26), Data 10.1/16, Compute 10.2/16,
   Mgmt 10.3/16, on-prem Cloudera DC 192.168.0.0/16 via ExpressRoute.
   ═══════════════════════════════════════════════════════ */

const PORTAL_SCENARIOS = (() => {
  const C = Portal.cidr;
  const n = s => String(s ?? '').trim().toLowerCase();
  const REGIONS = ['East US', 'East US 2', 'West Europe', 'Central India'];
  const RGS = ['rg-network-prod', 'rg-data-prod', 'rg-compute-prod', 'rg-mgmt-prod'];
  const SUBS = ['sub-sandbox', 'sub-connectivity-prod', 'sub-data-prod', 'sub-compute-prod'];
  const ANY_SRC = ['*', 'any', 'internet', '0.0.0.0/0'];
  const list = s => String(s || '').split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);

  const basics = () => [
    { id: 'rg', label: 'Resource group', type: 'select', options: RGS, required: true },
    { id: 'name', label: 'Name', type: 'text', required: true },
    { id: 'region', label: 'Region', type: 'select', options: REGIONS, required: true },
  ];
  const where = (v, name, rg, region = 'East US 2') => {
    const bad = [];
    if (n(v.name) !== name) bad.push(`name is "${v.name || ''}"`);
    if (v.rg !== rg) bad.push(`resource group is ${v.rg}`);
    if (v.region !== region) bad.push(`region is ${v.region}`);
    return bad.length ? bad.join(', ') : true;
  };

  /* NSG port spec: "3389", "3000-4000", "*", "80,443" */
  function portMatches(spec, port) {
    return String(spec || '').split(',').some(p => {
      p = p.trim();
      if (p === '*' || n(p) === 'any') return true;
      const m = p.match(/^(\d+)-(\d+)$/);
      return m ? port >= +m[1] && port <= +m[2] : +p === port;
    });
  }

  /* Effective route lookup for the compute spoke (system routes + UDRs, longest prefix wins,
     a UDR replaces a system route with the same prefix) */
  function effectiveRoute(routes, ip) {
    const sys = [
      { prefix: '10.2.0.0/16', type: 'VnetLocal', src: 'System' },
      { prefix: '10.0.0.0/16', type: 'VNetPeering', src: 'System' },
      { prefix: '10.0.0.0/8', type: 'None', src: 'System' },
      { prefix: '172.16.0.0/12', type: 'None', src: 'System' },
      { prefix: '192.168.0.0/16', type: 'None', src: 'System' },
      { prefix: '0.0.0.0/0', type: 'Internet', src: 'System' },
    ];
    const user = routes.filter(r => C.valid(r.prefix)).map(r => ({ prefix: r.prefix.trim(), type: r.nextHopType, ip: (r.nextHopIp || '').trim(), src: 'User' }));
    const all = [...sys.filter(s => !user.some(u => C.equals(u.prefix, s.prefix))), ...user];
    return all.filter(r => C.ipIn(ip, r.prefix)).sort((a, b) => C.parse(b.prefix).bits - C.parse(a.prefix).bits)[0];
  }
  const viaFirewall = (v, ip) => {
    const r = effectiveRoute(v.routes, ip);
    if (r && r.type === 'VirtualAppliance' && r.ip === '10.0.0.4') return true;
    return r ? `${ip} matches ${r.prefix} → ${r.type}${r.ip ? ' ' + r.ip : ''} (${r.src} route)` : `no route for ${ip}`;
  };

  /* AVNM dynamic membership evaluation */
  const INVENTORY = [
    { name: 'vnet-hub-prod', tags: { env: 'prod', role: 'hub' } },
    { name: 'vnet-data-prod', tags: { env: 'prod', role: 'data' } },
    { name: 'vnet-compute-prod', tags: { env: 'prod', role: 'compute' } },
    { name: 'vnet-mgmt-prod', tags: { env: 'prod', role: 'mgmt' } },
    { name: 'vnet-dev-sandbox', tags: { env: 'dev', role: 'compute' } },
    { name: 'vnet-poc-legacy', tags: { role: 'data' } },
  ];
  function members(conds) {
    const valid = conds.filter(c => n(c.key));
    if (!valid.length) return [];
    return INVENTORY.filter(vn => valid.every(c => {
      const tv = vn.tags[n(c.key)];
      const want = n(c.value);
      if (c.op === 'Equals') return tv !== undefined && n(tv) === want;
      if (c.op === 'Not equals') return tv === undefined || n(tv) !== want;
      if (c.op === 'Contains') return tv !== undefined && n(tv).includes(want);
      return false;
    })).map(vn => vn.name);
  }

  const scenarios = {};

  /* ── 1. IP ADDRESSES: IPAM pool ── */
  scenarios.ip = {
    id: 'ip', icon: '🔢', ticket: 'AZM-101', xp: 100,
    title: 'Create IP address pool', resource: 'IP address pool',
    breadcrumb: ['Home', 'Network managers', 'avnm-prod', 'IP address pools', 'Create'],
    brief: `Before any VNet exists, reserve the migration's address space in Virtual Network Manager <b>IPAM</b> so no team can grab an overlapping range.
      On-prem, the Cloudera datacenter uses <code>192.168.0.0/16</code> and <code>172.16.0.0/16</code>.
      Azure needs four /16s: hub <code>10.0</code>, data <code>10.1</code>, compute <code>10.2</code>, mgmt <code>10.3</code>.`,
    steps: [
      { name: 'Basics', fields: [
        { id: 'name', label: 'Pool name', type: 'text', required: true, placeholder: 'ipam-…' },
        { id: 'region', label: 'Region', type: 'select', options: REGIONS, required: true },
        { id: 'prefix', label: 'Root address prefix', type: 'text', required: true, placeholder: 'x.x.x.x/nn', help: 'One CIDR block the whole Azure estate is carved from.' },
      ] },
      { name: 'Child pools', intro: 'Carve one child pool per VNet out of the root prefix.', fields: [
        { id: 'pools', label: 'Child pools', type: 'rows', columns: [
          { id: 'name', label: 'Name', placeholder: 'pool-hub' },
          { id: 'prefix', label: 'Address prefix', placeholder: '10.0.0.0/16' },
        ] },
      ] },
    ],
    defaults: { name: '', region: 'East US', prefix: '', pools: [{ name: 'pool-hub', prefix: '' }] },
    objectives: [
      { text: 'Name the pool <code>ipam-azure-prod</code> in <b>East US 2</b>',
        check: v => (n(v.name) === 'ipam-azure-prod' && v.region === 'East US 2') || `name "${v.name}", region ${v.region}`,
        hint: 'Basics tab: type the exact name and pick East US 2 (where the hub lives).' },
      { text: 'Root prefix is the <b>smallest single block</b> covering 10.0.0.0/16 – 10.3.0.0/16',
        check: v => !C.valid(v.prefix) ? 'not a valid, aligned CIDR' : C.equals(v.prefix, '10.0.0.0/14') || `${v.prefix} is not the tightest fit`,
        hint: 'Four /16s = 4 × 65,536 addresses = 2² × /16 → a /14. 10.0.0.0/14 spans 10.0.0.0 – 10.3.255.255.' },
      { text: 'Root prefix is private (RFC 1918) and doesn\'t overlap on-prem',
        check: v => C.valid(v.prefix) && C.isPrivate(v.prefix) && !C.overlaps(v.prefix, '192.168.0.0/16') && !C.overlaps(v.prefix, '172.16.0.0/16'),
        hint: 'Overlapping ranges can never be routed over ExpressRoute. Stay inside 10.0.0.0/8.' },
      { text: 'Four child pools — exactly 10.0.0.0/16, 10.1.0.0/16, 10.2.0.0/16, 10.3.0.0/16',
        check: v => {
          const want = ['10.0.0.0/16', '10.1.0.0/16', '10.2.0.0/16', '10.3.0.0/16'];
          const missing = want.filter(w => !v.pools.some(p => C.equals(p.prefix, w)));
          if (v.pools.length !== 4) return `you have ${v.pools.length} pool(s)`;
          return missing.length ? 'missing ' + missing.join(', ') : true;
        },
        hint: 'Child pools tab: "＋ Add" until you have hub, data, compute and mgmt rows — one /16 each.' },
      { text: 'Every child pool has a name, sits inside the root and none overlap',
        check: v => {
          if (v.pools.some(p => !n(p.name))) return 'a pool has no name';
          if (v.pools.some(p => !C.valid(p.prefix) || !C.contains(v.prefix, p.prefix))) return 'a pool is invalid or outside the root';
          for (let i = 0; i < v.pools.length; i++) for (let j = i + 1; j < v.pools.length; j++)
            if (C.overlaps(v.pools[i].prefix, v.pools[j].prefix)) return `${v.pools[i].name} overlaps ${v.pools[j].name}`;
          return true;
        },
        hint: 'IPAM refuses overlapping allocations — that is the whole point of using it.' },
    ],
    resourceName: v => v.name,
    debrief: 'IPAM hands out non-overlapping CIDRs from a pool, so every future VNet is peerable and routable over ExpressRoute. Planning a /14 now leaves the rest of 10.0.0.0/8 free for future regions.',
    bicep: v => `resource avnm 'Microsoft.Network/networkManagers@2024-05-01' existing = {
  name: 'avnm-prod'
}

resource rootPool 'Microsoft.Network/networkManagers/ipamPools@2024-05-01' = {
  parent: avnm
  name: '${v.name}'
  location: '${n(v.region).replace(/ /g, '')}'
  properties: {
    addressPrefixes: [ '${v.prefix}' ]
  }
}
${v.pools.map(p => `
resource ${n(p.name).replace(/[^a-z0-9]/g, '') || 'pool'} 'Microsoft.Network/networkManagers/ipamPools@2024-05-01' = {
  parent: avnm
  name: '${p.name}'
  location: '${n(v.region).replace(/ /g, '')}'
  properties: {
    parentPoolName: rootPool.name
    addressPrefixes: [ '${p.prefix}' ]
  }
}`).join('\n')}`,
  };

  /* ── 2. VNET & SUBNETS: compute spoke ── */
  const DELEGATIONS = ['None', 'Microsoft.Databricks/workspaces', 'Microsoft.Web/serverFarms', 'Microsoft.Sql/managedInstances'];
  scenarios.vnet = {
    id: 'vnet', icon: '🏗️', ticket: 'AZM-102', xp: 100,
    title: 'Create virtual network', resource: 'Virtual network',
    breadcrumb: ['Home', 'Virtual networks', 'Create virtual network'],
    brief: `Build the <b>compute spoke</b> for Databricks (VNet injection) and the ADF self-hosted IR.
      It must peer to the hub and reach on-prem through the hub's ExpressRoute gateway.`,
    steps: [
      { name: 'Basics', fields: [
        { id: 'sub', label: 'Subscription', type: 'select', options: SUBS, required: true },
        ...basics(),
      ] },
      { name: 'IP addresses', fields: [
        { id: 'space', label: 'IPv4 address space', type: 'text', required: true, help: 'The portal pre-fills 10.0.0.0/16 — is that right here?' },
        { id: 'subnets', label: 'Subnets', type: 'rows', columns: [
          { id: 'name', label: 'Subnet name', placeholder: 'snet-…' },
          { id: 'prefix', label: 'Address range', placeholder: '10.2.0.0/24' },
          { id: 'delegation', label: 'Delegate to service', type: 'select', options: DELEGATIONS, w: '1.4fr' },
        ] },
      ] },
      { name: 'Peering', fields: [
        { id: 'peer', label: 'Peer with', type: 'select', options: ['(none)', 'vnet-hub-prod', 'vnet-data-prod', 'vnet-mgmt-prod'] },
        { id: 'fwd', label: 'Allow forwarded traffic from the remote VNet', type: 'checkbox', help: 'Lets packets the hub firewall forwards (e.g. from other spokes) in.' },
        { id: 'remoteGw', label: 'Use the remote virtual network\'s gateway', type: 'checkbox', help: 'Spoke side of gateway transit.' },
      ] },
    ],
    defaults: { sub: 'sub-sandbox', rg: 'rg-network-prod', name: '', region: 'East US', space: '10.0.0.0/16',
      subnets: [{ name: 'default', prefix: '10.0.0.0/24', delegation: 'None' }], peer: '(none)', fwd: false, remoteGw: false },
    objectives: [
      { text: 'Create <code>vnet-compute-prod</code> in <b>sub-compute-prod</b> / <b>rg-compute-prod</b> / <b>East US 2</b>',
        check: v => v.sub !== 'sub-compute-prod' ? `subscription is ${v.sub}` : where(v, 'vnet-compute-prod', 'rg-compute-prod'),
        hint: 'Basics tab. Same region as the hub keeps peering latency and costs low.' },
      { text: 'Address space is the compute spoke\'s <code>10.2.0.0/16</code>',
        check: v => C.equals(v.space, '10.2.0.0/16') || `${v.space} — overlaps the hub?`,
        hint: 'The portal\'s default 10.0.0.0/16 collides with the hub — peering would be impossible.' },
      { text: 'Databricks subnets <code>snet-dbx-host</code> and <code>snet-dbx-container</code>, each <b>/26 or larger</b>, delegated to <code>Microsoft.Databricks/workspaces</code>',
        check: v => {
          for (const nm of ['snet-dbx-host', 'snet-dbx-container']) {
            const s = v.subnets.find(x => n(x.name) === nm);
            if (!s) return `${nm} missing`;
            const c = C.parse(s.prefix);
            if (!c || c.bits > 26) return `${nm} must be /26 or larger`;
            if (s.delegation !== 'Microsoft.Databricks/workspaces') return `${nm} is not delegated to Databricks`;
          }
          return true;
        },
        hint: 'VNet injection needs two dedicated subnets (host + container), both delegated. Bigger subnets = more cluster nodes: a /24 gives ~250.' },
      { text: '<code>snet-privateendpoints</code> exists with <b>no delegation</b>',
        check: v => {
          const s = v.subnets.find(x => n(x.name) === 'snet-privateendpoints');
          return !s ? 'missing' : s.delegation === 'None' || 'private endpoints can\'t live in a delegated subnet';
        },
        hint: 'Delegated subnets are reserved for one service — private endpoints need an undelegated one.' },
      { text: 'All subnets are valid, inside 10.2.0.0/16 and don\'t overlap',
        check: v => {
          for (const s of v.subnets) if (!C.valid(s.prefix) || !C.contains(v.space, s.prefix)) return `${s.name || 'a subnet'} (${s.prefix}) is outside the address space`;
          for (let i = 0; i < v.subnets.length; i++) for (let j = i + 1; j < v.subnets.length; j++)
            if (C.overlaps(v.subnets[i].prefix, v.subnets[j].prefix)) return `${v.subnets[i].name} overlaps ${v.subnets[j].name}`;
          return true;
        },
        hint: 'Delete the portal\'s "default" subnet (it\'s 10.0.0.0/24) and give each subnet its own block, e.g. 10.2.0.0/24, 10.2.1.0/24, 10.2.2.0/24.' },
      { text: 'Peer to <code>vnet-hub-prod</code> with <b>forwarded traffic</b> allowed and the <b>remote gateway</b> used',
        check: v => v.peer !== 'vnet-hub-prod' ? 'not peered to the hub' : !v.fwd ? 'forwarded traffic is blocked' : v.remoteGw || 'not using the hub gateway',
        hint: 'Peering tab. "Use remote gateway" is what lets this spoke reach on-prem through the hub\'s ExpressRoute gateway.' },
    ],
    resourceName: v => v.name,
    debrief: 'Address space + delegated subnets + gateway transit is the full recipe for a Databricks spoke. Remember peering is not transitive: this spoke reaches other spokes only via the hub firewall and a UDR.',
    bicep: v => `resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${v.name}'
  location: '${n(v.region).replace(/ /g, '')}'
  properties: {
    addressSpace: { addressPrefixes: [ '${v.space}' ] }
    subnets: [${v.subnets.map(s => `
      {
        name: '${s.name}'
        properties: {
          addressPrefix: '${s.prefix}'${s.delegation !== 'None' ? `
          delegations: [ { name: 'del', properties: { serviceName: '${s.delegation}' } } ]` : ''}
        }
      }`).join('')}
    ]
  }
}

resource hub 'Microsoft.Network/virtualNetworks@2024-05-01' existing = {
  name: '${v.peer}'
  scope: resourceGroup('sub-connectivity-prod', 'rg-network-prod')
}

resource toHub 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2024-05-01' = {
  parent: vnet
  name: 'peer-to-hub'
  properties: {
    remoteVirtualNetwork: { id: hub.id }
    allowVirtualNetworkAccess: true
    allowForwardedTraffic: ${v.fwd}
    useRemoteGateways: ${v.remoteGw}
  }
}`,
  };

  /* ── 3. NSG: self-hosted IR subnet ── */
  scenarios.nsg = {
    id: 'nsg', icon: '🛡️', ticket: 'AZM-103', xp: 100,
    title: 'Create network security group', resource: 'Network security group',
    breadcrumb: ['Home', 'Network security groups', 'Create network security group'],
    brief: `Lock down <code>snet-shir</code>, where the ADF self-hosted integration runtime VMs live.
      Admins connect only through <b>Azure Bastion</b> (<code>AzureBastionSubnet 10.0.2.0/26</code> in the hub).
      <br><br>⚠️ A colleague left a "temporary" rule in the draft — review it.`,
    steps: [
      { name: 'Basics', fields: basics() },
      { name: 'Security rules', intro: 'Lower priority number = evaluated first. Default rules (65000+) still apply after yours.', fields: [
        { id: 'rules', label: 'Security rules', type: 'rows', columns: [
          { id: 'priority', label: 'Priority', placeholder: '100', w: '.7fr' },
          { id: 'name', label: 'Name', placeholder: 'Allow-…', w: '1.3fr' },
          { id: 'direction', label: 'Direction', type: 'select', options: ['Inbound', 'Outbound'] },
          { id: 'source', label: 'Source', placeholder: '10.0.2.0/26', w: '1.2fr' },
          { id: 'dest', label: 'Destination', placeholder: '* / tag', w: '1.4fr' },
          { id: 'port', label: 'Port', placeholder: '3389', w: '.7fr' },
          { id: 'protocol', label: 'Protocol', type: 'select', options: ['TCP', 'UDP', 'Any'], w: '.8fr' },
          { id: 'action', label: 'Action', type: 'select', options: ['Allow', 'Deny'], w: '.8fr' },
        ] },
      ] },
    ],
    defaults: { rg: 'rg-network-prod', name: '', region: 'East US',
      rules: [{ priority: '100', name: 'Allow-RDP-Temp', direction: 'Inbound', source: '*', dest: '*', port: '3389', protocol: 'TCP', action: 'Allow' }] },
    objectives: [
      { text: 'Create <code>nsg-snet-shir</code> in <b>rg-compute-prod</b> / <b>East US 2</b>',
        check: v => where(v, 'nsg-snet-shir', 'rg-compute-prod'),
        hint: 'An NSG must be in the same region as the subnet it protects.' },
      { text: 'Allow inbound <b>TCP 3389</b> from the Bastion subnet <code>10.0.2.0/26</code>',
        check: v => v.rules.some(r => r.direction === 'Inbound' && r.action === 'Allow' && C.equals(r.source, '10.0.2.0/26') && portMatches(r.port, 3389) && r.protocol !== 'UDP') || 'no matching allow rule',
        hint: 'Source = 10.0.2.0/26, port 3389, TCP, Allow, Inbound.' },
      { text: 'Deny RDP from <b>everyone else</b> — evaluated <b>after</b> the Bastion rule',
        check: v => {
          const allow = v.rules.find(r => r.direction === 'Inbound' && r.action === 'Allow' && C.equals(r.source, '10.0.2.0/26') && portMatches(r.port, 3389));
          const deny = v.rules.find(r => r.direction === 'Inbound' && r.action === 'Deny' && (ANY_SRC.includes(n(r.source)) || n(r.source) === 'virtualnetwork') && portMatches(r.port, 3389));
          if (!deny) return 'no deny rule for 3389 from * / VirtualNetwork';
          if (!allow) return 'add the Bastion allow rule first';
          return +deny.priority > +allow.priority || 'the deny rule\'s priority must be a higher number than the allow rule\'s';
        },
        hint: 'Why needed? The default AllowVnetInBound (65000) would let any peered VNet RDP in. Add e.g. priority 200, source *, port 3389, Deny.' },
      { text: 'No rule allows RDP from <code>*</code> / Internet',
        check: v => {
          const bad = v.rules.find(r => r.direction === 'Inbound' && r.action === 'Allow' && ANY_SRC.includes(n(r.source)) && portMatches(r.port, 3389));
          return !bad || `"${bad.name}" opens RDP to the world`;
        },
        hint: 'Delete (🗑) the "Allow-RDP-Temp" rule — exposed RDP is the #1 way VMs get ransomware.' },
      { text: 'Allow outbound <b>TCP 443</b> to the <code>DataFactoryManagement</code> service tag',
        check: v => v.rules.some(r => r.direction === 'Outbound' && r.action === 'Allow' && n(r.dest) === 'datafactorymanagement' && portMatches(r.port, 443) && r.protocol !== 'UDP') || 'missing',
        hint: 'The SHIR talks to its ADF control plane over HTTPS. Service tags stay current automatically — no IP lists.' },
      { text: 'Priorities are unique and between 100 and 4096',
        check: v => {
          if (v.rules.some(r => !/^\d+$/.test(r.priority.trim()) || +r.priority < 100 || +r.priority > 4096)) return 'out-of-range priority';
          // Priorities only need to be unique within a direction
          const keys = v.rules.map(r => r.direction + ':' + +r.priority);
          return new Set(keys).size === keys.length || 'duplicate priority';
        },
        hint: 'Leave gaps (100, 200, 300…) so you can insert rules later.' },
    ],
    resourceName: v => v.name,
    debrief: 'NSGs are stateful: allowing inbound 3389 automatically lets the reply out. Rules are processed lowest number first and stop at the first match — order is everything.',
    bicep: v => `resource nsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: '${v.name}'
  location: '${n(v.region).replace(/ /g, '')}'
  properties: {
    securityRules: [${v.rules.map(r => `
      {
        name: '${r.name}'
        properties: {
          priority: ${+r.priority || 0}
          direction: '${r.direction}'
          access: '${r.action}'
          protocol: '${r.protocol === 'Any' ? '*' : r.protocol[0] + r.protocol.slice(1).toLowerCase()}'
          sourceAddressPrefix: '${r.source}'
          sourcePortRange: '*'
          destinationAddressPrefix: '${r.dest || '*'}'
          destinationPortRange: '${r.port}'
        }
      }`).join('')}
    ]
  }
}`,
  };

  /* ── 4. ROUTING: compute spoke route table ── */
  scenarios.routing = {
    id: 'routing', icon: '🗺️', ticket: 'AZM-104', xp: 100,
    title: 'Create route table', resource: 'Route table',
    breadcrumb: ['Home', 'Route tables', 'Create route table'],
    brief: `Force <b>all</b> traffic leaving the compute spoke — to the internet, to other spokes, and to the on-prem Cloudera DC (<code>192.168.10.0/24</code>) — through the hub firewall at <code>10.0.0.4</code>.
      <br><br>Remember Azure's hidden system routes: <code>10.0.0.0/8</code>, <code>172.16.0.0/12</code> and <code>192.168.0.0/16</code> → <b>None</b> (drop).`,
    steps: [
      { name: 'Basics', fields: [
        ...basics(),
        { id: 'propagate', label: 'Propagate gateway routes', type: 'radio', options: ['Yes', 'No'], help: 'Yes = BGP routes from ExpressRoute are injected into subnets using this table.' },
      ] },
      { name: 'Routes', fields: [
        { id: 'routes', label: 'Routes', type: 'rows', columns: [
          { id: 'name', label: 'Route name', placeholder: 'to-firewall' },
          { id: 'prefix', label: 'Destination prefix', placeholder: '0.0.0.0/0' },
          { id: 'nextHopType', label: 'Next hop type', type: 'select', options: ['VirtualAppliance', 'VirtualNetworkGateway', 'VnetLocal', 'Internet', 'None'], w: '1.3fr' },
          { id: 'nextHopIp', label: 'Next hop IP', placeholder: '10.0.0.4' },
        ] },
      ] },
      { name: 'Subnets', intro: 'Associate the route table with subnets in vnet-compute-prod.', fields: [
        { id: 'aHost', label: 'snet-dbx-host', type: 'checkbox' },
        { id: 'aCont', label: 'snet-dbx-container', type: 'checkbox' },
        { id: 'aShir', label: 'snet-shir', type: 'checkbox' },
      ] },
    ],
    defaults: { rg: 'rg-network-prod', name: '', region: 'East US', propagate: 'Yes', routes: [], aHost: false, aCont: false, aShir: false },
    objectives: [
      { text: 'Create <code>rt-compute-spoke</code> in <b>rg-compute-prod</b> / <b>East US 2</b>',
        check: v => where(v, 'rt-compute-spoke', 'rg-compute-prod'),
        hint: 'Route tables must be in the same region as the VNet.' },
      { text: 'Internet-bound traffic (e.g. <code>8.8.8.8</code>) goes to the firewall',
        check: v => viaFirewall(v, '8.8.8.8'),
        hint: 'Add 0.0.0.0/0 → VirtualAppliance → 10.0.0.4. A UDR with the same prefix replaces the system Internet route.' },
      { text: 'Spoke-to-spoke traffic (<code>10.1.0.5</code>, <code>10.3.0.5</code>) goes to the firewall',
        check: v => { const a = viaFirewall(v, '10.1.0.5'); return a !== true ? a : viaFirewall(v, '10.3.0.5'); },
        hint: '0.0.0.0/0 isn\'t enough! The system route 10.0.0.0/8 → None is more specific and drops it. Add 10.0.0.0/8 → VirtualAppliance 10.0.0.4 (the peered hub\'s /16 still wins for hub traffic).' },
      { text: 'On-prem traffic (<code>192.168.10.20</code>) goes to the firewall',
        check: v => viaFirewall(v, '192.168.10.20'),
        hint: 'Same trap: 192.168.0.0/16 → None. Add 192.168.0.0/16 (or the /24) → VirtualAppliance 10.0.0.4.' },
      { text: '<b>Gateway route propagation</b> is disabled',
        check: v => v.propagate === 'No' || 'BGP routes would let on-prem traffic bypass the firewall',
        hint: 'With propagation on, the more specific BGP routes from ExpressRoute beat your UDRs and skip the firewall.' },
      { text: 'Every VirtualAppliance route points at <code>10.0.0.4</code>; other next hop types have no IP',
        check: v => v.routes.every(r => r.nextHopType === 'VirtualAppliance' ? r.nextHopIp.trim() === '10.0.0.4' : !r.nextHopIp.trim()) || 'check your next hop IPs',
        hint: 'Only VirtualAppliance takes a next hop IP — the firewall\'s private IP.' },
      { text: 'Associated with <b>snet-dbx-host</b>, <b>snet-dbx-container</b> and <b>snet-shir</b>',
        check: v => (v.aHost && v.aCont && v.aShir) || 'a subnet is not associated',
        hint: 'A route table does nothing until it\'s associated with a subnet.' },
    ],
    resourceName: v => v.name,
    debrief: 'Effective route = longest prefix match across system, BGP and user routes; a UDR beats a system/BGP route only when the prefixes are equal. That\'s why the RFC 1918 "None" routes catch people out.',
    bicep: v => `resource rt 'Microsoft.Network/routeTables@2024-05-01' = {
  name: '${v.name}'
  location: '${n(v.region).replace(/ /g, '')}'
  properties: {
    disableBgpRoutePropagation: ${v.propagate === 'No'}
    routes: [${v.routes.map(r => `
      {
        name: '${r.name}'
        properties: {
          addressPrefix: '${r.prefix}'
          nextHopType: '${r.nextHopType}'${r.nextHopType === 'VirtualAppliance' ? `
          nextHopIpAddress: '${r.nextHopIp}'` : ''}
        }
      }`).join('')}
    ]
  }
}
// Associate: set routeTable: { id: rt.id } on ${[v.aHost && 'snet-dbx-host', v.aCont && 'snet-dbx-container', v.aShir && 'snet-shir'].filter(Boolean).join(', ') || 'no subnets'}`,
  };

  /* ── 5. NETWORK GROUPS: AVNM ── */
  scenarios.netgroups = {
    id: 'netgroups', icon: '🔗', ticket: 'AZM-105', xp: 100,
    title: 'Network group + connectivity configuration', resource: 'Connectivity configuration',
    breadcrumb: ['Home', 'Network managers', 'avnm-prod', 'Network groups', 'Create'],
    brief: `New spokes keep appearing. Make Virtual Network Manager pick up <b>every production spoke automatically</b> (and nothing else), then wire them hub-and-spoke to <code>vnet-hub-prod</code>.
      <table class="portal-mini"><tr><th>VNet</th><th>Tags</th></tr>
      ${INVENTORY.map(vn => `<tr><td>${vn.name}</td><td>${Object.entries(vn.tags).map(([k, val]) => `${k}=${val}`).join(', ') || '—'}</td></tr>`).join('')}</table>`,
    steps: [
      { name: 'Network group', fields: [
        { id: 'ngName', label: 'Network group name', type: 'text', required: true, placeholder: 'ng-…' },
        { id: 'memberType', label: 'Member type', type: 'select', options: ['Virtual network', 'Subnet'] },
        { id: 'membership', label: 'Membership', type: 'radio', options: ['Static', 'Dynamic (Azure Policy)'] },
      ] },
      { name: 'Conditions', intro: 'Dynamic membership: a VNet joins when it matches <b>all</b> conditions. A missing tag counts as "not equal".', fields: [
        { id: 'conds', label: 'Conditions (AND)', type: 'rows', columns: [
          { id: 'key', label: 'Tag', placeholder: 'env' },
          { id: 'op', label: 'Operator', type: 'select', options: ['Equals', 'Not equals', 'Contains'] },
          { id: 'value', label: 'Value', placeholder: 'prod' },
        ] },
      ] },
      { name: 'Connectivity', fields: [
        { id: 'topology', label: 'Topology', type: 'radio', options: ['Mesh', 'Hub and spoke'] },
        { id: 'hub', label: 'Hub virtual network', type: 'select', options: ['(none)', 'vnet-hub-prod', 'vnet-mgmt-prod'] },
        { id: 'direct', label: 'Enable direct connectivity between spokes', type: 'checkbox', help: 'Creates spoke-to-spoke peerings that bypass the hub.' },
        { id: 'hubGw', label: 'Use hub as gateway', type: 'checkbox' },
        { id: 'deploy', label: 'Deploy to region', type: 'select', options: ['(not deployed)', ...REGIONS], help: 'Configurations do nothing until deployed to a region.' },
      ] },
    ],
    defaults: { ngName: '', memberType: 'Virtual network', membership: 'Static', conds: [{ key: '', op: 'Equals', value: '' }],
      topology: 'Mesh', hub: '(none)', direct: true, hubGw: false, deploy: '(not deployed)' },
    objectives: [
      { text: 'Network group <code>ng-prod-spokes</code> with member type <b>Virtual network</b>',
        check: v => (n(v.ngName) === 'ng-prod-spokes' && v.memberType === 'Virtual network') || `"${v.ngName}" / ${v.memberType}`,
        hint: 'Network group tab.' },
      { text: '<b>Dynamic</b> membership via Azure Policy',
        check: v => v.membership === 'Dynamic (Azure Policy)' || 'static groups need manual updates for every new spoke',
        hint: 'Dynamic membership creates an Azure Policy that adds matching VNets automatically.' },
      { text: 'Conditions match exactly <b>data, compute and mgmt</b> prod spokes',
        check: v => {
          const m = members(v.conds).sort();
          const want = ['vnet-compute-prod', 'vnet-data-prod', 'vnet-mgmt-prod'];
          return JSON.stringify(m) === JSON.stringify(want) || `your conditions select: ${m.join(', ') || 'nothing'}`;
        },
        hint: 'env Equals prod catches the hub too — add a second condition: role Not equals hub.' },
      { text: '<b>Hub and spoke</b> topology with <code>vnet-hub-prod</code> as the hub',
        check: v => (v.topology === 'Hub and spoke' && v.hub === 'vnet-hub-prod') || `${v.topology}, hub ${v.hub}`,
        hint: 'Connectivity tab.' },
      { text: 'Spokes must <b>not</b> talk directly — everything goes through the firewall',
        check: v => !v.direct || 'direct connectivity bypasses the hub firewall',
        hint: 'Turn off "Enable direct connectivity".' },
      { text: 'Spokes use the hub\'s gateway to reach on-prem',
        check: v => v.hubGw || 'off',
        hint: 'Turn on "Use hub as gateway" — AVNM sets gateway transit on every peering for you.' },
      { text: 'Configuration <b>deployed</b> to East US 2',
        check: v => v.deploy === 'East US 2' || `${v.deploy}`,
        hint: 'AVNM configs are a goal state — nothing changes until you deploy them to the region.' },
    ],
    resourceName: v => 'cc-hub-spoke-prod',
    debrief: 'With dynamic membership, the next prod spoke someone creates is tagged, joins ng-prod-spokes, and gets hub peering + gateway transit automatically — no tickets, no drift.',
    bicep: v => `resource avnm 'Microsoft.Network/networkManagers@2024-05-01' existing = {
  name: 'avnm-prod'
}

resource ng 'Microsoft.Network/networkManagers/networkGroups@2024-05-01' = {
  parent: avnm
  name: '${v.ngName}'
  properties: { memberType: '${v.memberType === 'Subnet' ? 'Subnet' : 'VirtualNetwork'}' }
}

// Dynamic membership = an Azure Policy with the addToNetworkGroup effect
resource membership 'Microsoft.Authorization/policyDefinitions@2023-04-01' = {
  name: 'pol-${v.ngName}'
  properties: {
    mode: 'Microsoft.Network.Data'
    policyRule: {
      if: {
        allOf: [
          { field: 'type', equals: 'Microsoft.Network/virtualNetworks' }${v.conds.filter(c => c.key).map(c => `
          { field: 'tags[\\'${c.key}\\']', ${c.op === 'Equals' ? 'equals' : c.op === 'Not equals' ? 'notEquals' : 'contains'}: '${c.value}' }`).join('')}
        ]
      }
      then: { effect: 'addToNetworkGroup', details: { networkGroupId: ng.id } }
    }
  }
}

resource cc 'Microsoft.Network/networkManagers/connectivityConfigurations@2024-05-01' = {
  parent: avnm
  name: 'cc-hub-spoke-prod'
  properties: {
    connectivityTopology: '${v.topology === 'Mesh' ? 'Mesh' : 'HubAndSpoke'}'
    hubs: [ { resourceType: 'Microsoft.Network/virtualNetworks', resourceId: resourceId('Microsoft.Network/virtualNetworks', '${v.hub}') } ]
    appliesToGroups: [
      {
        networkGroupId: ng.id
        groupConnectivity: '${v.direct ? 'DirectlyConnected' : 'None'}'
        useHubGateway: '${v.hubGw}'
      }
    ]
  }
}
// Then: Deploy → ${v.deploy}`,
  };

  /* ── 6. FIREWALL: policy ── */
  scenarios.firewall = {
    id: 'firewall', icon: '🔥', ticket: 'AZM-106', xp: 100,
    title: 'Create firewall policy', resource: 'Firewall policy',
    breadcrumb: ['Home', 'Firewall Policies', 'Create Azure Firewall Policy'],
    brief: `Security wants <b>IDPS</b> and threat intel <b>blocking</b> on the hub firewall.
      Databricks clusters (<code>10.2.0.0/16</code>) may only reach PyPI on the internet, plus Hive on the on-prem Cloudera cluster (<code>192.168.10.0/24</code>, TCP 10000).
      <br><br>⚠️ The draft still contains a migration-week shortcut — remove it.`,
    steps: [
      { name: 'Basics', fields: [
        ...basics(),
        { id: 'tier', label: 'Policy tier', type: 'radio', options: ['Basic', 'Standard', 'Premium'] },
      ] },
      { name: 'DNS & Threat protection', fields: [
        { id: 'dnsProxy', label: 'DNS Proxy', type: 'checkbox', help: 'Firewall answers DNS for clients so FQDNs resolve the same way the firewall sees them.' },
        { id: 'ti', label: 'Threat intelligence mode', type: 'select', options: ['Off', 'Alert', 'Alert and deny'] },
        { id: 'idps', label: 'IDPS mode (Premium)', type: 'select', options: ['Disabled', 'Alert', 'Alert and deny'] },
      ] },
      { name: 'Application rules', fields: [
        { id: 'app', label: 'Application rules (Layer 7, FQDN)', type: 'rows', columns: [
          { id: 'name', label: 'Name', placeholder: 'allow-pypi' },
          { id: 'source', label: 'Source', placeholder: '10.2.0.0/16' },
          { id: 'protocol', label: 'Protocol', type: 'select', options: ['Https:443', 'Http:80', 'Mssql:1433'] },
          { id: 'fqdns', label: 'Target FQDNs', placeholder: 'pypi.org, files.pythonhosted.org', w: '2fr' },
          { id: 'action', label: 'Action', type: 'select', options: ['Allow', 'Deny'], w: '.8fr' },
        ] },
      ] },
      { name: 'Network rules', fields: [
        { id: 'net', label: 'Network rules (Layer 4)', type: 'rows', columns: [
          { id: 'name', label: 'Name', placeholder: 'allow-hive' },
          { id: 'source', label: 'Source', placeholder: '10.2.0.0/16' },
          { id: 'dest', label: 'Destination', placeholder: '192.168.10.0/24' },
          { id: 'port', label: 'Port', placeholder: '10000', w: '.7fr' },
          { id: 'protocol', label: 'Protocol', type: 'select', options: ['TCP', 'UDP', 'Any', 'ICMP'], w: '.8fr' },
          { id: 'action', label: 'Action', type: 'select', options: ['Allow', 'Deny'], w: '.8fr' },
        ] },
      ] },
    ],
    defaults: { rg: 'rg-network-prod', name: '', region: 'East US', tier: 'Standard', dnsProxy: false, ti: 'Alert', idps: 'Disabled',
      app: [{ name: 'allow-all-temp', source: '*', protocol: 'Https:443', fqdns: '*', action: 'Allow' }], net: [] },
    objectives: [
      { text: 'Create <code>fwpol-hub-prod</code> in <b>rg-network-prod</b> / <b>East US 2</b>',
        check: v => where(v, 'fwpol-hub-prod', 'rg-network-prod'),
        hint: 'Basics tab — the policy lives with the hub networking resources.' },
      { text: '<b>Premium</b> tier with IDPS in <b>Alert and deny</b>',
        check: v => v.tier !== 'Premium' ? `tier is ${v.tier} — IDPS needs Premium` : v.idps === 'Alert and deny' || `IDPS is ${v.idps}`,
        hint: 'IDPS (signature-based intrusion prevention) and TLS inspection are Premium-only.' },
      { text: 'Threat intelligence in <b>Alert and deny</b> mode',
        check: v => v.ti === 'Alert and deny' || `mode is ${v.ti}`,
        hint: '"Alert" only logs traffic to known-malicious IPs/domains; "Alert and deny" blocks it.' },
      { text: '<b>DNS Proxy</b> enabled',
        check: v => v.dnsProxy || 'off',
        hint: 'Required for FQDNs in network rules, and keeps client and firewall DNS answers consistent.' },
      { text: 'Allow <code>10.2.0.0/16</code> → <code>pypi.org</code> and <code>files.pythonhosted.org</code> over HTTPS',
        check: v => {
          const r = v.app.find(r => r.action === 'Allow' && C.equals(r.source, '10.2.0.0/16') && r.protocol === 'Https:443');
          if (!r) return 'no HTTPS allow rule from 10.2.0.0/16';
          const f = list(r.fqdns);
          const has = d => f.some(x => x === d || x === '*.' + d || (x.startsWith('*.') && d.endsWith(x.slice(1))));
          return (has('pypi.org') && has('files.pythonhosted.org')) || 'both pypi.org and files.pythonhosted.org are needed (pip downloads from the second)';
        },
        hint: 'One application rule: source 10.2.0.0/16, Https:443, target FQDNs "pypi.org, files.pythonhosted.org".' },
      { text: 'Allow <code>10.2.0.0/16</code> → Cloudera Hive <code>192.168.10.0/24</code> on <b>TCP 10000</b>',
        check: v => v.net.some(r => r.action === 'Allow' && C.equals(r.source, '10.2.0.0/16') && C.equals(r.dest, '192.168.10.0/24') && portMatches(r.port, 10000) && (r.protocol === 'TCP' || r.protocol === 'Any')) || 'missing',
        hint: 'Private IP-to-IP traffic is a network rule (L4), not an application rule.' },
      { text: 'No allow-everything rule (<code>*</code> source with <code>*</code> FQDN)',
        check: v => !v.app.some(r => r.action === 'Allow' && list(r.fqdns).includes('*')) || 'a rule still allows every FQDN',
        hint: 'Delete the allow-all-temp row — it makes every other rule pointless.' },
    ],
    resourceName: v => v.name,
    debrief: 'Azure Firewall processes DNAT → network → application rules. Network rules are checked first, so keep L4 rules tight; FQDN filtering for web traffic belongs in application rules.',
    bicep: v => `resource policy 'Microsoft.Network/firewallPolicies@2024-05-01' = {
  name: '${v.name}'
  location: '${n(v.region).replace(/ /g, '')}'
  properties: {
    sku: { tier: '${v.tier}' }
    threatIntelMode: '${v.ti === 'Alert and deny' ? 'Deny' : v.ti}'
    dnsSettings: { enableProxy: ${v.dnsProxy} }${v.tier === 'Premium' ? `
    intrusionDetection: { mode: '${v.idps === 'Alert and deny' ? 'Deny' : v.idps === 'Disabled' ? 'Off' : 'Alert'}' }` : ''}
  }
}

resource rules 'Microsoft.Network/firewallPolicies/ruleCollectionGroups@2024-05-01' = {
  parent: policy
  name: 'rcg-spokes'
  properties: {
    priority: 200
    ruleCollections: [
      {
        ruleCollectionType: 'FirewallPolicyFilterRuleCollection'
        name: 'net-allow'
        priority: 100
        action: { type: 'Allow' }
        rules: [${v.net.map(r => `
          {
            ruleType: 'NetworkRule'
            name: '${r.name}'
            sourceAddresses: [ '${r.source}' ]
            destinationAddresses: [ '${r.dest}' ]
            destinationPorts: [ '${r.port}' ]
            ipProtocols: [ '${r.protocol}' ]
          }`).join('')}
        ]
      }
      {
        ruleCollectionType: 'FirewallPolicyFilterRuleCollection'
        name: 'app-allow'
        priority: 200
        action: { type: 'Allow' }
        rules: [${v.app.map(r => `
          {
            ruleType: 'ApplicationRule'
            name: '${r.name}'
            sourceAddresses: [ '${r.source}' ]
            protocols: [ { protocolType: '${r.protocol.split(':')[0]}', port: ${r.protocol.split(':')[1]} } ]
            targetFqdns: [ ${list(r.fqdns).map(f => `'${f}'`).join(', ')} ]
          }`).join('')}
        ]
      }
    ]
  }
}`,
  };

  /* ── 7. TRAFFIC FLOW: ExpressRoute gateway ── */
  scenarios.traffic = {
    id: 'traffic', icon: '🚦', ticket: 'AZM-107', xp: 100,
    title: 'Create virtual network gateway', resource: 'Virtual network gateway',
    breadcrumb: ['Home', 'Virtual network gateways', 'Create virtual network gateway'],
    brief: `Bring the on-prem Cloudera datacenter into the hub over <b>ExpressRoute</b>. The gateway must survive an availability-zone outage.
      Hub subnets already in use: <code>AzureFirewallSubnet 10.0.0.0/26</code>, <code>AzureBastionSubnet 10.0.2.0/26</code>. The plan reserves <code>10.0.1.0/27</code> for the gateway.`,
    steps: [
      { name: 'Basics', fields: [
        ...basics(),
        { id: 'gwType', label: 'Gateway type', type: 'radio', options: ['VPN', 'ExpressRoute'] },
        { id: 'sku', label: 'SKU', type: 'select', options: ['Standard', 'HighPerformance', 'UltraPerformance', 'ErGw1AZ', 'ErGw2AZ', 'ErGw3AZ'] },
        { id: 'vnet', label: 'Virtual network', type: 'select', options: ['vnet-hub-prod', 'vnet-compute-prod'] },
        { id: 'subnetName', label: 'Gateway subnet name', type: 'text' },
        { id: 'subnetPrefix', label: 'Gateway subnet address range', type: 'text' },
      ] },
      { name: 'Connection', fields: [
        { id: 'circuit', label: 'ExpressRoute circuit', type: 'select', options: ['(none)', 'er-cloudera-dc-primary'] },
        { id: 'fastPath', label: 'FastPath', type: 'checkbox', help: 'Sends data-path traffic straight to VMs, bypassing the gateway. Only on Ultra Performance / ErGw3AZ.' },
      ] },
      { name: 'Hub peerings', intro: 'Settings on the hub side of each hub→spoke peering.', fields: [
        { id: 'transit', label: 'Allow gateway transit', type: 'checkbox', help: 'Lets spokes that set "Use remote gateway" use this gateway.' },
      ] },
    ],
    defaults: { rg: 'rg-network-prod', name: '', region: 'East US', gwType: 'VPN', sku: 'Standard', vnet: 'vnet-hub-prod',
      subnetName: 'snet-gateway', subnetPrefix: '10.0.1.0/29', circuit: '(none)', fastPath: false, transit: false },
    objectives: [
      { text: 'Create <code>vgw-er-hub-prod</code> in <b>rg-network-prod</b> / <b>East US 2</b>, in <b>vnet-hub-prod</b>',
        check: v => v.vnet !== 'vnet-hub-prod' ? 'gateways belong in the hub' : where(v, 'vgw-er-hub-prod', 'rg-network-prod'),
        hint: 'One gateway in the hub serves every spoke through gateway transit.' },
      { text: 'Gateway type <b>ExpressRoute</b> with a <b>zone-redundant</b> SKU',
        check: v => v.gwType !== 'ExpressRoute' ? 'type is VPN' : /AZ$/.test(v.sku) || `${v.sku} isn't zone-redundant`,
        hint: 'The "AZ" SKUs (ErGw1AZ/2AZ/3AZ) spread instances across availability zones.' },
      { text: 'Subnet named exactly <code>GatewaySubnet</code>',
        check: v => v.subnetName.trim() === 'GatewaySubnet' || `"${v.subnetName}"`,
        hint: 'Azure only deploys gateways into a subnet literally named GatewaySubnet.' },
      { text: 'Gateway subnet <code>10.0.1.0/27</code> or larger, inside the hub, not overlapping other hub subnets',
        check: v => {
          const c = C.parse(v.subnetPrefix);
          if (!c || !c.aligned) return 'invalid CIDR';
          if (c.bits > 27) return `/${c.bits} is too small`;
          if (!C.contains('10.0.0.0/16', v.subnetPrefix)) return 'outside 10.0.0.0/16';
          if (C.overlaps(v.subnetPrefix, '10.0.0.0/26')) return 'overlaps AzureFirewallSubnet';
          if (C.overlaps(v.subnetPrefix, '10.0.2.0/26')) return 'overlaps AzureBastionSubnet';
          return true;
        },
        hint: '/27 is the minimum Microsoft recommends for ExpressRoute (room for upgrades and coexistence with VPN).' },
      { text: 'Connect to circuit <code>er-cloudera-dc-primary</code>',
        check: v => v.circuit === 'er-cloudera-dc-primary' || 'no circuit',
        hint: 'Connection tab.' },
      { text: 'FastPath only if the SKU supports it',
        check: v => !v.fastPath || v.sku === 'ErGw3AZ' || v.sku === 'UltraPerformance' || `${v.sku} doesn't support FastPath`,
        hint: 'Either untick FastPath or choose ErGw3AZ.' },
      { text: 'Hub peerings <b>allow gateway transit</b>',
        check: v => v.transit || 'spokes can\'t use the gateway',
        hint: 'Gateway transit = hub side "Allow gateway transit" + spoke side "Use remote gateway".' },
    ],
    resourceName: v => v.name,
    debrief: 'On-prem routes now arrive by BGP and propagate to spokes through gateway transit — unless a spoke route table disables propagation and sends them via the firewall instead.',
    bicep: v => `resource gwSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  name: '${v.vnet}/${v.subnetName}'
  properties: { addressPrefix: '${v.subnetPrefix}' }
}

resource pip 'Microsoft.Network/publicIPAddresses@2024-05-01' = {
  name: 'pip-${v.name}'
  location: '${n(v.region).replace(/ /g, '')}'
  sku: { name: 'Standard' }
  zones: [ '1', '2', '3' ]
  properties: { publicIPAllocationMethod: 'Static' }
}

resource gw 'Microsoft.Network/virtualNetworkGateways@2024-05-01' = {
  name: '${v.name}'
  location: '${n(v.region).replace(/ /g, '')}'
  properties: {
    gatewayType: '${v.gwType === 'VPN' ? 'Vpn' : 'ExpressRoute'}'
    sku: { name: '${v.sku}', tier: '${v.sku}' }
    ipConfigurations: [
      {
        name: 'default'
        properties: {
          subnet: { id: gwSubnet.id }
          publicIPAddress: { id: pip.id }
        }
      }
    ]
  }
}

resource conn 'Microsoft.Network/connections@2024-05-01' = {
  name: 'conn-${v.circuit}'
  location: '${n(v.region).replace(/ /g, '')}'
  properties: {
    connectionType: 'ExpressRoute'
    virtualNetworkGateway1: { id: gw.id, properties: {} }
    peer: { id: resourceId('Microsoft.Network/expressRouteCircuits', '${v.circuit}') }
    expressRouteGatewayBypass: ${v.fastPath}
  }
}`,
  };

  /* ── 8. ENDPOINTS: private endpoint for ADLS ── */
  scenarios.endpoints = {
    id: 'endpoints', icon: '🔌', ticket: 'AZM-108', xp: 100,
    title: 'Create private endpoint', resource: 'Private endpoint',
    breadcrumb: ['Home', 'Private Link Center', 'Private endpoints', 'Create'],
    brief: `Databricks jobs write to ADLS Gen2 account <code>stadlsprod001</code> using <code>abfss://…@stadlsprod001.dfs.core.windows.net</code>.
      Give it a private IP in the <b>data spoke</b>, make the name resolve privately, then shut the public door.`,
    steps: [
      { name: 'Basics', fields: basics() },
      { name: 'Resource', fields: [
        { id: 'resType', label: 'Resource type', type: 'select', options: ['Microsoft.Storage/storageAccounts', 'Microsoft.Sql/servers', 'Microsoft.KeyVault/vaults'] },
        { id: 'resource', label: 'Resource', type: 'select', options: ['stadlsprod001', 'sql-cloudera-meta', 'kv-data-prod'] },
        { id: 'sub', label: 'Target sub-resource', type: 'select', options: ['blob', 'dfs', 'file', 'queue', 'table', 'web'], help: 'Each storage service has its own endpoint and needs its own private endpoint.' },
      ] },
      { name: 'Virtual Network', fields: [
        { id: 'vnet', label: 'Virtual network', type: 'select', options: ['vnet-hub-prod', 'vnet-data-prod', 'vnet-compute-prod'] },
        { id: 'subnet', label: 'Subnet', type: 'select', options: ['snet-dbx-host', 'snet-privateendpoints', 'GatewaySubnet'] },
        { id: 'alloc', label: 'Private IP configuration', type: 'radio', options: ['Dynamically allocate', 'Statically allocate'] },
      ] },
      { name: 'DNS', fields: [
        { id: 'dns', label: 'Integrate with private DNS zone', type: 'radio', options: ['Yes', 'No'] },
        { id: 'zone', label: 'Private DNS zone', type: 'select', options: ['privatelink.blob.core.windows.net', 'privatelink.dfs.core.windows.net', 'dfs.core.windows.net', 'privatelink.database.windows.net'] },
      ] },
      { name: 'Storage networking', intro: 'Setting on the storage account itself.', fields: [
        { id: 'public', label: 'Public network access', type: 'select', options: ['Enabled from all networks', 'Enabled from selected virtual networks and IP addresses', 'Disabled'] },
      ] },
    ],
    defaults: { rg: 'rg-network-prod', name: '', region: 'East US', resType: 'Microsoft.Storage/storageAccounts', resource: 'stadlsprod001', sub: 'blob',
      vnet: 'vnet-hub-prod', subnet: 'snet-dbx-host', alloc: 'Dynamically allocate', dns: 'No', zone: 'privatelink.blob.core.windows.net', public: 'Enabled from all networks' },
    objectives: [
      { text: 'Create <code>pe-stadlsprod001-dfs</code> in <b>rg-data-prod</b> / <b>East US 2</b>',
        check: v => where(v, 'pe-stadlsprod001-dfs', 'rg-data-prod'),
        hint: 'Name endpoints pe-&lt;resource&gt;-&lt;sub-resource&gt; so you can tell them apart later.' },
      { text: 'Target the storage account <code>stadlsprod001</code>, sub-resource <b>dfs</b>',
        check: v => v.resType !== 'Microsoft.Storage/storageAccounts' || v.resource !== 'stadlsprod001' ? 'wrong resource' : v.sub === 'dfs' || `sub-resource is ${v.sub}`,
        hint: 'abfss:// talks to the Data Lake endpoint (dfs.core.windows.net), not blob.' },
      { text: 'Place it in <code>vnet-data-prod</code> / <code>snet-privateendpoints</code>',
        check: v => v.vnet !== 'vnet-data-prod' ? `vnet is ${v.vnet}` : v.subnet === 'snet-privateendpoints' || `subnet is ${v.subnet}`,
        hint: 'Keep data-plane endpoints in the data spoke, in the subnet reserved for them.' },
      { text: 'Integrate with private DNS zone <code>privatelink.dfs.core.windows.net</code>',
        check: v => v.dns !== 'Yes' ? 'DNS integration is off — the name still resolves to the public IP' : v.zone === 'privatelink.dfs.core.windows.net' || `zone is ${v.zone}`,
        hint: 'The public name CNAMEs to stadlsprod001.privatelink.dfs.core.windows.net; the private zone answers that with the endpoint\'s IP.' },
      { text: 'Disable <b>public network access</b> on the storage account',
        check: v => v.public === 'Disabled' || 'the public endpoint is still reachable',
        hint: 'A private endpoint adds a private path — it doesn\'t close the public one.' },
    ],
    resourceName: v => v.name,
    debrief: 'stadlsprod001.dfs.core.windows.net now resolves to a 10.1.x.x address inside Azure. Databricks traffic stays on the Microsoft backbone and the account refuses internet connections.',
    bicep: v => `resource st 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: '${v.resource}'
}

resource pe 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: '${v.name}'
  location: '${n(v.region).replace(/ /g, '')}'
  properties: {
    subnet: { id: resourceId('Microsoft.Network/virtualNetworks/subnets', '${v.vnet}', '${v.subnet}') }
    privateLinkServiceConnections: [
      {
        name: '${v.name}'
        properties: {
          privateLinkServiceId: st.id
          groupIds: [ '${v.sub}' ]
        }
      }
    ]
  }
}
${v.dns === 'Yes' ? `
resource zoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: pe
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      { name: 'dfs', properties: { privateDnsZoneId: resourceId('Microsoft.Network/privateDnsZones', '${v.zone}') } }
    ]
  }
}
` : ''}
// On the storage account: publicNetworkAccess: '${v.public === 'Disabled' ? 'Disabled' : 'Enabled'}'`,
  };

  /* ── 9. DNS: private zone + resolver + on-prem forwarding ── */
  scenarios.dns = {
    id: 'dns', icon: '🌐', ticket: 'AZM-109', xp: 100,
    title: 'Private DNS for ADLS (Azure + on-prem)', resource: 'Private DNS zone',
    breadcrumb: ['Home', 'Private DNS zones', 'Create'],
    brief: `Both Databricks <b>and</b> on-prem Cloudera edge nodes must resolve <code>stadlsprod001.dfs.core.windows.net</code> to its private endpoint IP <code>10.1.4.5</code>.
      Spokes use the hub's DNS Private Resolver as their DNS server. Hub subnets in use: <code>10.0.0.0/26</code> (firewall), <code>10.0.1.0/27</code> (gateway), <code>10.0.2.0/26</code> (Bastion).`,
    steps: [
      { name: 'Private DNS zone', fields: [
        { id: 'rg', label: 'Resource group', type: 'select', options: RGS },
        { id: 'zone', label: 'Zone name', type: 'text', placeholder: 'privatelink.…' },
      ] },
      { name: 'Virtual network links', fields: [
        { id: 'link', label: 'Link to virtual network', type: 'select', options: ['(none)', 'vnet-hub-prod', 'vnet-data-prod'] },
        { id: 'autoReg', label: 'Enable auto registration', type: 'checkbox', help: 'Automatically creates A records for VMs in the linked VNet.' },
      ] },
      { name: 'DNS Private Resolver', fields: [
        { id: 'resolverVnet', label: 'Virtual network', type: 'select', options: ['vnet-hub-prod', 'vnet-data-prod'] },
        { id: 'inSubnet', label: 'Inbound endpoint subnet', type: 'text', placeholder: '10.0.x.x/28' },
        { id: 'inIp', label: 'Inbound endpoint IP (static)', type: 'text', placeholder: '10.0.x.x' },
      ] },
      { name: 'On-prem DNS', intro: 'Conditional forwarder on the Cloudera DC\'s DNS servers.', fields: [
        { id: 'fwdZone', label: 'Forward queries for domain', type: 'text', placeholder: '…' },
        { id: 'fwdTo', label: 'Forward to', type: 'text' },
      ] },
    ],
    defaults: { rg: 'rg-data-prod', zone: '', link: '(none)', autoReg: true, resolverVnet: 'vnet-data-prod', inSubnet: '', inIp: '', fwdZone: '', fwdTo: '168.63.129.16' },
    objectives: [
      { text: 'Zone <code>privatelink.dfs.core.windows.net</code> in <b>rg-network-prod</b> (central DNS)',
        check: v => n(v.zone) !== 'privatelink.dfs.core.windows.net' ? `zone is "${v.zone}"` : v.rg === 'rg-network-prod' || `resource group is ${v.rg}`,
        hint: 'One central zone per service, owned by the connectivity team — not one per spoke.' },
      { text: 'Linked to <code>vnet-hub-prod</code> with <b>auto registration off</b>',
        check: v => v.link !== 'vnet-hub-prod' ? `linked to ${v.link}` : !v.autoReg || 'auto registration must be off',
        hint: 'The resolver in the hub does the lookups, so the hub must be linked. Auto-registration is for VM records, never for privatelink zones.' },
      { text: 'Resolver in the hub; inbound subnet <b>/28 or larger</b>, inside 10.0.0.0/16, not overlapping other hub subnets',
        check: v => {
          if (v.resolverVnet !== 'vnet-hub-prod') return 'resolver isn\'t in the hub';
          const c = C.parse(v.inSubnet);
          if (!c || !c.aligned) return 'invalid subnet';
          if (c.bits > 28) return `/${c.bits} is too small`;
          if (!C.contains('10.0.0.0/16', v.inSubnet)) return 'outside the hub';
          for (const [p, nm] of [['10.0.0.0/26', 'firewall'], ['10.0.1.0/27', 'gateway'], ['10.0.2.0/26', 'Bastion']])
            if (C.overlaps(v.inSubnet, p)) return `overlaps the ${nm} subnet`;
          return true;
        },
        hint: 'e.g. 10.0.3.0/28 — the resolver needs a dedicated, delegated subnet of at least /28.' },
      { text: 'Inbound IP is a usable address inside that subnet',
        check: v => {
          const c = C.parse(v.inSubnet), ip = C.ipToInt(v.inIp);
          if (!c || ip === null) return 'invalid IP';
          if (ip < c.start || ip > c.end) return 'not inside the inbound subnet';
          if (ip - c.start < 4 || ip === c.end) return 'Azure reserves the first four and the last address';
          return true;
        },
        hint: 'In 10.0.3.0/28, .0–.3 and .15 are reserved — 10.0.3.4 is the first usable IP.' },
      { text: 'On-prem forwards the <b>public</b> zone name, not the privatelink one',
        check: v => {
          const z = n(v.fwdZone).replace(/\.$/, '');
          if (z.startsWith('privatelink.')) return 'clients ask for dfs.core.windows.net — forward that, and the CNAME chain does the rest';
          return z === 'dfs.core.windows.net' || z === 'core.windows.net' || `"${v.fwdZone}"`;
        },
        hint: 'Forward dfs.core.windows.net. Azure DNS returns the privatelink CNAME and then answers it from the private zone.' },
      { text: 'On-prem forwards to the resolver\'s inbound IP',
        check: v => v.fwdTo.trim() === '168.63.129.16' ? '168.63.129.16 is only reachable from inside Azure' : v.fwdTo.trim() === v.inIp.trim() || 'doesn\'t match the inbound endpoint IP',
        hint: 'The inbound endpoint is the private IP that on-prem can reach over ExpressRoute.' },
    ],
    resourceName: v => v.zone,
    debrief: 'Query path: Cloudera node → on-prem DNS → (ExpressRoute) → resolver inbound IP → Azure DNS → CNAME privatelink.dfs… → private zone → 10.1.4.5. Same answer everywhere, one zone to manage.',
    bicep: v => `resource zone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: '${v.zone}'
  location: 'global'
}

resource link 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: zone
  name: 'link-${v.link}'
  location: 'global'
  properties: {
    virtualNetwork: { id: resourceId('Microsoft.Network/virtualNetworks', '${v.link}') }
    registrationEnabled: ${v.autoReg}
  }
}

resource resolver 'Microsoft.Network/dnsResolvers@2022-07-01' = {
  name: 'dnspr-hub-prod'
  location: 'eastus2'
  properties: {
    virtualNetwork: { id: resourceId('Microsoft.Network/virtualNetworks', '${v.resolverVnet}') }
  }
}

resource inbound 'Microsoft.Network/dnsResolvers/inboundEndpoints@2022-07-01' = {
  parent: resolver
  name: 'in-hub'
  location: 'eastus2'
  properties: {
    ipConfigurations: [
      {
        subnet: { id: resourceId('Microsoft.Network/virtualNetworks/subnets', '${v.resolverVnet}', 'snet-dns-inbound') }  // ${v.inSubnet}
        privateIpAllocationMethod: 'Static'
        privateIpAddress: '${v.inIp}'
      }
    ]
  }
}

// On-prem DNS (Windows Server):
// Add-DnsServerConditionalForwarderZone -Name '${v.fwdZone}' -MasterServers ${v.fwdTo}`,
  };

  return scenarios;
})();

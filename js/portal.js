/* ═══════════════════════════════════════════════════════
   AzNetMove — Mock Azure Portal engine
   Renders a "Create resource" wizard from a scenario definition,
   validates it against the work ticket, and "deploys" it.
   ═══════════════════════════════════════════════════════ */

const Portal = (() => {

  /* ── CIDR helpers (shared with arcade decks) ── */
  const cidr = {
    ipToInt(ip) {
      const p = String(ip).trim().split('.');
      if (p.length !== 4) return null;
      let n = 0;
      for (const o of p) {
        if (!/^\d{1,3}$/.test(o) || +o > 255) return null;
        n = n * 256 + +o;
      }
      return n >>> 0;
    },
    intToIp(n) { return [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.'); },
    parse(str) {
      const m = String(str || '').trim().match(/^([\d.]+)\/(\d{1,2})$/);
      if (!m || +m[2] > 32) return null;
      const ip = cidr.ipToInt(m[1]);
      if (ip === null) return null;
      const bits = +m[2];
      const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
      return { ip, bits, mask, start: (ip & mask) >>> 0, end: ((ip & mask) | (~mask >>> 0)) >>> 0, aligned: ((ip & mask) >>> 0) === ip };
    },
    valid(str) { const c = cidr.parse(str); return !!c && c.aligned; },
    equals(a, b) { const x = cidr.parse(a), y = cidr.parse(b); return !!x && !!y && x.start === y.start && x.bits === y.bits; },
    contains(outer, inner) {
      const o = cidr.parse(outer), i = cidr.parse(inner);
      return !!o && !!i && i.start >= o.start && i.end <= o.end;
    },
    overlaps(a, b) {
      const x = cidr.parse(a), y = cidr.parse(b);
      return !!x && !!y && x.start <= y.end && y.start <= x.end;
    },
    ipIn(ip, block) {
      const n = cidr.ipToInt(ip), c = cidr.parse(block);
      return n !== null && !!c && n >= c.start && n <= c.end;
    },
    isPrivate(str) {
      return ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'].some(r => cidr.contains(r, str));
    },
  };

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── FIELD RENDERING ── */
  function fieldHTML(f, v) {
    const val = v[f.id];
    const label = `<label class="pf-label" for="pf-${f.id}">${f.label}${f.required ? ' <span class="pf-req">*</span>' : ''}</label>`;
    const help = f.help ? `<div class="pf-help">ⓘ ${f.help}</div>` : '';
    let input;
    switch (f.type) {
      case 'select':
        input = `<select class="pf-input" id="pf-${f.id}" data-f="${f.id}">
          ${f.options.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}
        </select>`;
        break;
      case 'radio':
        input = `<div class="pf-radio" role="radiogroup">
          ${f.options.map(o => `<button type="button" class="pf-radio-opt ${o === val ? 'on' : ''}" data-f="${f.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}
        </div>`;
        break;
      case 'checkbox':
        return `<div class="pf-row pf-check">
          <label class="pf-switch"><input type="checkbox" id="pf-${f.id}" data-f="${f.id}" ${val ? 'checked' : ''}><span></span></label>
          <div><label class="pf-label" for="pf-${f.id}">${f.label}</label>${help}</div>
        </div>`;
      case 'rows':
        return `<div class="pf-rows-wrap">
          <div class="pf-rows-title">${f.label}</div>${help}
          <div class="pf-rows" id="pf-${f.id}" style="--cols:${f.columns.map(c => c.w || '1fr').join(' ')} 40px">
            <div class="prow phead">${f.columns.map(c => `<div class="pcell">${c.label}</div>`).join('')}<div class="pcell"></div></div>
            ${(val || []).map((row, ri) => rowHTML(f, row, ri)).join('')}
          </div>
          <button type="button" class="btn btn-secondary btn-sm pf-add" data-add="${f.id}">＋ Add</button>
        </div>`;
      default:
        input = `<input class="pf-input" id="pf-${f.id}" data-f="${f.id}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}" autocomplete="off" spellcheck="false">`;
    }
    return `<div class="pf-row">${label}<div class="pf-control">${input}${help}</div></div>`;
  }

  function rowHTML(f, row, ri) {
    return `<div class="prow" data-row="${ri}">
      ${f.columns.map(c => `<div class="pcell"><span class="pcell-label">${c.label}</span>${
        c.type === 'select'
          ? `<select class="pf-input" data-rows="${f.id}" data-ri="${ri}" data-col="${c.id}">${c.options.map(o => `<option ${o === row[c.id] ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
          : `<input class="pf-input" data-rows="${f.id}" data-ri="${ri}" data-col="${c.id}" value="${esc(row[c.id])}" placeholder="${esc(c.placeholder || '')}" autocomplete="off" spellcheck="false">`
      }</div>`).join('')}
      <div class="pcell pcell-del"><button type="button" class="pf-del" data-del="${f.id}" data-ri="${ri}" aria-label="Delete row">🗑</button></div>
    </div>`;
  }

  /* ── MOUNT ── */
  function mount(el, sc) {
    const doneKey = 'portal-' + sc.id;
    const v = JSON.parse(JSON.stringify(sc.defaults));
    let step = 0;
    let lastResult = null;
    const steps = [...sc.steps.map(s => s.name), 'Review + create'];

    el.innerHTML = `
      <div class="portal">
        <div class="portal-topbar">
          <span class="portal-brand">☁️ Azure portal <em>simulator</em></span>
          <span class="portal-search">🔍 Search resources, services, and docs</span>
          <span class="portal-bell" title="Notifications">🔔<span class="portal-bell-dot"></span></span>
        </div>
        <div class="portal-crumbs">${sc.breadcrumb.map(esc).join(' <span>›</span> ')}</div>
        <div class="portal-layout">
          <details class="portal-ticket" open>
            <summary class="portal-ticket-head">📋 Work ticket <span class="portal-ticket-id">${sc.ticket}</span></summary>
            <div class="portal-ticket-brief">${sc.brief}</div>
            <ol class="portal-objectives">
              ${sc.objectives.map((o, i) => `<li data-obj="${i}"><span class="obj-mark">○</span><span>${o.text}</span></li>`).join('')}
            </ol>
            <div class="portal-ticket-xp">${State.isDone(doneKey) ? '✓ Completed — replay any time' : `⭐ ${sc.xp} XP on successful deployment`}</div>
          </details>
          <div class="portal-main">
            <div class="portal-title"><span class="portal-title-icon">${sc.icon}</span>${sc.title}</div>
            <div class="portal-steps"></div>
            <div class="portal-body"></div>
            <div class="portal-footer"></div>
          </div>
        </div>
      </div>`;

    const $ = s => el.querySelector(s);

    function renderSteps() {
      $('.portal-steps').innerHTML = steps.map((s, i) =>
        `<button type="button" class="portal-step ${i === step ? 'on' : ''}" data-step="${i}">${s}</button>`).join('');
    }

    function renderBody() {
      renderSteps();
      const body = $('.portal-body');
      if (step < sc.steps.length) {
        const s = sc.steps[step];
        body.innerHTML = (s.intro ? `<p class="portal-intro">${s.intro}</p>` : '') + s.fields.map(f => fieldHTML(f, v)).join('');
        $('.portal-footer').innerHTML = `
          <button type="button" class="btn btn-primary" data-nav="review">Review + create</button>
          <button type="button" class="btn btn-secondary" data-nav="prev" ${step === 0 ? 'disabled' : ''}>‹ Previous</button>
          <button type="button" class="btn btn-secondary" data-nav="next">Next : ${steps[step + 1]} ›</button>`;
      } else {
        renderReview(body);
      }
    }

    function validate() {
      const results = sc.objectives.map(o => {
        let r;
        try { r = o.check(v, cidr); } catch { r = false; }
        return { ok: r === true, detail: typeof r === 'string' ? r : '' };
      });
      el.querySelectorAll('.portal-objectives li').forEach((li, i) => {
        li.classList.toggle('ok', results[i].ok);
        li.classList.toggle('bad', !results[i].ok);
        li.querySelector('.obj-mark').textContent = results[i].ok ? '✓' : '✗';
      });
      return results;
    }

    function summaryHTML() {
      return sc.steps.map(s => `
        <div class="portal-sum-step">${s.name}</div>
        ${s.fields.map(f => {
          const val = v[f.id];
          let shown;
          if (f.type === 'rows') shown = (val || []).length ? val.map(r => f.columns.map(c => esc(r[c.id]) || '—').join(' · ')).join('<br>') : '<em>None</em>';
          else if (f.type === 'checkbox') shown = val ? 'Enabled' : 'Disabled';
          else shown = esc(val) || '<em>Not set</em>';
          return `<div class="portal-sum-row"><div>${f.label}</div><div>${shown}</div></div>`;
        }).join('')}`).join('');
    }

    function renderReview(body) {
      const results = validate();
      lastResult = results;
      const failed = results.map((r, i) => ({ ...r, o: sc.objectives[i] })).filter(r => !r.ok);
      body.innerHTML = `
        ${failed.length === 0
          ? `<div class="portal-banner ok">✅ <div><strong>Validation passed</strong><br>Your configuration meets every requirement on the ticket.</div></div>`
          : `<div class="portal-banner bad">⛔ <div><strong>Validation failed.</strong> ${failed.length} requirement${failed.length > 1 ? 's' : ''} not met — fix ${failed.length > 1 ? 'them' : 'it'} and run Review + create again.
              <ul>${failed.map(f => `<li>${f.o.text}${f.detail ? ` — <em>${f.detail}</em>` : ''}<details><summary>Hint</summary>${f.o.hint}</details></li>`).join('')}</ul></div></div>`}
        <div class="portal-summary">${summaryHTML()}</div>`;
      $('.portal-footer').innerHTML = `
        <button type="button" class="btn btn-primary" data-nav="create" ${failed.length ? 'disabled' : ''}>Create</button>
        <button type="button" class="btn btn-secondary" data-nav="prev">‹ Previous</button>`;
    }

    function deploy() {
      const body = $('.portal-body');
      $('.portal-steps').innerHTML = '';
      $('.portal-footer').innerHTML = '';
      const lines = ['Initializing deployment…', `Validating ${sc.resource}…`, `Creating ${sc.resource}…`, 'Finalizing…'];
      body.innerHTML = `<div class="portal-deploy"><div class="portal-spinner"></div><div class="portal-deploy-line">${lines[0]}</div><div class="portal-deploy-bar"><div></div></div></div>`;
      let i = 0;
      const tick = setInterval(() => {
        if (!el.isConnected) return clearInterval(tick);
        i++;
        const bar = body.querySelector('.portal-deploy-bar div');
        if (bar) bar.style.width = (i / lines.length * 100) + '%';
        if (i < lines.length) { body.querySelector('.portal-deploy-line').textContent = lines[i]; return; }
        clearInterval(tick);
        finish();
      }, 650);
    }

    function finish() {
      const first = !State.isDone(doneKey);
      if (first) {
        State.markDone(doneKey);
        UI.awardXP(sc.xp, $('.portal-bell'));
        el.querySelector('.portal-ticket-xp').textContent = '✓ Completed — replay any time';
      }
      el.querySelector('.portal-bell').classList.add('ring');
      const code = sc.bicep(v);
      $('.portal-body').innerHTML = `
        <div class="portal-banner ok big">🎉 <div><strong>Your deployment is complete</strong><br>
          ${sc.resource} <code>${esc(sc.resourceName(v))}</code> was created in <code>${esc(v.rg || v.region || 'your subscription')}</code>.
          ${first ? `<div class="portal-xp">+${sc.xp} XP</div>` : ''}</div></div>
        <div class="portal-learn">💡 ${sc.debrief}</div>
        <div class="portal-code-head">
          <span>📄 Infrastructure as code — the Bicep for what you just built</span>
          <button type="button" class="btn btn-secondary btn-sm" data-nav="copy">Copy</button>
        </div>
        <pre class="portal-code"><code>${esc(code)}</code></pre>`;
      $('.portal-footer').innerHTML = `<button type="button" class="btn btn-secondary" data-nav="restart">↩ Start over</button>`;
    }

    // Events (delegated so re-renders keep working)
    el.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.f) v[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
      if (t.dataset.rows) v[t.dataset.rows][+t.dataset.ri][t.dataset.col] = t.value;
    });
    el.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.f) v[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
    });
    el.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.dataset.step !== undefined) { step = +t.dataset.step; renderBody(); }
      else if (t.classList.contains('pf-radio-opt')) {
        v[t.dataset.f] = t.dataset.v;
        t.parentElement.querySelectorAll('.pf-radio-opt').forEach(b => b.classList.toggle('on', b === t));
      }
      else if (t.dataset.add) {
        const f = sc.steps.flatMap(s => s.fields).find(x => x.id === t.dataset.add);
        v[f.id].push(Object.fromEntries(f.columns.map(c => [c.id, c.type === 'select' ? c.options[0] : ''])));
        renderBody();
      }
      else if (t.dataset.del) { v[t.dataset.del].splice(+t.dataset.ri, 1); renderBody(); }
      else if (t.dataset.nav === 'next') { step = Math.min(steps.length - 1, step + 1); renderBody(); }
      else if (t.dataset.nav === 'prev') { step = Math.max(0, step - 1); renderBody(); }
      else if (t.dataset.nav === 'review') { step = steps.length - 1; renderBody(); }
      else if (t.dataset.nav === 'create' && lastResult && lastResult.every(r => r.ok)) deploy();
      else if (t.dataset.nav === 'copy') {
        navigator.clipboard?.writeText(sc.bicep(v)).then(() => { t.textContent = 'Copied ✓'; }).catch(() => {});
      }
      else if (t.dataset.nav === 'restart') {
        const fresh = el.cloneNode(false);
        el.replaceWith(fresh);
        return mount(fresh, sc);
      }
      if (t.dataset.step !== undefined || t.dataset.nav) el.querySelector('.portal-main').scrollIntoView({ block: 'nearest' });
    });

    renderBody();
  }

  return { mount, cidr };
})();

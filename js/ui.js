/* Healthcare Survivor — HUD, 레벨업 카드, 도감, 결과 화면 */
(function () {
  'use strict';
  const D = window.HS_DATA;
  const { ENEMIES, WEAPONS, PASSIVES, CATEGORY_COLORS, efficacy } = D;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const REGULAR_ENEMIES = Object.keys(ENEMIES).filter(id => !ENEMIES[id].boss);

  // 무기의 병원체별 효능 요약 (유효/약함/무효)
  function efficacySummary(wid, flags) {
    const w = WEAPONS[wid];
    const good = [], weak = [], none = [];
    for (const id of REGULAR_ENEMIES) {
      const m = efficacy(w, ENEMIES[id].tags, flags || {}).mult;
      const n = ENEMIES[id].name;
      if (m >= 1) good.push(n); else if (m > 0) weak.push(n); else none.push(n);
    }
    return { good, weak, none };
  }

  function summaryHtml(s) {
    let h = '';
    if (s.good.length) h += `<div class="eff good"><b>유효</b> ${s.good.map(esc).join(', ')}</div>`;
    if (s.weak.length) h += `<div class="eff weak"><b>약함</b> ${s.weak.map(esc).join(', ')}</div>`;
    if (s.none.length) h += `<div class="eff none"><b>무효</b> ${s.none.map(esc).join(', ')}</div>`;
    return h;
  }

  function fmtTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------- 학습 로그
  const logEl = () => $('log');
  function log(text, kind) {
    const el = document.createElement('div');
    el.className = 'log-item ' + kind;
    el.textContent = text;
    logEl().prepend(el);
    while (logEl().children.length > 5) logEl().lastChild.remove();
    setTimeout(() => el.classList.add('fade'), 9000);
  }

  function banner(text) {
    const b = $('banner');
    b.textContent = text;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  // ---------------------------------------------------------------- HUD
  let hudCache = '';
  function updateHud(S) {
    const p = S.player;
    $('hp-fill').style.width = (Math.max(0, p.hp) / p.maxHp * 100) + '%';
    $('hp-text').textContent = `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;
    $('xp-fill').style.width = (S.xp / S.xpNext * 100) + '%';
    $('time').textContent = fmtTime(S.t) + ' / ' + fmtTime(D.RUN_LENGTH);
    $('level').textContent = 'Lv ' + S.level;
    $('kills').textContent = '처치 ' + S.kills;
    const tox = $('tox-fill');
    tox.style.width = S.toxicity + '%';
    tox.style.background = S.toxicity > 85 ? '#ff3b3b' : S.toxicity > 60 ? '#ff9f1a' : '#c7e36b';

    const chips = [];
    if (S.debuff.immunosuppress > 0) chips.push(`<span class="chip warn">면역억제 ${S.debuff.immunosuppress.toFixed(1)}s</span>`);
    if (S.debuff.myelo > 0) chips.push(`<span class="chip warn">골수억제 ${S.debuff.myelo.toFixed(1)}s</span>`);
    if (S.flags.antipd1) chips.push('<span class="chip">항PD-1</span>');
    if (S.flags.clavulanate) chips.push('<span class="chip">클라불란산</span>');

    const pres = Object.keys(S.pressure).map(k => {
      const prob = Math.min(0.55, S.pressure[k] / 250);
      return `<div class="pres"><span>${window.HS_GAME.AB_CLASS_NAMES[k]} ${Math.round(prob * 100)}%</span><div class="bar small"><div style="width:${prob / 0.55 * 100}%;background:#ff7b00"></div></div></div>`;
    }).join('');

    const mem = Object.keys(S.memoryBonus).filter(k => S.memoryBonus[k] >= 0.05 && ENEMIES[k])
      .map(k => `<div class="pres"><span>${ENEMIES[k].name}</span><div class="bar small"><div style="width:${S.memoryBonus[k] / 0.5 * 100}%;background:#5fb0ff"></div></div></div>`).join('');

    const weapons = S.weapons.map(w => {
      const d = WEAPONS[w.id];
      return `<div class="wslot" title="${esc(d.name)}" style="border-color:${CATEGORY_COLORS[d.cat]}"><span>${esc(d.icon)}</span><i>${w.level}</i></div>`;
    }).join('') + Object.keys(S.passives).map(id => `<div class="wslot passive" title="${esc(PASSIVES[id].name)}"><span>${PASSIVES[id].icon}</span><i>${S.passives[id]}</i></div>`).join('');

    const html = chips.join('') + '|' + pres + '|' + mem + '|' + weapons;
    if (html !== hudCache) {
      hudCache = html;
      $('status-chips').innerHTML = chips.join('');
      $('pressure').innerHTML = pres;
      $('memory').innerHTML = mem || '<div class="muted">같은 병원체를 반복 처치하면 형성</div>';
      $('weapons').innerHTML = weapons;
    }
  }

  // ---------------------------------------------------------------- 레벨업
  function showLevelUp(choices, S, onPick) {
    const box = $('choices');
    box.innerHTML = '';
    choices.forEach((c, i) => {
      const el = document.createElement('button');
      el.className = 'card';
      if (c.type === 'weapon') {
        const d = WEAPONS[c.id];
        const L = d.levels[c.level - 1];
        const stat = [];
        if (L.dmg) stat.push('피해 ' + L.dmg);
        if (L.cd) stat.push('주기 ' + L.cd + 's');
        if (L.count) stat.push('개수 ' + L.count);
        if (L.radius) stat.push('범위 ' + L.radius);
        if (d.toxicity) stat.push('독성 +' + d.toxicity);
        el.innerHTML = `
          <div class="card-head"><span class="cat" style="background:${CATEGORY_COLORS[d.cat]}">${esc(d.catName)}</span>
          <span class="lv">${c.isNew ? '신규' : 'Lv ' + c.level}</span></div>
          <h3>${esc(d.icon)} ${esc(d.name)}</h3>
          <p>${esc(d.desc)}</p>
          <div class="stats">${stat.join(' · ')}</div>
          ${summaryHtml(efficacySummary(c.id, S.flags))}`;
      } else if (c.type === 'passive') {
        const d = PASSIVES[c.id];
        el.innerHTML = `
          <div class="card-head"><span class="cat passive">${esc(d.catName)}</span><span class="lv">Lv ${c.level}/${d.max}</span></div>
          <h3>${d.icon} ${esc(d.name)}</h3><p>${esc(d.desc)}</p>`;
      } else {
        el.innerHTML = '<h3>수액 및 휴식</h3><p>생명력 30 회복</p>';
      }
      el.addEventListener('click', () => onPick(c));
      el.dataset.key = String(i + 1);
      box.appendChild(el);
    });
    $('levelup').classList.remove('hidden');
  }
  function hideLevelUp() { $('levelup').classList.add('hidden'); }
  window.addEventListener('keydown', e => {
    if ($('levelup').classList.contains('hidden')) return;
    const btn = document.querySelector(`#choices .card[data-key="${e.key}"]`);
    if (btn) btn.click();
  });

  // ---------------------------------------------------------------- 도감
  function renderCodex(target, tab) {
    let html = '';
    if (tab === 'enemies') {
      for (const id in ENEMIES) {
        const e = ENEMIES[id];
        const good = [], none = [];
        for (const wid in WEAPONS) {
          const m = efficacy(WEAPONS[wid], e.tags, {}).mult;
          if (m >= 1) good.push(WEAPONS[wid].name); else if (m === 0) none.push(WEAPONS[wid].name);
        }
        html += `<div class="entry"><h4><span class="dot" style="background:${e.color}"></span>${esc(e.name)} <em>${esc(e.sci)}</em></h4>
          <div class="sub">${esc(e.group)}</div><p>${esc(e.desc)}</p>
          <div class="eff good"><b>유효</b> ${good.map(esc).join(', ') || '-'}</div>
          <div class="eff none"><b>무효</b> ${none.map(esc).join(', ') || '-'}</div></div>`;
      }
    } else if (tab === 'weapons') {
      for (const id in WEAPONS) {
        const w = WEAPONS[id];
        html += `<div class="entry"><h4><span class="cat" style="background:${CATEGORY_COLORS[w.cat]}">${esc(w.catName)}</span> ${esc(w.name)}</h4>
          <p>${esc(w.desc)}</p>${summaryHtml(efficacySummary(id, {}))}</div>`;
      }
      for (const id in PASSIVES) {
        const p = PASSIVES[id];
        html += `<div class="entry"><h4><span class="cat passive">${esc(p.catName)}</span> ${p.icon} ${esc(p.name)}</h4><p>${esc(p.desc)}</p></div>`;
      }
    } else {
      html = `<div class="entry"><h4>게임 규칙과 실제 생리의 대응</h4>
        <p><b>효능 배율</b> — 치료수단의 작용 표적(예: 펩티도글리칸, 에르고스테롤, 뉴라미니데이스)이 적에게 있을 때만 피해가 들어갑니다.</p>
        <p><b>항생제 내성</b> — 항생제로 세균을 처치할수록 해당 계열의 선택압이 쌓이고, 새로 나타나는 세균이 내성을 가질 확률이 높아집니다. 내성은 분열 시 딸세포에 유전됩니다(주황 점선 테두리).</p>
        <p><b>약물 독성</b> — 약물 투여마다 독성이 쌓이고 간·신장 청소로 감소합니다. 60 이상이면 생명력이 감소합니다.</p>
        <p><b>면역억제/골수억제</b> — 스테로이드와 항암제는 아군 면역세포 무기의 위력을 일시적으로 낮춥니다.</p>
        <p><b>면역기억</b> — 같은 병원체를 반복 처치하면 면역세포 무기가 그 병원체에 더 강해집니다(최대 +50%). 백신은 이를 미리 형성합니다.</p>
        <p><b>면역관문</b> — 암세포의 PD-L1은 T세포 공격을 75% 감소시킵니다. 항PD-1 항체가 이를 해제하지만 자가면역 부작용이 늘어납니다.</p>
        <p class="muted">수치는 게임 밸런스를 위한 추상화이며 실제 임상 효과나 용량을 의미하지 않습니다. 의학적 판단에 사용하지 마십시오.</p></div>`;
    }
    target.innerHTML = html;
  }

  function bindCodex(root) {
    const tabs = root.querySelectorAll('.tab');
    const body = root.querySelector('.codex-body');
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.toggle('active', x === t));
      renderCodex(body, t.dataset.tab);
    }));
    renderCodex(body, 'rules');
    tabs.forEach(x => x.classList.toggle('active', x.dataset.tab === 'rules'));
  }

  function showPause() { $('pause').classList.remove('hidden'); bindCodex($('pause')); }
  function hidePause() { $('pause').classList.add('hidden'); }

  // ---------------------------------------------------------------- 결과
  function showGameOver(win, S) {
    $('go-title').textContent = win ? '회복 — 10분 생존' : '패배 — 환자 상태 악화';
    const killRows = Object.keys(S.killsByType).sort((a, b) => S.killsByType[b] - S.killsByType[a])
      .map(k => `<tr><td>${esc(ENEMIES[k].name)}</td><td>${S.killsByType[k]}</td></tr>`).join('');
    const notes = [...S.notes.entries()].sort((a, b) => a[1].first - b[1].first)
      .map(([n, v]) => `<li class="${v.kind}">${esc(n)} <span class="muted">×${v.count}</span></li>`).join('');
    $('go-body').innerHTML = `
      <div class="go-grid">
        <div><h4>기록</h4><p>생존 ${fmtTime(S.t)} · 레벨 ${S.level} · 처치 ${S.kills}</p>
          <p>선택압으로 출현한 내성균: <b>${S.resistantSpawns}</b></p>
          <table>${killRows}</table></div>
        <div><h4>이번 게임에서 확인한 작용기전 (${S.notes.size})</h4><ul class="notes">${notes}</ul></div>
      </div>`;
    $('gameover').classList.remove('hidden');
  }

  function reset() {
    hudCache = '';
    logEl().innerHTML = '';
    ['levelup', 'pause', 'gameover', 'start'].forEach(id => $(id).classList.add('hidden'));
    $('hud').classList.remove('hidden');
  }

  // ---------------------------------------------------------------- 버튼
  document.addEventListener('DOMContentLoaded', () => {
    $('btn-start').addEventListener('click', () => window.HS_GAME.start());
    $('btn-restart').addEventListener('click', () => window.HS_GAME.start());
    $('btn-resume').addEventListener('click', () => window.HS_GAME.togglePause());
    $('btn-pause').addEventListener('click', () => { const S = window.HS_GAME.state; if (S && S.running && !S.levelUp) window.HS_GAME.togglePause(); });
    bindCodex($('start'));
  });

  window.HS_UI = { log, banner, updateHud, showLevelUp, hideLevelUp, showPause, hidePause, showGameOver, reset, efficacySummary };
})();

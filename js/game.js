/* Healthcare Survivor — 게임 엔진 (Canvas 렌더링, 엔티티 갱신, 레벨업) */
(function () {
  'use strict';
  const D = window.HS_DATA;
  const { ENEMIES, WEAPONS, PASSIVES, efficacy } = D;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const UI = window.HS_UI;

  const MAX_ENEMIES = 320;
  const CARRYING = 220; // 증식에 의한 개체 수 상한(수용력)
  const MAX_WEAPONS = 6;
  const AB_CLASSES = ['beta_lactam', 'glycopeptide', 'fluoroquinolone'];
  const AB_CLASS_NAMES = { beta_lactam: 'β-락탐계', glycopeptide: '글리코펩티드계', fluoroquinolone: '플루오로퀴놀론계' };

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------------ 입력
  const keys = new Set();
  window.addEventListener('keydown', e => {
    keys.add(e.key.toLowerCase());
    if ((e.key === 'Escape' || e.key.toLowerCase() === 'p') && S && S.running && !S.levelUp) togglePause();
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => { keys.clear(); if (S && S.running && !S.levelUp && !S.paused) togglePause(); });

  const touch = { active: false, sx: 0, sy: 0, dx: 0, dy: 0 };
  canvas.addEventListener('pointerdown', e => { touch.active = true; touch.sx = e.clientX; touch.sy = e.clientY; touch.dx = touch.dy = 0; });
  window.addEventListener('pointermove', e => { if (touch.active) { touch.dx = e.clientX - touch.sx; touch.dy = e.clientY - touch.sy; } });
  window.addEventListener('pointerup', () => { touch.active = false; touch.dx = touch.dy = 0; });

  function inputDir() {
    let x = 0, y = 0;
    if (keys.has('w') || keys.has('arrowup')) y -= 1;
    if (keys.has('s') || keys.has('arrowdown')) y += 1;
    if (keys.has('a') || keys.has('arrowleft')) x -= 1;
    if (keys.has('d') || keys.has('arrowright')) x += 1;
    if (touch.active) {
      const m = Math.hypot(touch.dx, touch.dy);
      if (m > 12) { x = touch.dx / m; y = touch.dy / m; }
    }
    const m = Math.hypot(x, y);
    return m > 0 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
  }

  // ------------------------------------------------------------------ 상태
  let S = null;

  function newState() {
    return {
      running: true, paused: false, levelUp: false, over: false,
      t: 0, nextSpawn: 0, bossIdx: 0,
      player: { x: 0, y: 0, r: 14, hp: 100, maxHp: 100, speed: 170, face: { x: 1, y: 0 }, regen: 0.2, hurt: 0 },
      enemies: [], projectiles: [], effects: [], gems: [], floaters: [],
      weapons: [{ id: 'phagocyte', level: 1, cd: 0, angle: 0 }],
      passives: {},
      flags: { clavulanate: false, antipd1: false },
      toxicity: 0,
      pressure: { beta_lactam: 0, glycopeptide: 0, fluoroquinolone: 0 },
      memoryKills: {},
      memoryBonus: {},
      debuff: { immunosuppress: 0, myelo: 0 },
      xp: 0, level: 1, xpNext: 5,
      kills: 0, killsByType: {}, resistantSpawns: 0,
      notes: new Map(),  // 학습 노트: note -> {count, first}
      logQueue: [],
      autoTimer: 0,
      nextId: 1,
    };
  }

  // ------------------------------------------------------------------ 유틸
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  function weightedPick(w) {
    let total = 0; for (const k in w) total += w[k];
    let r = Math.random() * total;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return Object.keys(w)[0];
  }
  function lvl(w) { return WEAPONS[w.id].levels[w.level - 1]; }

  // ------------------------------------------------------------------ 적 생성
  function spawnEnemy(id, x, y, inherit) {
    if (S.enemies.length >= MAX_ENEMIES && !ENEMIES[id].boss) return null;
    const def = ENEMIES[id];
    const scale = 1 + S.t / 280;
    const tags = def.tags.slice();
    if (inherit) {
      for (const t of inherit) if (t.startsWith('resist_') && !tags.includes(t)) tags.push(t);
    } else if (tags.includes('bacteria')) {
      // 선택압에 비례하여 내성 균주 출현
      for (const cls of AB_CLASSES) {
        const p = Math.min(0.55, S.pressure[cls] / 250);
        if (Math.random() < p) { tags.push('resist_' + cls); S.resistantSpawns++; }
      }
    }
    const e = {
      uid: S.nextId++, id, def, tags, x, y,
      hp: def.hp * (def.boss ? 1 : scale), maxHp: def.hp * (def.boss ? 1 : scale),
      r: def.r, speed: def.speed * rand(0.9, 1.1), dmg: def.dmg,
      divideT: def.divide ? rand(0.6, 1.2) * def.divide : 0,
      repT: def.replicate ? rand(0.7, 1.2) * def.replicate.interval : 0,
      childT: def.spawnChild ? def.spawnChild.interval : 0,
      opsonized: 0, noRelease: 0, hitCd: {}, flash: 0,
      life: id === 'autoreactive' ? 40 : 0,
      wob: Math.random() * 6.28,
    };
    S.enemies.push(e);
    return e;
  }

  function spawnAround(id) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.max(W, H) * 0.6 + rand(20, 120);
    return spawnEnemy(id, S.player.x + Math.cos(a) * d, S.player.y + Math.sin(a) * d);
  }

  function updateSpawning(dt) {
    S.nextSpawn -= dt;
    if (S.nextSpawn <= 0) {
      const interval = Math.max(0.12, 0.9 - S.t / 500);
      S.nextSpawn = interval;
      const batch = 1 + Math.floor(S.t / 120);
      const table = D.spawnTable(S.t);
      for (let i = 0; i < batch; i++) spawnAround(weightedPick(table));
    }
    // 자가면역: 일정 시간 이후 산발 발생, 항PD-1 사용 시 증가 (면역 관련 이상반응)
    if (S.t > 200 || S.flags.antipd1) {
      S.autoTimer -= dt;
      if (S.autoTimer <= 0) {
        const rate = S.flags.antipd1 ? 2.5 : 1;
        S.autoTimer = rand(9, 14) / rate;
        const n = S.flags.antipd1 ? 3 : 2;
        for (let i = 0; i < n; i++) spawnAround('autoreactive');
        if (S.flags.antipd1) pushLog('면역 관련 이상반응: 면역관문 억제로 자가반응성 T세포 활성화', 'warn');
      }
    }
    const boss = D.BOSSES[S.bossIdx];
    if (boss && S.t >= boss.t) {
      S.bossIdx++;
      spawnAround(boss.id);
      UI.banner(boss.msg);
    }
  }

  // ------------------------------------------------------------------ 효능/피해
  function immuneMod() {
    let m = 1;
    if (S.debuff.immunosuppress > 0) m *= 0.65;
    if (S.debuff.myelo > 0) m *= 0.6;
    return m;
  }

  function recordNote(note, kind) {
    if (!note) return;
    const n = S.notes.get(note);
    if (n) { n.count++; return; }
    S.notes.set(note, { count: 1, first: S.t, kind });
    pushLog(note, kind);
  }

  function pushLog(text, kind) { UI.log(text, kind || 'info'); }

  function damageEnemy(e, weaponId, base, opts) {
    if (e.dead) return 0;
    const wdef = WEAPONS[weaponId];
    const eff = efficacy(wdef, e.tags, S.flags);
    if (eff.mult <= 0) {
      recordNote(`[${wdef.name} → ${e.def.name}] 무효: ${eff.note}`, 'miss');
      // 범위 무기는 화면 혼잡을 막기 위해 '무효' 표시를 생략 (학습 로그에는 기록)
      if (!(opts && opts.area) && (e.hitCd['miss_' + weaponId] || 0) < S.t) {
        e.hitCd['miss_' + weaponId] = S.t + 1.5;
        floater(e.x, e.y - e.r, '무효', '#8a8f98');
      }
      return 0;
    }
    if (eff.note) recordNote(`[${wdef.name} → ${e.def.name}] ${eff.note}`, eff.mult >= 1 ? 'good' : 'weak');
    let dmg = base * eff.mult;
    if (wdef.immune) {
      dmg *= immuneMod();
      dmg *= 1 + (S.memoryBonus[e.def.memoryAs || e.id] || 0);
    }
    if (e.opsonized > S.t) dmg *= 1.3;
    e.hp -= dmg; e.flash = 0.08;
    if (wdef.opsonize) e.opsonized = S.t + 4;
    if (wdef.blockRelease && e.tags.includes('neuraminidase')) e.noRelease = S.t + (opts && opts.block || 6);
    const col = eff.mult >= 1.2 ? '#7dff9a' : eff.mult < 0.5 ? '#ffb347' : '#ffffff';
    floater(e.x + rand(-6, 6), e.y - e.r, Math.max(1, Math.round(dmg)).toString(), col);
    if (e.hp <= 0) killEnemy(e, wdef);
    return dmg;
  }

  function killEnemy(e, wdef) {
    e.dead = true;
    S.kills++;
    S.killsByType[e.id] = (S.killsByType[e.id] || 0) + 1;
    // 면역기억: 같은 병원체를 반복 처치할수록 적응면역 효율 증가 (최대 +50%)
    const baseId = e.def.memoryAs || e.id;
    S.memoryKills[baseId] = (S.memoryKills[baseId] || 0) + 1;
    if (!(S.passives.vaccine && baseId === 'influenza')) {
      const prev = S.memoryBonus[baseId] || 0;
      S.memoryBonus[baseId] = Math.min(0.5, S.memoryKills[baseId] / 300);
      if (prev < 0.25 && S.memoryBonus[baseId] >= 0.25) pushLog(`면역기억 형성: ${ENEMIES[baseId].name}에 대한 기억 림프구 증가 (면역세포 피해 +25%)`, 'good');
    }
    // 항생제 선택압
    if (wdef && wdef.cls && e.tags.includes('bacteria')) {
      const k = 1 - 0.3 * (S.passives.stewardship || 0);
      S.pressure[wdef.cls] += 1 * k;
    }
    const v = e.def.xp;
    S.gems.push({ x: e.x, y: e.y, v, r: v >= 8 ? 8 : v >= 3 ? 6 : 4 });
    burst(e.x, e.y, e.def.color, e.def.boss ? 40 : 6);
    if (e.def.boss) UI.banner(`${e.def.name} 제거!`);
  }

  function floater(x, y, text, color) {
    if (S.floaters.length > 160) return;
    S.floaters.push({ x, y, text, color, t: 0.7 });
  }
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = rand(30, 140);
      S.effects.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.4, max: 0.4, color });
    }
  }

  // ------------------------------------------------------------------ 목표 선택
  // 약물은 효능이 있는 가장 가까운 적을 우선 조준 (없으면 가장 가까운 적)
  function pickTarget(wdef, range, exclude) {
    let best = null, bd = Infinity, fallback = null, fd = Infinity;
    const r2 = range * range;
    const p = S.player;
    for (const e of S.enemies) {
      if (e.dead || (exclude && exclude.has(e.uid))) continue;
      const d = dist2(p, e);
      if (d > r2) continue;
      if (d < fd) { fd = d; fallback = e; }
      if (d < bd && efficacy(wdef, e.tags, S.flags).mult > 0) { bd = d; best = e; }
    }
    return best || fallback;
  }

  // ------------------------------------------------------------------ 무기 발사
  function cooldownFor(w) {
    const def = WEAPONS[w.id];
    let cd = lvl(w).cd;
    if (def.immune) cd *= 1 - 0.08 * (S.passives.gcsf || 0);
    return cd;
  }

  function addToxicity(v) { S.toxicity = Math.min(100, S.toxicity + v); }

  function updateWeapons(dt) {
    const p = S.player;
    for (const w of S.weapons) {
      const def = WEAPONS[w.id];
      const L = lvl(w);
      if (def.pattern === 'orbit') {
        w.angle = (w.angle || 0) + L.spin * dt;
        for (let i = 0; i < L.count; i++) {
          const a = w.angle + (i / L.count) * Math.PI * 2;
          const ox = p.x + Math.cos(a) * L.radius, oy = p.y + Math.sin(a) * L.radius;
          for (const e of S.enemies) {
            if (e.dead) continue;
            if ((e.x - ox) ** 2 + (e.y - oy) ** 2 < (e.r + 10) ** 2) {
              const key = w.id;
              if ((e.hitCd[key] || 0) < S.t) { e.hitCd[key] = S.t + 0.45; damageEnemy(e, w.id, L.dmg); }
            }
          }
        }
        continue;
      }
      w.cd -= dt;
      if (w.cd > 0) continue;
      let fired = false;
      switch (def.pattern) {
        case 'melee': {
          const t = pickTarget(def, L.range);
          if (t) {
            damageEnemy(t, w.id, L.dmg);
            S.effects.push({ kind: 'pseudopod', x: p.x, y: p.y, tx: t.x, ty: t.y, t: 0.18, max: 0.18, color: def.color });
            fired = true;
          }
          break;
        }
        case 'projectile':
        case 'homing': {
          const exclude = new Set();
          for (let i = 0; i < L.count; i++) {
            const t = pickTarget(def, 520, exclude);
            if (!t) break;
            exclude.add(t.uid);
            const a = Math.atan2(t.y - p.y, t.x - p.x) + (def.pattern === 'projectile' ? rand(-0.05, 0.05) : 0);
            S.projectiles.push({
              wid: w.id, x: p.x, y: p.y, vx: Math.cos(a) * L.speed, vy: Math.sin(a) * L.speed,
              speed: L.speed, dmg: L.dmg, block: L.block, life: 1.6, target: def.pattern === 'homing' ? t : null,
              hit: new Set(), color: def.color, homing: def.pattern === 'homing',
            });
            fired = true;
          }
          break;
        }
        case 'pulse': {
          const r2 = L.radius * L.radius;
          let any = false;
          for (const e of S.enemies) if (!e.dead && dist2(p, e) < r2) { any = true; break; }
          if (any) {
            for (const e of S.enemies) if (!e.dead && dist2(p, e) < r2) damageEnemy(e, w.id, L.dmg, { area: true });
            S.effects.push({ kind: 'ring', x: p.x, y: p.y, r: L.radius, t: 0.35, max: 0.35, color: def.color });
            fired = true;
          }
          break;
        }
        case 'zone': {
          const t = pickTarget(def, 480);
          if (t) {
            S.effects.push({ kind: 'zone', wid: w.id, x: t.x, y: t.y, r: L.radius, dmg: L.dmg, t: L.delay, max: L.delay, color: def.color });
            fired = true;
          }
          break;
        }
        case 'arc': {
          const t = pickTarget(def, L.range + 20);
          const dir = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.face.y, p.face.x);
          if (t) {
            for (const e of S.enemies) {
              if (e.dead) continue;
              const dx = e.x - p.x, dy = e.y - p.y;
              if (dx * dx + dy * dy > (L.range + e.r) ** 2) continue;
              let da = Math.atan2(dy, dx) - dir;
              da = Math.atan2(Math.sin(da), Math.cos(da));
              if (Math.abs(da) <= L.arc / 2) damageEnemy(e, w.id, L.dmg, { area: true });
            }
            S.effects.push({ kind: 'arc', x: p.x, y: p.y, dir, r: L.range, arc: L.arc, t: 0.2, max: 0.2, color: def.color });
            fired = true;
          }
          break;
        }
      }
      if (fired) {
        w.cd = cooldownFor(w);
        if (def.toxicity) addToxicity(def.toxicity);
        if (def.myelo) {
          const dur = def.myelo * (1 - 0.3 * (S.passives.gcsf || 0));
          if (S.debuff.myelo <= 0) recordNote(`[${def.name}] 골수억제: 분열이 빠른 조혈모세포도 손상 → 면역세포 기능 일시 저하`, 'warn');
          S.debuff.myelo = Math.max(S.debuff.myelo, dur);
        }
        if (def.immunosuppress) {
          if (S.debuff.immunosuppress <= 0) recordNote(`[${def.name}] 면역억제: 스테로이드가 아군 면역세포 기능도 억제 → 감염 취약`, 'warn');
          S.debuff.immunosuppress = Math.max(S.debuff.immunosuppress, def.immunosuppress);
        }
      } else {
        w.cd = 0.1;
      }
    }
  }

  function updateProjectiles(dt) {
    for (const pr of S.projectiles) {
      if (pr.homing) {
        if (!pr.target || pr.target.dead) pr.target = pickTarget(WEAPONS[pr.wid], 400, pr.hit);
        if (pr.target) {
          const a = Math.atan2(pr.target.y - pr.y, pr.target.x - pr.x);
          const cur = Math.atan2(pr.vy, pr.vx);
          let da = Math.atan2(Math.sin(a - cur), Math.cos(a - cur));
          const na = cur + Math.max(-6 * dt, Math.min(6 * dt, da));
          pr.vx = Math.cos(na) * pr.speed; pr.vy = Math.sin(na) * pr.speed;
        }
      }
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
      for (const e of S.enemies) {
        if (e.dead || pr.hit.has(e.uid)) continue;
        if ((e.x - pr.x) ** 2 + (e.y - pr.y) ** 2 < (e.r + 5) ** 2) {
          pr.hit.add(e.uid);
          const done = damageEnemy(e, pr.wid, pr.dmg, { block: pr.block });
          // 효능이 없는 대상은 통과(약물이 표적에 결합하지 않음), 효능이 있으면 소모
          if (done > 0) { pr.life = 0; break; }
        }
      }
    }
    S.projectiles = S.projectiles.filter(p => p.life > 0);
  }

  // ------------------------------------------------------------------ 적 갱신
  function updateEnemies(dt) {
    const p = S.player;
    const feverMul = 1 + 0.15 * (S.passives.fever || 0);
    const newborn = [];
    for (const e of S.enemies) {
      if (e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.wob += dt * 3;
      e.x += (dx / d) * e.speed * dt + Math.cos(e.wob) * 8 * dt;
      e.y += (dy / d) * e.speed * dt + Math.sin(e.wob * 1.3) * 8 * dt;
      if (e.flash > 0) e.flash -= dt;

      // 접촉 피해
      if (d < e.r + p.r) {
        p.hp -= e.dmg * dt;
        p.hurt = 0.15;
      }
      // 너무 멀어진 적은 재배치
      if (d > Math.max(W, H) * 1.6 && !e.def.boss) {
        const a = Math.random() * 6.28, rr = Math.max(W, H) * 0.6;
        e.x = p.x + Math.cos(a) * rr; e.y = p.y + Math.sin(a) * rr;
      }
      // 이분법 증식 (세균·진균·암세포): 내성 형질은 딸세포에 유전
      if (e.def.divide) {
        e.divideT -= dt;
        if (e.divideT <= 0) {
          e.divideT = e.def.divide * feverMul * rand(0.9, 1.2);
          // 로지스틱 증식: 개체 수가 수용력(영양·공간 한계)에 가까울수록 분열 확률 감소
          if (Math.random() < 1 - (S.enemies.length + newborn.length) / CARRYING) newborn.push([e.id, e.x + rand(-12, 12), e.y + rand(-12, 12), e.tags]);
        }
      }
      // 바이러스 복제
      if (e.def.replicate) {
        e.repT -= dt;
        if (e.repT <= 0) {
          e.repT = e.def.replicate.interval * feverMul * rand(0.9, 1.2);
          if (e.noRelease > S.t) {
            floater(e.x, e.y - e.r - 6, '방출 차단', '#8fe3ff');
          } else {
            for (let i = 0; i < e.def.replicate.count; i++)
              if (Math.random() < 1 - (S.enemies.length + newborn.length) / CARRYING) newborn.push([e.id, e.x + rand(-16, 16), e.y + rand(-16, 16), e.tags]);
          }
        }
      }
      if (e.def.spawnChild) {
        e.childT -= dt;
        if (e.childT <= 0) {
          e.childT = e.def.spawnChild.interval;
          newborn.push([e.def.spawnChild.id, e.x + rand(-60, 60), e.y + rand(-60, 60), null]);
        }
      }
      if (e.life > 0) {
        e.life -= dt;
        if (e.life <= 0) { e.dead = true; floater(e.x, e.y, '관해', '#c9b6ff'); }
      }
    }
    // 간단한 분리(겹침 완화)
    const n = S.enemies.length;
    for (let i = 0; i < n; i += 2) {
      const a = S.enemies[i]; if (a.dead) continue;
      for (let j = i + 1; j < Math.min(n, i + 12); j++) {
        const b = S.enemies[j]; if (b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          const ma = a.def.boss ? 0.1 : 1, mb = b.def.boss ? 0.1 : 1;
          a.x -= dx / d * push * ma; a.y -= dy / d * push * ma;
          b.x += dx / d * push * mb; b.y += dy / d * push * mb;
        }
      }
    }
    S.enemies = S.enemies.filter(e => !e.dead);
    for (const [id, x, y, tags] of newborn) spawnEnemy(id, x, y, tags || []);
  }

  // ------------------------------------------------------------------ 경험치/레벨업
  function updateGems(dt) {
    const p = S.player;
    const magnet = 90;
    for (const g of S.gems) {
      const d = Math.hypot(p.x - g.x, p.y - g.y);
      if (d < magnet || g.pull) {
        g.pull = true;
        const sp = 420;
        g.x += (p.x - g.x) / d * sp * dt; g.y += (p.y - g.y) / d * sp * dt;
      }
      if (d < p.r + 6) { g.taken = true; gainXp(g.v); }
    }
    S.gems = S.gems.filter(g => !g.taken);
    if (S.gems.length > 400) S.gems.splice(0, S.gems.length - 400);
  }

  function gainXp(v) {
    S.xp += v;
    if (S.xp >= S.xpNext && !S.levelUp) {
      S.xp -= S.xpNext;
      S.level++;
      S.xpNext = Math.floor(5 + S.level * 4 + Math.pow(S.level, 1.5));
      openLevelUp();
    }
  }

  function buildChoices() {
    const pool = [];
    const owned = new Set(S.weapons.map(w => w.id));
    for (const w of S.weapons) {
      if (w.level < WEAPONS[w.id].levels.length) pool.push({ type: 'weapon', id: w.id, weight: 3 });
    }
    if (S.weapons.length < MAX_WEAPONS) {
      for (const id in WEAPONS) {
        if (owned.has(id)) continue;
        let weight = 2;
        // 현재 전장에 맞는 치료수단을 조금 더 자주 제시 (학습 보조)
        const hasTag = tag => S.enemies.some(e => e.tags.includes(tag));
        if (id === 'prednisolone' && hasTag('autoreactive')) weight = 6;
        if (id === 'albendazole' && hasTag('helminth')) weight = 5;
        if (id === 'amphotericin' && hasTag('fungus')) weight = 4;
        if (id === 'oseltamivir' && hasTag('influenza')) weight = 4;
        if (id === 'vancomycin' && hasTag('pbp2a')) weight = 4;
        if ((id === 'cisplatin' || id === 'radiotherapy' || id === 'scalpel') && hasTag('cancer')) weight = 4;
        pool.push({ type: 'weapon', id, weight });
      }
    }
    for (const id in PASSIVES) {
      const def = PASSIVES[id];
      const cur = S.passives[id] || 0;
      if (cur >= def.max) continue;
      if (def.requires && !owned.has(def.requires)) continue;
      let weight = 1.5;
      if (id === 'clavulanate' && S.enemies.some(e => e.tags.includes('beta_lactamase'))) weight = 5;
      if (id === 'antipd1' && S.enemies.some(e => e.tags.includes('cancer'))) weight = 3;
      if (id === 'clearance' && S.toxicity > 40) weight = 4;
      if (id === 'stewardship' && Math.max(...AB_CLASSES.map(c => S.pressure[c])) > 40) weight = 4;
      pool.push({ type: 'passive', id, weight });
    }
    const out = [];
    while (out.length < 3 && pool.length) {
      let total = pool.reduce((s, c) => s + c.weight, 0), r = Math.random() * total;
      let idx = 0;
      for (; idx < pool.length; idx++) { r -= pool[idx].weight; if (r <= 0) break; }
      out.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
    }
    if (!out.length) out.push({ type: 'heal' });
    return out;
  }

  function openLevelUp() {
    S.levelUp = true;
    const choices = buildChoices().map(c => {
      if (c.type === 'weapon') {
        const w = S.weapons.find(x => x.id === c.id);
        return { ...c, level: w ? w.level + 1 : 1, isNew: !w };
      }
      if (c.type === 'passive') return { ...c, level: (S.passives[c.id] || 0) + 1 };
      return c;
    });
    UI.showLevelUp(choices, S, pick => {
      applyChoice(pick);
      S.levelUp = false;
      UI.hideLevelUp();
      lastTime = performance.now();
      if (S.xp >= S.xpNext) gainXp(0);
    });
  }

  function applyChoice(c) {
    if (c.type === 'weapon') {
      const w = S.weapons.find(x => x.id === c.id);
      if (w) w.level++;
      else S.weapons.push({ id: c.id, level: 1, cd: 0, angle: 0 });
      pushLog(`${WEAPONS[c.id].name} ${w ? '강화' : '획득'}: ${WEAPONS[c.id].desc}`, 'info');
    } else if (c.type === 'passive') {
      S.passives[c.id] = (S.passives[c.id] || 0) + 1;
      const p = S.player;
      if (c.id === 'homeostasis') { p.maxHp += 20; p.hp += 20; p.regen += 0.3; }
      if (c.id === 'clavulanate') S.flags.clavulanate = true;
      if (c.id === 'antipd1') S.flags.antipd1 = true;
      if (c.id === 'vaccine') { S.memoryBonus.influenza = 0.5; }
      pushLog(`${PASSIVES[c.id].name}: ${PASSIVES[c.id].desc}`, 'info');
    } else {
      S.player.hp = Math.min(S.player.maxHp, S.player.hp + 30);
    }
  }

  // ------------------------------------------------------------------ 메인 루프
  function update(dt) {
    S.t += dt;
    const p = S.player;
    const dir = inputDir();
    p.x += dir.x * p.speed * dt; p.y += dir.y * p.speed * dt;
    if (dir.x || dir.y) p.face = dir;
    if (p.hurt > 0) p.hurt -= dt;

    // 독성: 청소율에 따라 감소, 높으면 생명력 감소
    const clr = 3 * (1 + 0.4 * (S.passives.clearance || 0));
    S.toxicity = Math.max(0, S.toxicity - clr * dt);
    if (S.toxicity > 85) p.hp -= 6 * dt;
    else if (S.toxicity > 60) p.hp -= 2 * dt;
    if (S.toxicity > 60 && !S._toxWarned) { S._toxWarned = true; recordNote('약물 독성 누적: 간·신장 청소율을 넘는 투여는 장기 손상을 유발 (생명력 감소)', 'warn'); }

    for (const k of AB_CLASSES) S.pressure[k] = Math.max(0, S.pressure[k] - 0.15 * dt);
    S.debuff.immunosuppress = Math.max(0, S.debuff.immunosuppress - dt);
    S.debuff.myelo = Math.max(0, S.debuff.myelo - dt);

    p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

    updateSpawning(dt);
    updateWeapons(dt);
    updateProjectiles(dt);
    updateEnemies(dt);
    updateGems(dt);

    for (const f of S.effects) {
      f.t -= dt;
      if (f.kind === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; }
      if (f.kind === 'zone' && f.t <= 0 && !f.done) {
        f.done = true;
        for (const e of S.enemies) if (!e.dead && dist2(f, e) < (f.r + e.r) ** 2) damageEnemy(e, f.wid, f.dmg, { area: true });
        S.effects.push({ kind: 'ring', x: f.x, y: f.y, r: f.r, t: 0.25, max: 0.25, color: f.color });
      }
    }
    S.effects = S.effects.filter(f => f.t > 0);
    for (const f of S.floaters) { f.t -= dt; f.y -= 30 * dt; }
    S.floaters = S.floaters.filter(f => f.t > 0);

    if (p.hp <= 0) endRun(false);
    else if (S.t >= D.RUN_LENGTH) endRun(true);
  }

  function endRun(win) {
    S.running = false; S.over = true;
    UI.showGameOver(win, S);
  }

  // ------------------------------------------------------------------ 렌더링
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const p = S.player;
    const cx = W / 2 - p.x, cy = H / 2 - p.y;

    // 조직 배경
    ctx.fillStyle = '#2a1016';
    ctx.fillRect(0, 0, W, H);
    const cell = 90;
    const ox = ((cx % cell) + cell) % cell, oy = ((cy % cell) + cell) % cell;
    ctx.strokeStyle = 'rgba(255,140,150,0.07)';
    ctx.lineWidth = 2;
    for (let x = -cell; x < W + cell; x += cell) {
      for (let y = -cell; y < H + cell; y += cell) {
        const gx = Math.round((x - cx) / cell), gy = Math.round((y - cy) / cell);
        const jx = ((gx * 73856093) ^ (gy * 19349663)) % 17, jy = ((gx * 83492791) ^ (gy * 2971215)) % 17;
        ctx.beginPath();
        ctx.ellipse(x + ox + jx, y + oy + jy, 38, 30, (gx + gy) * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,120,140,0.05)';
        ctx.beginPath(); ctx.arc(x + ox + jx + 4, y + oy + jy - 3, 8, 0, 6.28); ctx.fill();
      }
    }
    if (S.debuff.immunosuppress > 0 || S.debuff.myelo > 0) {
      ctx.fillStyle = 'rgba(80,80,120,0.12)'; ctx.fillRect(0, 0, W, H);
    }

    ctx.save();
    ctx.translate(cx, cy);

    for (const g of S.gems) {
      ctx.fillStyle = g.v >= 8 ? '#ff6bd6' : g.v >= 3 ? '#6bd8ff' : '#9dff8a';
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - g.r); ctx.lineTo(g.x + g.r * 0.7, g.y); ctx.lineTo(g.x, g.y + g.r); ctx.lineTo(g.x - g.r * 0.7, g.y);
      ctx.fill();
    }

    for (const f of S.effects) {
      const a = Math.max(0, f.t / f.max);
      if (f.kind === 'zone') {
        ctx.strokeStyle = f.color; ctx.globalAlpha = 0.8; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.15 + 0.3 * (1 - a); ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - a), 0, 6.28); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    for (const e of S.enemies) drawEnemy(e);

    // 호중구 궤도
    for (const w of S.weapons) {
      if (WEAPONS[w.id].pattern !== 'orbit') continue;
      const L = lvl(w);
      for (let i = 0; i < L.count; i++) {
        const a = w.angle + (i / L.count) * Math.PI * 2;
        const x = p.x + Math.cos(a) * L.radius, y = p.y + Math.sin(a) * L.radius;
        ctx.fillStyle = '#ffd9e6'; ctx.beginPath(); ctx.arc(x, y, 10, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#b04a8a';
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(k * 2.1) * 4, y + Math.sin(k * 2.1) * 4, 2.6, 0, 6.28); ctx.fill(); }
      }
    }

    for (const pr of S.projectiles) {
      ctx.fillStyle = pr.color;
      if (pr.wid === 'antibody') {
        ctx.strokeStyle = pr.color; ctx.lineWidth = 2.5;
        const a = Math.atan2(pr.vy, pr.vx);
        ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(a + Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, 0); ctx.lineTo(-5, -6); ctx.moveTo(0, 0); ctx.lineTo(5, -6); ctx.stroke();
        ctx.restore();
      } else if (pr.homing) {
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 7, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#1b2a44'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 3, 0, 6.28); ctx.fill();
      } else {
        const a = Math.atan2(pr.vy, pr.vx);
        ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(a);
        ctx.fillRect(-7, -3, 14, 6);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, -3, 7, 6);
        ctx.restore();
      }
    }

    for (const f of S.effects) {
      const a = Math.max(0, f.t / f.max);
      ctx.globalAlpha = a;
      if (f.kind === 'ring') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.1 - a * 0.4), 0, 6.28); ctx.stroke();
      } else if (f.kind === 'pseudopod') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(f.x, f.y);
        ctx.quadraticCurveTo((f.x + f.tx) / 2 + 10, (f.y + f.ty) / 2 - 10, f.tx, f.ty); ctx.stroke();
      } else if (f.kind === 'arc') {
        ctx.fillStyle = f.color; ctx.globalAlpha = a * 0.35;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.r, f.dir - f.arc / 2, f.dir + f.arc / 2); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = a; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, f.dir - f.arc / 2, f.dir + f.arc / 2); ctx.stroke();
      } else if (f.kind === 'spark') {
        ctx.fillStyle = f.color; ctx.fillRect(f.x - 2, f.y - 2, 4, 4);
      }
    }
    ctx.globalAlpha = 1;

    drawPlayer(p);

    ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const f of S.floaters) {
      ctx.globalAlpha = Math.min(1, f.t / 0.3);
      ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (touch.active && Math.hypot(touch.dx, touch.dy) > 12) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(touch.sx, touch.sy, 40, 0, 6.28); ctx.stroke();
      const m = Math.min(40, Math.hypot(touch.dx, touch.dy)), a = Math.atan2(touch.dy, touch.dx);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(touch.sx + Math.cos(a) * m, touch.sy + Math.sin(a) * m, 16, 0, 6.28); ctx.fill();
    }
  }

  function drawPlayer(p) {
    const t = S.t;
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = p.hurt > 0 ? '#ff9a9a' : '#f4efe6';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = p.r + Math.sin(a * 5 + t * 4) * 2.5 + Math.sin(a * 3 - t * 3) * 1.5;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.fill();
    ctx.fillStyle = '#7a5aa8';
    ctx.beginPath(); ctx.ellipse(-2, -1, 6, 4.5, 0.4, 0, 6.28); ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e) {
    const d = e.def, t = S.t;
    ctx.save(); ctx.translate(e.x, e.y);
    const col = e.flash > 0 ? '#ffffff' : d.color;
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
    switch (d.shape) {
      case 'cocci':
        for (const [x, y] of [[-4, -3], [4, -3], [0, 4], [-6, 4], [6, 4]]) {
          ctx.beginPath(); ctx.arc(x * e.r / 10, y * e.r / 10, e.r * 0.5, 0, 6.28); ctx.fill(); ctx.stroke();
        }
        break;
      case 'rod': {
        ctx.rotate(e.wob * 0.3);
        const l = e.r * 1.1, w = e.r * 0.55;
        ctx.beginPath(); ctx.moveTo(-l, -w); ctx.lineTo(l, -w); ctx.arc(l, 0, w, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(-l, w); ctx.arc(-l, 0, w, Math.PI / 2, Math.PI * 1.5); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-l - w, 0); ctx.quadraticCurveTo(-l - w - 6, (i - 1) * 6 + Math.sin(t * 8 + i) * 3, -l - w - 12, (i - 1) * 8); ctx.stroke(); }
        break;
      }
      case 'virus':
        ctx.rotate(t * 1.5 + e.wob);
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * 6.28;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * e.r, Math.sin(a) * e.r); ctx.lineTo(Math.cos(a) * (e.r + 4), Math.sin(a) * (e.r + 4)); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, 6.28); ctx.fill();
        if (e.noRelease > S.t) { ctx.strokeStyle = '#8fe3ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r + 7, 0, 6.28); ctx.stroke(); }
        break;
      case 'yeast':
        ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r * 0.8, 0.3, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(e.r * 0.9, -e.r * 0.6, e.r * 0.45, e.r * 0.38, 0.3, 0, 6.28); ctx.fill(); ctx.stroke();
        break;
      case 'worm': {
        const dx = S.player.x - e.x, dy = S.player.y - e.y;
        ctx.rotate(Math.atan2(dy, dx));
        const seg = 7, sr = e.r * 0.45;
        for (let i = seg - 1; i >= 0; i--) {
          const x = -i * sr * 1.3, y = Math.sin(t * 4 - i * 0.8) * sr * 0.8;
          ctx.beginPath(); ctx.arc(x, y, sr * (1 - i * 0.05), 0, 6.28); ctx.fill(); ctx.stroke();
        }
        break;
      }
      case 'tumor':
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
          const a = i / 16 * 6.28;
          const rr = e.r * (0.85 + 0.2 * Math.sin(a * 3 + e.wob) + 0.08 * Math.sin(a * 7 + t));
          i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(40,0,20,0.5)';
        ctx.beginPath(); ctx.arc(e.r * 0.15, -e.r * 0.1, e.r * 0.35, 0, 6.28); ctx.fill();
        break;
      case 'tcell':
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#4a2a8a'; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.65, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { const a = i * 1.57 + t; ctx.beginPath(); ctx.moveTo(Math.cos(a) * e.r, Math.sin(a) * e.r); ctx.lineTo(Math.cos(a) * (e.r + 5), Math.sin(a) * (e.r + 5)); ctx.stroke(); }
        break;
    }
    ctx.restore();
    // 내성 표시 링
    const resist = d.ring || e.tags.some(t => t.startsWith('resist_'));
    if (resist) {
      ctx.strokeStyle = e.tags.some(t => t.startsWith('resist_')) ? '#ff7b00' : d.ring;
      ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
    }
    if (e.opsonized > S.t) {
      ctx.fillStyle = '#ffe680';
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + S.t * 2; ctx.fillRect(e.x + Math.cos(a) * (e.r + 2) - 1.5, e.y + Math.sin(a) * (e.r + 2) - 1.5, 3, 3); }
    }
    if (d.boss || e.hp < e.maxHp) {
      const w = d.boss ? 90 : e.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w, 4);
      ctx.fillStyle = d.boss ? '#ff4d6d' : '#ff8a8a'; ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  // ------------------------------------------------------------------ 루프 / 제어
  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (S && S.running && !S.paused && !S.levelUp) update(dt);
    if (S) { render(); UI.updateHud(S); }
    requestAnimationFrame(frame);
  }

  function togglePause() {
    S.paused = !S.paused;
    if (S.paused) UI.showPause(S); else { UI.hidePause(); lastTime = performance.now(); }
  }

  function start() {
    S = newState();
    UI.reset();
    pushLog('대식세포로 조직을 순찰하세요. 치료수단마다 작용기전이 다르며, 표적이 없는 병원체에는 "무효"가 표시됩니다.', 'info');
    lastTime = performance.now();
  }

  window.HS_GAME = { start, togglePause, get state() { return S; }, AB_CLASS_NAMES, _debug: { spawnEnemy, applyChoice, gainXp, update, buildChoices } };
  requestAnimationFrame(frame);
})();

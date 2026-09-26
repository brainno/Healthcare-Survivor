// 효능 규칙이 작용기전과 일치하는지 검증한다. 실행: node tests/efficacy.test.js
const assert = require('assert');
const { ENEMIES, WEAPONS, PASSIVES, efficacy, spawnTable } = require('../js/data.js');

const m = (w, e, flags) => efficacy(WEAPONS[w], ENEMIES[e].tags, flags).mult;
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (err) { console.error('FAIL:', name, '\n ', err.message); process.exitCode = 1; }
}

test('페니실린: 그람양성 유효, MRSA 무효, 비세균 무효', () => {
  assert.ok(m('penicillin', 'staph') >= 1);
  assert.strictEqual(m('penicillin', 'mrsa'), 0);
  for (const e of ['influenza', 'candida', 'ascaris', 'cancer', 'autoreactive']) assert.strictEqual(m('penicillin', e), 0, e);
  assert.ok(m('penicillin', 'ecoli') > 0 && m('penicillin', 'ecoli') < 1);
});

test('클라불란산: β-락타마제 생성균에 효능 회복, MRSA에는 무효', () => {
  assert.strictEqual(m('penicillin', 'blac_ecoli'), 0);
  assert.ok(m('penicillin', 'blac_ecoli', { clavulanate: true }) > 0);
  assert.strictEqual(m('penicillin', 'mrsa', { clavulanate: true }), 0);
});

test('반코마이신: MRSA 유효, 그람음성 무효', () => {
  assert.ok(m('vancomycin', 'mrsa') >= 1);
  assert.strictEqual(m('vancomycin', 'ecoli'), 0);
  assert.strictEqual(m('vancomycin', 'blac_ecoli'), 0);
});

test('항생제는 바이러스·진균·기생충·자기세포에 무효', () => {
  for (const w of ['penicillin', 'vancomycin', 'ciprofloxacin'])
    for (const e of ['influenza', 'candida', 'ascaris', 'cancer', 'autoreactive']) assert.strictEqual(m(w, e), 0, `${w}->${e}`);
});

test('획득 내성 태그가 있으면 해당 계열 무효, 다른 계열은 유지', () => {
  const tags = ENEMIES.staph.tags.concat('resist_beta_lactam');
  assert.strictEqual(efficacy(WEAPONS.penicillin, tags).mult, 0);
  assert.ok(efficacy(WEAPONS.vancomycin, tags).mult > 0);
});

test('표적 특이 약물', () => {
  assert.ok(m('oseltamivir', 'influenza') > 0);
  assert.strictEqual(m('oseltamivir', 'staph'), 0);
  assert.ok(m('amphotericin', 'candida') >= 1);
  assert.strictEqual(m('amphotericin', 'staph'), 0);
  assert.ok(m('albendazole', 'ascaris') >= 1);
  assert.strictEqual(m('albendazole', 'candida'), 0);
  assert.ok(m('prednisolone', 'autoreactive') >= 1);
  assert.strictEqual(m('prednisolone', 'staph'), 0);
});

test('보체: 그람음성 > 그람양성, 자기세포 무효', () => {
  assert.ok(m('complement', 'ecoli') > m('complement', 'staph'));
  assert.strictEqual(m('complement', 'cancer'), 0);
});

test('면역관문: PD-L1이 T세포를 억제하고 항PD-1이 해제', () => {
  const base = m('ctl', 'cancer'), unlocked = m('ctl', 'cancer', { antipd1: true });
  assert.ok(base < unlocked);
  assert.ok(Math.abs(unlocked - WEAPONS.ctl.rules.find(r => r.if.includes('cancer')).mult) < 1e-9);
  assert.strictEqual(m('nk', 'cancer'), m('nk', 'cancer', { antipd1: true }), 'NK세포는 PD-1 경로와 무관하게 처리');
});

test('대식세포: 대형 기생충·CD47 암세포에 약함, 자가반응 T세포 무효', () => {
  assert.ok(m('phagocyte', 'ascaris') < 0.5);
  assert.ok(m('phagocyte', 'cancer') < 0.5);
  assert.strictEqual(m('phagocyte', 'autoreactive'), 0);
});

test('모든 적은 최소 1개 이상의 치료수단으로 처치 가능', () => {
  for (const e in ENEMIES) {
    const ok = Object.keys(WEAPONS).some(w => m(w, e) > 0);
    assert.ok(ok, e);
  }
});

test('데이터 무결성: 무기 레벨 5단계, 패시브 요구조건 유효, 출현표 ID 유효', () => {
  for (const id in WEAPONS) assert.strictEqual(WEAPONS[id].levels.length, 5, id);
  for (const id in PASSIVES) if (PASSIVES[id].requires) assert.ok(WEAPONS[PASSIVES[id].requires], id);
  for (const t of [0, 100, 300, 600]) for (const id in spawnTable(t)) assert.ok(ENEMIES[id], id);
});

console.log(`${passed} tests passed` + (process.exitCode ? ' (일부 실패)' : ''));

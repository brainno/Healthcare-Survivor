/*
 * Healthcare Survivor — 게임 데이터 및 효능 판정 규칙
 *
 * 모든 수치(피해량, 배율, 주기)는 게임 밸런스를 위한 추상화이며 임상 용량·효과를 의미하지 않는다.
 * 효능 규칙(어떤 치료수단이 어떤 병원체에 듣는가)은 실제 작용기전에 근거하여 작성하였다.
 * 근거 출처는 docs/DESIGN.md 참조.
 *
 * 브라우저(window.HS_DATA)와 Node(require) 양쪽에서 사용 가능하도록 작성.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------
  // 병원체 / 질환 (적)
  // tags: 효능 판정에 사용하는 생물학적 특성
  // ------------------------------------------------------------------
  const ENEMIES = {
    staph: {
      name: '황색포도상구균', sci: 'Staphylococcus aureus', group: '세균 (그람양성)',
      tags: ['bacteria', 'gram_pos', 'extracellular', 'peptidoglycan'],
      hp: 14, speed: 62, dmg: 6, r: 9, xp: 1, color: '#e8b33a', shape: 'cocci',
      divide: 15,
      desc: '두꺼운 펩티도글리칸 세포벽을 가진 그람양성 구균. 외막이 없다. 이분법으로 증식한다.',
    },
    ecoli: {
      name: '대장균', sci: 'Escherichia coli', group: '세균 (그람음성)',
      tags: ['bacteria', 'gram_neg', 'extracellular', 'peptidoglycan', 'outer_membrane'],
      hp: 16, speed: 70, dmg: 6, r: 9, xp: 1, color: '#d9745b', shape: 'rod',
      divide: 14,
      desc: '얇은 펩티도글리칸층 바깥에 지질다당류(LPS) 외막을 가진 그람음성 간균. 외막이 일부 약물의 투과를 제한한다.',
    },
    influenza: {
      name: '인플루엔자 바이러스', sci: 'Influenza A virus', group: '바이러스 (외피 보유)',
      tags: ['virus', 'enveloped', 'influenza', 'neuraminidase'],
      hp: 10, speed: 85, dmg: 5, r: 7, xp: 1, color: '#6fc3df', shape: 'virus',
      replicate: { interval: 9, count: 2 },
      desc: '숙주세포 안에서 복제되며 세포벽·리보솜이 없어 항생제의 표적이 존재하지 않는다. 뉴라미니데이스로 감염세포에서 방출된다. (게임에서는 비리온과 감염세포 군집을 하나의 적으로 추상화)',
    },
    candida: {
      name: '칸디다', sci: 'Candida albicans', group: '진균',
      tags: ['fungus', 'ergosterol', 'extracellular', 'eukaryote'],
      hp: 40, speed: 45, dmg: 8, r: 12, xp: 3, color: '#c9a0dc', shape: 'yeast',
      divide: 20,
      desc: '진핵생물로 세포막에 콜레스테롤 대신 에르고스테롤을 가진다. 펩티도글리칸이 없어 β-락탐계가 작용하지 않는다.',
    },
    mrsa: {
      name: 'MRSA', sci: 'Methicillin-resistant S. aureus', group: '세균 (그람양성, 내성)',
      tags: ['bacteria', 'gram_pos', 'extracellular', 'peptidoglycan', 'pbp2a'],
      hp: 22, speed: 64, dmg: 8, r: 10, xp: 2, color: '#f0d04a', shape: 'cocci', ring: '#ff3b3b',
      divide: 16,
      desc: 'mecA 유전자가 암호화하는 PBP2a는 β-락탐계와의 친화도가 낮아, 약물이 있어도 세포벽 합성이 계속된다.',
    },
    blac_ecoli: {
      name: 'β-락타마제 생성 대장균', sci: 'β-lactamase-producing E. coli', group: '세균 (그람음성, 내성)',
      tags: ['bacteria', 'gram_neg', 'extracellular', 'peptidoglycan', 'outer_membrane', 'beta_lactamase'],
      hp: 22, speed: 72, dmg: 8, r: 10, xp: 2, color: '#e0603f', shape: 'rod', ring: '#ff3b3b',
      divide: 15,
      desc: 'β-락타마제 효소가 β-락탐 고리를 가수분해하여 페니실린을 불활성화한다. 클라불란산 같은 β-락타마제 억제제로 일부 효소를 억제할 수 있다.',
    },
    ascaris: {
      name: '회충', sci: 'Ascaris lumbricoides', group: '기생충 (선충)',
      tags: ['parasite', 'helminth', 'multicellular', 'large', 'eukaryote'],
      hp: 140, speed: 38, dmg: 14, r: 20, xp: 8, color: '#e6d3b3', shape: 'worm',
      desc: '수십 cm까지 자라는 다세포 기생충. 대식세포가 탐식하기에는 지나치게 크다. 기생충 β-튜불린이 벤즈이미다졸계의 표적이다.',
    },
    cancer: {
      name: '암세포', sci: 'Malignant cell', group: '종양 (자기 세포 유래)',
      tags: ['host', 'cancer', 'rapid_division', 'pd_l1', 'cd47', 'solid', 'eukaryote'],
      hp: 60, speed: 30, dmg: 10, r: 14, xp: 4, color: '#b04a6a', shape: 'tumor',
      divide: 16,
      desc: '자기 세포에서 유래하여 병원체 표지가 없다. PD-L1로 T세포를 억제하고, CD47("먹지 마" 신호)로 대식세포 탐식을 회피한다. 빠르게 분열한다.',
    },
    autoreactive: {
      name: '자가반응성 T세포', sci: 'Autoreactive T cell', group: '자가면역',
      tags: ['host', 'immune_cell', 'autoreactive', 'eukaryote'],
      hp: 35, speed: 95, dmg: 12, r: 10, xp: 3, color: '#9b6bff', shape: 'tcell',
      desc: '면역관용이 깨져 자기 조직을 공격하는 T세포. 자기 세포이므로 다른 면역세포와 항생제로는 제거되지 않는다. 면역억제가 필요하다.',
    },
    // 보스
    ascaris_boss: {
      name: '회충 성충 덩어리', sci: 'Ascaris bolus', group: '기생충 (보스)',
      tags: ['parasite', 'helminth', 'multicellular', 'large', 'eukaryote'],
      hp: 1800, speed: 34, dmg: 25, r: 44, xp: 60, color: '#efdcbc', shape: 'worm', boss: true, memoryAs: 'ascaris',
      desc: '다수의 성충이 뭉친 덩어리. 장폐색을 유발할 수 있다.',
    },
    tumor_boss: {
      name: '악성 종괴', sci: 'Malignant tumor mass', group: '종양 (보스)',
      tags: ['host', 'cancer', 'rapid_division', 'pd_l1', 'cd47', 'solid', 'eukaryote'],
      hp: 4200, speed: 22, dmg: 30, r: 56, xp: 120, color: '#8e2f52', shape: 'tumor', boss: true, memoryAs: 'cancer',
      spawnChild: { id: 'cancer', interval: 4 },
      desc: '주변에 암세포를 계속 퍼뜨리는 종괴. 면역관문(PD-L1) 발현이 높다.',
    },
  };

  // ------------------------------------------------------------------
  // 치료수단 / 면역세포 (무기)
  // rules: 위에서부터 첫 번째로 일치하는 규칙이 적용된다. if=모두 보유, not=하나라도 보유 시 제외.
  //        일치하는 규칙이 없으면 배율 0 (무효), 이때 defaultNote를 사용한다.
  // immune: 면역세포 기반 → 면역억제/골수억제 디버프 및 면역기억 보너스 적용 대상
  // tcell: T세포 기반 → PD-L1에 의해 억제됨
  // cls: 항생제 계열 (선택압/내성 계산에 사용)
  // ------------------------------------------------------------------
  const HOST_NOTE = '자기 세포: 면역관용 및 조절 단백질로 보호됨';

  const WEAPONS = {
    phagocyte: {
      name: '대식세포 탐식', cat: 'innate', catName: '선천면역', icon: 'Mφ', color: '#f4efe6',
      pattern: 'melee', immune: true,
      levels: [
        { dmg: 9, cd: 0.8, range: 80 }, { dmg: 12, cd: 0.7, range: 88 }, { dmg: 15, cd: 0.62, range: 95 },
        { dmg: 19, cd: 0.55, range: 100 }, { dmg: 24, cd: 0.48, range: 110 },
      ],
      rules: [
        { if: ['autoreactive'], mult: 0, note: HOST_NOTE },
        { if: ['large'], mult: 0.1, note: '다세포 기생충은 너무 커서 탐식할 수 없음' },
        { if: ['cd47'], mult: 0.3, note: '암세포의 CD47 "먹지 마" 신호가 탐식을 억제' },
        { if: ['bacteria'], mult: 1.0 }, { if: ['fungus'], mult: 0.8 }, { if: ['virus'], mult: 0.7 },
      ],
      desc: '위족을 뻗어 가까운 병원체를 삼켜 리소좀에서 분해한다. 크기가 큰 기생충이나 CD47을 발현하는 암세포에는 약하다.',
    },
    neutrophil: {
      name: '호중구', cat: 'innate', catName: '선천면역', icon: 'N', color: '#ffd9e6',
      pattern: 'orbit', immune: true,
      levels: [
        { dmg: 6, count: 2, radius: 70, spin: 3.0 }, { dmg: 7, count: 3, radius: 75, spin: 3.2 },
        { dmg: 9, count: 3, radius: 82, spin: 3.4 }, { dmg: 10, count: 4, radius: 88, spin: 3.6 },
        { dmg: 13, count: 5, radius: 95, spin: 3.8 },
      ],
      rules: [
        { if: ['host'], mult: 0, note: HOST_NOTE },
        { if: ['bacteria'], mult: 1.2 }, { if: ['fungus'], mult: 1.0 },
        { if: ['large'], mult: 0.3, note: '호중구는 대형 기생충에 제한적 (호산구·IgE가 주역)' },
        { if: ['virus'], mult: 0.3, note: '바이러스 방어의 주역은 NK세포·T세포·인터페론' },
      ],
      desc: '혈중에 가장 많은 백혈구. 세균·진균 감염 부위에 가장 먼저 도착하여 탐식, 활성산소, 호중구 세포외 덫(NET)으로 제거한다.',
    },
    complement: {
      name: '보체 (MAC)', cat: 'innate', catName: '선천면역', icon: 'C', color: '#9ee37d',
      pattern: 'pulse', immune: true,
      levels: [
        { dmg: 10, cd: 2.4, radius: 120 }, { dmg: 13, cd: 2.2, radius: 135 }, { dmg: 17, cd: 2.0, radius: 150 },
        { dmg: 21, cd: 1.8, radius: 165 }, { dmg: 27, cd: 1.6, radius: 185 },
      ],
      rules: [
        { if: ['host'], mult: 0, note: 'CD55·CD59 등 보체조절 단백질이 자기 세포를 보호' },
        { if: ['gram_neg'], mult: 1.6, note: '막공격복합체(MAC)가 그람음성균 외막에 구멍을 뚫어 용해' },
        { if: ['gram_pos'], mult: 0.2, note: '두꺼운 펩티도글리칸층이 MAC의 세포막 삽입을 차단' },
        { if: ['enveloped'], mult: 0.6, note: '외피 바이러스는 보체에 의해 일부 용해됨' },
        { if: ['fungus'], mult: 0.2, note: '진균 세포벽이 MAC 용해를 막음 (옵소닌화는 가능)' },
        { if: ['helminth'], mult: 0.1, note: '기생충의 두꺼운 큐티클이 보체 공격을 방어' },
      ],
      desc: '혈장 단백질 연쇄반응의 최종 산물인 막공격복합체(C5b-9)가 표적의 막에 구멍을 낸다. 그람음성균에 특히 효과적이다.',
    },
    antibody: {
      name: 'IgG 항체', cat: 'adaptive', catName: '적응면역', icon: 'Y', color: '#ffe680',
      pattern: 'projectile', immune: true, opsonize: true,
      levels: [
        { dmg: 5, cd: 0.9, speed: 420, count: 1 }, { dmg: 6, cd: 0.8, speed: 440, count: 2 },
        { dmg: 7, cd: 0.7, speed: 460, count: 2 }, { dmg: 8, cd: 0.6, speed: 480, count: 3 },
        { dmg: 10, cd: 0.5, speed: 500, count: 3 },
      ],
      rules: [
        { if: ['host'], mult: 0, note: '정상적으로는 자기항원 반응 B세포가 제거됨 (면역관용)' },
        { if: ['virus'], mult: 1.2, note: '중화항체가 바이러스의 세포 결합을 차단' },
        { if: ['bacteria'], mult: 0.8 }, { if: ['fungus'], mult: 0.5 }, { if: ['helminth'], mult: 0.3 },
      ],
      desc: 'B세포(형질세포)가 분비하는 항체. 병원체를 중화하고, 표지(옵소닌화)하여 다른 모든 공격의 피해를 30% 높인다.',
    },
    nk: {
      name: 'NK 세포', cat: 'innate', catName: '선천면역', icon: 'NK', color: '#7fe0c9',
      pattern: 'homing', immune: true,
      levels: [
        { dmg: 16, cd: 1.6, speed: 260, count: 1 }, { dmg: 20, cd: 1.45, speed: 270, count: 1 },
        { dmg: 24, cd: 1.3, speed: 280, count: 2 }, { dmg: 30, cd: 1.15, speed: 290, count: 2 },
        { dmg: 36, cd: 1.0, speed: 300, count: 3 },
      ],
      rules: [
        { if: ['autoreactive'], mult: 0, note: HOST_NOTE },
        { if: ['virus'], mult: 1.3, note: '바이러스 감염세포는 MHC-I 발현이 감소 → NK세포가 "자기 결여"를 인식' },
        { if: ['cancer'], mult: 1.2, note: '종양세포의 MHC-I 소실 및 스트레스 리간드를 NK세포가 인식' },
        { if: ['bacteria'], mult: 0.2 }, { if: ['fungus'], mult: 0.2 },
      ],
      desc: '항원 감작 없이 MHC-I가 감소한 세포(바이러스 감염세포, 종양세포)를 퍼포린·그랜자임으로 제거한다.',
    },
    ctl: {
      name: '세포독성 T세포', cat: 'adaptive', catName: '적응면역', icon: 'CD8', color: '#5fb0ff',
      pattern: 'homing', immune: true, tcell: true,
      levels: [
        { dmg: 26, cd: 2.0, speed: 300, count: 1 }, { dmg: 32, cd: 1.8, speed: 310, count: 1 },
        { dmg: 40, cd: 1.6, speed: 320, count: 2 }, { dmg: 48, cd: 1.4, speed: 330, count: 2 },
        { dmg: 60, cd: 1.2, speed: 340, count: 3 },
      ],
      rules: [
        { if: ['autoreactive'], mult: 0, note: '조절 T세포가 억제해야 할 대상 — 세포독성으로 제거하지 않음' },
        { if: ['virus'], mult: 1.5, note: 'MHC-I에 제시된 바이러스 펩타이드를 인식하여 감염세포 제거' },
        { if: ['cancer'], mult: 1.5 },
        { if: ['bacteria'], mult: 0.1, note: 'CD8 T세포는 세포 밖 세균을 직접 표적하지 않음' },
      ],
      desc: 'MHC-I에 제시된 특이 항원을 인식하여 표적 세포를 제거한다. 종양의 PD-L1이 PD-1에 결합하면 기능이 억제된다.',
    },
    penicillin: {
      name: '페니실린', cat: 'antibiotic', catName: '항생제', icon: 'PEN', color: '#ffffff',
      pattern: 'projectile', cls: 'beta_lactam', clsName: 'β-락탐계', toxicity: 0.2,
      levels: [
        { dmg: 12, cd: 0.7, speed: 480, count: 1 }, { dmg: 14, cd: 0.62, speed: 500, count: 2 },
        { dmg: 17, cd: 0.55, speed: 520, count: 2 }, { dmg: 20, cd: 0.5, speed: 540, count: 3 },
        { dmg: 25, cd: 0.42, speed: 560, count: 3 },
      ],
      rules: [
        { if: ['pbp2a'], mult: 0, note: 'MRSA: PBP2a는 β-락탐 친화도가 낮아 세포벽 합성이 계속됨' },
        { if: ['beta_lactamase'], not: ['_clavulanate'], mult: 0, note: 'β-락타마제가 β-락탐 고리를 가수분해하여 불활성화' },
        { if: ['beta_lactamase', '_clavulanate'], mult: 0.9, note: '클라불란산이 β-락타마제를 억제하여 효능 회복' },
        { if: ['gram_pos'], mult: 1.3, note: 'PBP(트랜스펩티데이스)에 결합하여 펩티도글리칸 가교 형성 저해' },
        { if: ['gram_neg'], mult: 0.4, note: '그람음성균 외막이 페니실린 G의 투과를 제한' },
      ],
      defaultNote: '펩티도글리칸 세포벽이 없어 표적이 존재하지 않음',
      desc: '세균의 페니실린 결합 단백질(PBP)에 결합하여 펩티도글리칸 가교 형성을 막는다. 그람양성균에 강하다. 세포벽이 없는 바이러스, 에르고스테롤 막을 가진 진균, 사람 세포에는 표적이 없다.',
    },
    vancomycin: {
      name: '반코마이신', cat: 'antibiotic', catName: '항생제', icon: 'VAN', color: '#b8f0ff',
      pattern: 'projectile', cls: 'glycopeptide', clsName: '글리코펩티드계', toxicity: 1.2,
      levels: [
        { dmg: 16, cd: 1.0, speed: 380, count: 1 }, { dmg: 19, cd: 0.9, speed: 390, count: 1 },
        { dmg: 23, cd: 0.8, speed: 400, count: 2 }, { dmg: 28, cd: 0.72, speed: 410, count: 2 },
        { dmg: 34, cd: 0.64, speed: 420, count: 3 },
      ],
      rules: [
        { if: ['gram_neg'], mult: 0, note: '분자량이 커서(약 1,450 Da) 그람음성균 외막을 통과하지 못함' },
        { if: ['gram_pos'], mult: 1.2, note: 'D-Ala-D-Ala 말단에 결합하여 세포벽 합성 저해 — PBP2a와 무관하게 MRSA에 작용' },
      ],
      defaultNote: '펩티도글리칸 전구체(D-Ala-D-Ala)가 없어 표적이 존재하지 않음',
      desc: '펩티도글리칸 전구체의 D-Ala-D-Ala 말단에 결합한다. MRSA 치료의 표준 약물 중 하나이나 그람음성균에는 무효. 신독성 위험이 있다.',
    },
    ciprofloxacin: {
      name: '시프로플록사신', cat: 'antibiotic', catName: '항생제', icon: 'CIP', color: '#ffc38a',
      pattern: 'projectile', cls: 'fluoroquinolone', clsName: '플루오로퀴놀론계', toxicity: 0.6,
      levels: [
        { dmg: 10, cd: 0.8, speed: 460, count: 1 }, { dmg: 12, cd: 0.72, speed: 470, count: 2 },
        { dmg: 14, cd: 0.64, speed: 480, count: 2 }, { dmg: 17, cd: 0.56, speed: 490, count: 3 },
        { dmg: 21, cd: 0.5, speed: 500, count: 3 },
      ],
      rules: [
        { if: ['gram_neg'], mult: 1.2, note: 'DNA 자이레이스 억제 → 세균 DNA 복제 차단 (그람음성균에 특히 강함)' },
        { if: ['gram_pos'], mult: 0.8, note: '토포이소머라제 IV 억제 (그람양성균에는 상대적으로 약함)' },
      ],
      defaultNote: '세균형 DNA 자이레이스/토포이소머라제 IV가 없어 표적이 존재하지 않음',
      desc: '세균의 DNA 자이레이스와 토포이소머라제 IV를 억제하는 광범위 항생제. 남용 시 내성이 빠르게 확산된다.',
    },
    oseltamivir: {
      name: '오셀타미비르', cat: 'antiviral', catName: '항바이러스제', icon: 'OSE', color: '#8fe3ff',
      pattern: 'projectile', toxicity: 0.2, blockRelease: true,
      levels: [
        { dmg: 4, cd: 1.0, speed: 420, count: 1, block: 6 }, { dmg: 5, cd: 0.9, speed: 430, count: 2, block: 7 },
        { dmg: 6, cd: 0.8, speed: 440, count: 2, block: 8 }, { dmg: 7, cd: 0.7, speed: 450, count: 3, block: 9 },
        { dmg: 9, cd: 0.6, speed: 460, count: 3, block: 10 },
      ],
      rules: [
        { if: ['neuraminidase'], mult: 1.0, note: '뉴라미니데이스 억제 → 새 바이러스가 감염세포에서 방출되지 못함 (복제 중단)' },
      ],
      defaultNote: '인플루엔자 뉴라미니데이스가 없어 표적이 존재하지 않음',
      desc: '인플루엔자 바이러스의 뉴라미니데이스를 억제하여 감염세포에서 새 바이러스가 방출되지 못하게 한다. 직접 살상력은 낮지만 복제를 멈춘다.',
    },
    amphotericin: {
      name: '암포테리신 B', cat: 'antifungal', catName: '항진균제', icon: 'AmB', color: '#f7d774',
      pattern: 'projectile', toxicity: 3.0,
      levels: [
        { dmg: 26, cd: 1.3, speed: 360, count: 1 }, { dmg: 32, cd: 1.2, speed: 370, count: 1 },
        { dmg: 38, cd: 1.1, speed: 380, count: 2 }, { dmg: 46, cd: 1.0, speed: 390, count: 2 },
        { dmg: 56, cd: 0.9, speed: 400, count: 3 },
      ],
      rules: [
        { if: ['ergosterol'], mult: 1.5, note: '에르고스테롤에 결합해 세포막에 구멍 형성 → 이온 누출' },
      ],
      defaultNote: '에르고스테롤이 없음 (사람 세포막의 콜레스테롤에도 약하게 결합 → 독성의 원인)',
      desc: '진균 세포막의 에르고스테롤에 결합하여 막에 구멍을 낸다. 사람의 콜레스테롤에도 일부 결합하여 신독성이 크다.',
    },
    albendazole: {
      name: '알벤다졸', cat: 'antiparasitic', catName: '항기생충제', icon: 'ALB', color: '#e9c9a0',
      pattern: 'projectile', toxicity: 0.5,
      levels: [
        { dmg: 30, cd: 1.2, speed: 340, count: 1 }, { dmg: 38, cd: 1.1, speed: 350, count: 1 },
        { dmg: 46, cd: 1.0, speed: 360, count: 2 }, { dmg: 56, cd: 0.9, speed: 370, count: 2 },
        { dmg: 70, cd: 0.8, speed: 380, count: 3 },
      ],
      rules: [
        { if: ['helminth'], mult: 1.6, note: '기생충 β-튜불린에 선택적으로 결합 → 미세소관 형성 억제, 포도당 흡수 차단' },
      ],
      defaultNote: '표적인 기생충 β-튜불린이 없음',
      desc: '벤즈이미다졸계 구충제. 기생충의 β-튜불린에 선택적으로 결합하여 미세소관 형성을 억제한다.',
    },
    cisplatin: {
      name: '시스플라틴', cat: 'oncology', catName: '항암제', icon: 'Pt', color: '#d0d0e0',
      pattern: 'pulse', toxicity: 7, myelo: 5,
      levels: [
        { dmg: 30, cd: 4.0, radius: 170 }, { dmg: 38, cd: 3.7, radius: 185 }, { dmg: 48, cd: 3.4, radius: 200 },
        { dmg: 60, cd: 3.1, radius: 215 }, { dmg: 75, cd: 2.8, radius: 235 },
      ],
      rules: [
        { if: ['rapid_division'], mult: 1.5, note: 'DNA 가교 형성 → 빠르게 분열하는 세포가 먼저 사멸' },
        { if: ['bacteria'], mult: 0.4, note: '백금 화합물은 대장균의 세포분열을 억제함 (시스플라틴 발견의 계기, Rosenberg 1965)' },
        { if: ['eukaryote'], mult: 0.2 },
      ],
      defaultNote: 'DNA 복제를 하는 세포가 아님 (바이러스 입자 자체는 분열하지 않음)',
      desc: 'DNA 가닥 사이를 가교하여 복제를 막는 백금계 항암제. 분열이 빠른 정상세포(골수 등)도 손상되어 사용 후 면역세포 기능이 일시 저하된다(골수억제).',
    },
    radiotherapy: {
      name: '방사선치료', cat: 'oncology', catName: '항암/시술', icon: 'RT', color: '#ff9ff3',
      pattern: 'zone', toxicity: 2.5,
      levels: [
        { dmg: 40, cd: 2.6, radius: 70, delay: 0.8 }, { dmg: 50, cd: 2.4, radius: 78, delay: 0.75 },
        { dmg: 62, cd: 2.2, radius: 86, delay: 0.7 }, { dmg: 76, cd: 2.0, radius: 95, delay: 0.65 },
        { dmg: 95, cd: 1.8, radius: 105, delay: 0.6 },
      ],
      rules: [
        { if: ['rapid_division'], mult: 1.6, note: '이온화 방사선이 DNA 이중가닥을 절단 → 분열 중인 종양세포가 취약' },
        { if: ['bacteria'], mult: 0.5, note: '이온화 방사선은 세균 DNA도 손상시킴 (방사선 멸균의 원리)' },
        { if: ['virus'], mult: 0.3 }, { if: ['eukaryote'], mult: 0.3 },
      ],
      desc: '표적 부위에 이온화 방사선을 조사하여 DNA를 손상시킨다. 주변 정상조직 손상(독성)이 따른다.',
    },
    prednisolone: {
      name: '프레드니솔론', cat: 'immunomod', catName: '면역조절제', icon: 'PRED', color: '#ffb86b',
      pattern: 'pulse', toxicity: 1.0, immunosuppress: 3.5,
      levels: [
        { dmg: 22, cd: 3.0, radius: 200 }, { dmg: 28, cd: 2.8, radius: 215 }, { dmg: 35, cd: 2.6, radius: 230 },
        { dmg: 44, cd: 2.4, radius: 245 }, { dmg: 55, cd: 2.2, radius: 260 },
      ],
      rules: [
        { if: ['autoreactive'], mult: 2.0, note: '글루코코르티코이드가 림프구 활성·사이토카인 생성을 억제하고 세포사멸 유도' },
      ],
      defaultNote: '스테로이드는 병원체를 직접 죽이지 않음 (오히려 면역을 억제)',
      desc: '글루코코르티코이드 수용체를 통해 염증·면역 반응을 광범위하게 억제한다. 자가면역에 효과적이나 사용 직후 아군 면역세포의 기능도 떨어진다(감염 위험 증가).',
    },
    scalpel: {
      name: '수술용 메스', cat: 'surgery', catName: '수술', icon: '✂', color: '#e8f1ff',
      pattern: 'arc',
      levels: [
        { dmg: 22, cd: 1.3, range: 95, arc: 1.9 }, { dmg: 28, cd: 1.2, range: 105, arc: 2.0 },
        { dmg: 35, cd: 1.1, range: 115, arc: 2.1 }, { dmg: 44, cd: 1.0, range: 125, arc: 2.3 },
        { dmg: 56, cd: 0.9, range: 140, arc: 2.5 },
      ],
      rules: [
        { if: ['autoreactive'], mult: 0, note: '전신성 자가면역 질환은 국소 절제로 해결되지 않음' },
        { if: ['solid'], mult: 1.5, note: '국소 고형 종양은 외과적 절제가 핵심 치료' },
        { if: ['large'], mult: 1.5, note: '장폐색을 일으킨 회충 덩어리는 수술적 제거가 필요할 수 있음' },
        { if: ['fungus'], mult: 0.6 },
        { if: ['bacteria'], mult: 0.5, note: '농양은 절개 배농(I&D)으로 세균 부담을 줄임' },
        { if: ['virus'], mult: 0.1, note: '나노미터 크기의 바이러스는 절제 대상이 아님' },
      ],
      desc: '전방 부채꼴 범위를 절제한다. 고형 종양과 대형 기생충에 강하고, 미세 병원체와 전신 질환에는 약하다.',
    },
  };

  // ------------------------------------------------------------------
  // 패시브 (보조 요법, 생리 기능)
  // ------------------------------------------------------------------
  const PASSIVES = {
    fever: {
      name: '발열 반응', icon: '🌡', max: 3, catName: '생리 반응',
      desc: '체온 상승은 일부 병원체의 증식을 늦추고 면역세포 활성을 높인다. 레벨당 병원체 분열·복제 주기 +15%.',
    },
    gcsf: {
      name: 'G-CSF (조혈 촉진)', icon: '🩸', max: 3, catName: '보조 요법',
      desc: '과립구 집락 자극 인자. 골수에서 호중구 생성을 촉진한다. 레벨당 면역세포 무기 재사용 대기 -8%, 골수억제 지속시간 -30%.',
    },
    clearance: {
      name: '간·신장 청소율', icon: '🫘', max: 3, catName: '생리 기능',
      desc: '약물은 간 대사와 신장 배설로 제거된다. 레벨당 독성 감소 속도 +40%.',
    },
    homeostasis: {
      name: '항상성 유지', icon: '❤', max: 5, catName: '생리 기능',
      desc: '영양·수분·전해질 균형. 레벨당 최대 생명력 +20, 초당 회복 +0.3.',
    },
    stewardship: {
      name: '항생제 관리 프로그램', icon: '📋', max: 3, catName: '보건 정책',
      desc: '적정 약제·용량·기간을 지키는 항생제 스튜어드십. 레벨당 항생제 선택압 누적 -30%.',
    },
    clavulanate: {
      name: '클라불란산 병용', icon: '🛡', max: 1, catName: '약물 병용', requires: 'penicillin',
      desc: 'β-락타마제 억제제. 페니실린계(아목시실린 등)와 병용하면 β-락타마제 생성균에 대한 효능이 회복된다. (PBP2a 기전의 MRSA에는 무효)',
    },
    vaccine: {
      name: '인플루엔자 백신', icon: '💉', max: 1, catName: '예방',
      desc: '미리 항원에 노출시켜 기억 B·T세포를 만든다. 인플루엔자에 대한 면역기억이 즉시 최대치가 된다.',
    },
    antipd1: {
      name: '펨브롤리주맙 (항PD-1)', icon: '🔓', max: 1, catName: '면역항암제',
      desc: '면역관문 억제제. PD-1/PD-L1 결합을 차단해 T세포가 암세포를 공격할 수 있게 한다. 부작용: 면역 관련 이상반응(자가면역) 발생 증가.',
    },
  };

  const CATEGORY_COLORS = {
    innate: '#9ee37d', adaptive: '#5fb0ff', antibiotic: '#ffffff', antiviral: '#8fe3ff',
    antifungal: '#f7d774', antiparasitic: '#e9c9a0', oncology: '#ff9ff3', immunomod: '#ffb86b', surgery: '#e8f1ff',
  };

  // ------------------------------------------------------------------
  // 효능 판정
  // weapon: WEAPONS 항목, tags: 적의 태그 배열, flags: { clavulanate, antipd1 }
  // 반환: { mult, note }
  // ------------------------------------------------------------------
  function efficacy(weapon, tags, flags) {
    flags = flags || {};
    const has = new Set(tags);
    if (flags.clavulanate) has.add('_clavulanate');

    // 선택압으로 획득한 내성 (게임 중 동적으로 부여되는 태그)
    if (weapon.cls && has.has('resist_' + weapon.cls)) {
      return { mult: 0, note: weapon.clsName + ' 내성 획득: 약물 노출에 의한 선택압으로 내성 균주가 살아남아 증식' };
    }

    let result = null;
    for (const rule of weapon.rules) {
      const ok = rule.if.every(t => has.has(t)) && !(rule.not || []).some(t => has.has(t));
      if (ok) { result = { mult: rule.mult, note: rule.note || null }; break; }
    }
    if (!result) result = { mult: 0, note: weapon.defaultNote || '작용 표적이 없음' };

    // 면역관문: PD-L1이 T세포 기능을 억제
    if (weapon.tcell && has.has('pd_l1') && result.mult > 0) {
      if (flags.antipd1) {
        result = { mult: result.mult, note: '항PD-1 항체가 PD-1/PD-L1 결합을 차단 → T세포 공격 회복' };
      } else {
        result = { mult: result.mult * 0.25, note: '종양의 PD-L1이 T세포의 PD-1에 결합하여 T세포 기능 억제' };
      }
    }
    return result;
  }

  // 게임 시간(초)에 따른 출현 가중치
  function spawnTable(t) {
    const w = { staph: 5, ecoli: 5 };
    if (t > 45) w.influenza = 4;
    if (t > 100) w.candida = 2;
    if (t > 150) w.mrsa = 2.5;
    if (t > 200) w.blac_ecoli = 2.5;
    if (t > 230) w.cancer = 2;
    if (t > 260) w.ascaris = 1;
    if (t > 330) { w.mrsa += 1.5; w.candida += 1; w.cancer += 1.5; }
    return w;
  }

  const BOSSES = [
    { t: 300, id: 'ascaris_boss', msg: '경고: 회충 덩어리 출현 — 장폐색 위험' },
    { t: 480, id: 'tumor_boss', msg: '경고: 악성 종괴 발견 — 전이 진행 중' },
  ];

  const RUN_LENGTH = 600; // 10분 생존 시 승리

  const API = { ENEMIES, WEAPONS, PASSIVES, CATEGORY_COLORS, efficacy, spawnTable, BOSSES, RUN_LENGTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.HS_DATA = API;
})(typeof window !== 'undefined' ? window : globalThis);

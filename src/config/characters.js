// 角色数据（外观见 render/sprites.js 的 SPEC）。对象的键顺序就是阵容界面里的展示顺序。
// quality：品质（common 普通 / rare 精良 / epic 史诗 / legendary 传说，参考 RPG 物品品质色，只影响显示）；wage: 时薪；solo: 个人摸鱼技能；team: 全体摸鱼技能（可选）；unlockAfter: 通关第几关后解锁（0 = 初始就有）。
// team：特殊技能（永远手动，必须在工位上释放）。type：escort 带走老板（duration 秒）| delay 拖住老板（推迟查房 delay 秒）
//       | shield 打掩护（duration 秒内被查不算被抓）。short：卡片上的短名。
(function (g) {
  const OS = (g.OS = g.OS || {});
  OS.characters = {
    rabbit: { id: 'rabbit', name: '兔子', role: '实习生', wage: 20, unlockAfter: 0, quality: 'common',
      solo: { name: '上厕所', room: 'restroom', stay: 6, cooldown: 12, multiplier: 1.0 } },
    cat: { id: 'cat', name: '猫', role: '设计师', wage: 30, unlockAfter: 0, quality: 'rare',
      solo: { name: '喝咖啡', room: 'pantry', stay: 5, cooldown: 10, multiplier: 1.2 } },
    bear: { id: 'bear', name: '熊', role: '销售', wage: 40, unlockAfter: 0, quality: 'rare',
      solo: { name: '接水', room: 'pantry', stay: 4, cooldown: 9, multiplier: 1.0 } },
    fox: { id: 'fox', name: '狐狸', role: '工程师', wage: 50, unlockAfter: 0, quality: 'epic',
      solo: { name: '上厕所', room: 'restroom', stay: 5, cooldown: 14, multiplier: 1.0 },
      team: { type: 'escort', name: '向老板汇报', short: '汇报', room: 'meeting', duration: 8, cooldown: 35, charges: 2 } },
    hamster: { id: 'hamster', name: '仓鼠', role: '行政', wage: 15, unlockAfter: 3, quality: 'common',
      solo: { name: '溜达', room: 'restroom', stay: 3, cooldown: 6, multiplier: 1.0 } },
    penguin: { id: 'penguin', name: '企鹅', role: 'HR', wage: 45, unlockAfter: 5, quality: 'rare',
      solo: { name: '喝咖啡', room: 'pantry', stay: 6, cooldown: 12, multiplier: 1.5 } },
    sloth: { id: 'sloth', name: '树懒', role: '财务', wage: 35, unlockAfter: 6, quality: 'rare',
      solo: { name: '蹲坑', room: 'restroom', stay: 10, cooldown: 18, multiplier: 1.0 } },
    owl: { id: 'owl', name: '猫头鹰', role: '项目经理', wage: 60, unlockAfter: 8, quality: 'legendary',
      solo: { name: '上厕所', room: 'restroom', stay: 3, cooldown: 16, multiplier: 1.0 },
      team: { type: 'escort', name: '拉老板开会', short: '开会', room: 'meeting', duration: 12, cooldown: 50, charges: 1 } },
    parrot: { id: 'parrot', name: '鹦鹉', role: '秘书', wage: 35, unlockAfter: 10, quality: 'epic',
      solo: { name: '打印文件', room: 'printer', stay: 5, cooldown: 10, multiplier: 1.0 },
      team: { type: 'delay', name: '递文件', short: '递文件', delay: 10, cooldown: 30, charges: 2 } },
    dog: { id: 'dog', name: '小狗', role: '前台', wage: 25, unlockAfter: 11, quality: 'common',
      solo: { name: '跑腿', room: 'printer', stay: 3, cooldown: 6, multiplier: 1.0 } },
    raccoon: { id: 'raccoon', name: '浣熊', role: '运维', wage: 40, unlockAfter: 12, quality: 'rare',
      solo: { name: '上天台', room: 'rooftop', stay: 8, cooldown: 15, multiplier: 1.0 } },
    hedgehog: { id: 'hedgehog', name: '刺猬', role: '法务', wage: 55, unlockAfter: 13, quality: 'epic',
      solo: { name: '喝咖啡', room: 'pantry', stay: 4, cooldown: 12, multiplier: 1.0 },
      team: { type: 'shield', name: '打掩护', short: '掩护', duration: 10, cooldown: 60, charges: 1 } },
  };
})((typeof window!=="undefined"?window:globalThis));

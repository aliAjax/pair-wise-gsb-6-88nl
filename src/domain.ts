// 授权与发布审批台 —— 领域模型与纯逻辑（无 React 依赖，便于校验与持久化）

export type ChannelId = 'web' | 'ios' | 'android' | 'print' | 'outdoor';

export const CHANNELS: { id: ChannelId; label: string; short: string }[] = [
  { id: 'web', label: '网站 Web', short: 'Web' },
  { id: 'ios', label: 'iOS App', short: 'iOS' },
  { id: 'android', label: 'Android App', short: 'Android' },
  { id: 'print', label: '印刷 Print', short: 'Print' },
  { id: 'outdoor', label: '户外投放 Outdoor', short: 'Outdoor' },
];

export const channelLabel = (id: ChannelId) => CHANNELS.find((c) => c.id === id)?.label ?? id;
export const channelShort = (id: ChannelId) => CHANNELS.find((c) => c.id === id)?.short ?? id;

// ---- 授权记录（授权库中的一条授权依据）-----------------------------------
export interface License {
  id: string;
  font: string;
  licensor: string; // 授权主体
  ref: string; // 授权依据（合同/许可证编号）
  channels: ChannelId[]; // 授权覆盖渠道
  validFrom: string; // ISO 日期
  validUntil: string; // ISO 日期
  note?: string;
}

export type LicenseStatus = 'active' | 'expired' | 'pending';

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function licenseStatus(l: Pick<License, 'validFrom' | 'validUntil'>, today = todayISO()): LicenseStatus {
  if (today > l.validUntil) return 'expired';
  if (today < l.validFrom) return 'pending';
  return 'active';
}

// ---- 配对草稿 / 已冻结配对 ------------------------------------------------
export interface LicenseSlot {
  font: string;
  licenseId: string; // 必须指向授权库中的一条授权
  basis: string; // 该字体在本配对中登记的授权依据
}

export interface Pairing {
  id: number;
  rootId: number; // 同一条配对血脉（修订链）共享
  revision: number;
  title: string;
  category: string;
  sampleHeading: string;
  sampleBody: string;
  channel: ChannelId | '';
  heading: LicenseSlot;
  body: LicenseSlot;
  supersedesReleaseId?: string; // 修订自哪个已发布版本
  publishedReleaseId?: string; // 非空 = 已发布，字体组合与授权快照冻结
  createdAt: string;
}

// ---- 发布版本（冻结快照，不随后续授权改动而变）---------------------------
export interface LicenseSnapshotSlot {
  role: 'heading' | 'body';
  font: string;
  licenseId: string;
  basis: string;
  licensor: string;
  ref: string;
  channels: ChannelId[];
  validFrom: string;
  validUntil: string;
}

export interface Release {
  id: string;
  pairingId: number;
  rootId: number;
  revision: number;
  title: string;
  channel: ChannelId;
  publishedAt: string; // ISO 时间戳
  supersedesReleaseId?: string;
  slots: LicenseSnapshotSlot[];
}

// ---- 审批冲突明细 ---------------------------------------------------------
export type IssueCode =
  | 'NO_LICENSE'
  | 'CHANNEL_NOT_COVERED'
  | 'EXPIRED'
  | 'NOT_YET_VALID'
  | 'SEPARATE_BASIS';

export interface SlotIssue {
  slot: 'heading' | 'body';
  code: IssueCode;
  message: string;
}

export interface PairingConflict {
  pairingId: number;
  title: string;
  general: string[];
  slotIssues: SlotIssue[];
}

export interface ReleasedBrief {
  id: string;
  pairingId: number;
  title: string;
  revision: number;
  channel: ChannelId;
}

export interface BatchReport {
  at: string;
  selected: number;
  conflicts: PairingConflict[];
  released?: ReleasedBrief[]; // 成功批次中已生成的发布版本
}

export interface Evaluation {
  general: string[];
  slotIssues: SlotIssue[];
}

export const slotLabel = { heading: '标题', body: '正文' } as const;

/** 评估单个配对草稿：渠道覆盖、有效期、不同授权主体的分别依据 */
export function evaluatePairing(p: Pairing, licenses: License[], today = todayISO()): Evaluation {
  const general: string[] = [];
  const slotIssues: SlotIssue[] = [];

  if (!p.channel) general.push('未选择发布渠道');

  const roles: { role: 'heading' | 'body'; slot: LicenseSlot }[] = [
    { role: 'heading', slot: p.heading },
    { role: 'body', slot: p.body },
  ];

  const resolved = roles.map(({ role, slot }) => {
    const label = slotLabel[role];
    if (!slot.licenseId) {
      slotIssues.push({ slot: role, code: 'NO_LICENSE', message: `未选择${label}字体的授权记录` });
      return { role, slot, lic: undefined as License | undefined };
    }
    const lic = licenses.find((l) => l.id === slot.licenseId);
    if (!lic) {
      slotIssues.push({ slot: role, code: 'NO_LICENSE', message: `${label}字体引用的授权 ${slot.licenseId} 已不存在` });
      return { role, slot, lic: undefined };
    }
    if (lic.font !== slot.font) {
      slotIssues.push({
        slot: role,
        code: 'NO_LICENSE',
        message: `所选授权「${lic.ref}」对应字体为 ${lic.font}，与${label}字体 ${slot.font} 不一致`,
      });
      return { role, slot, lic: undefined };
    }
    if (p.channel && !lic.channels.includes(p.channel)) {
      slotIssues.push({
        slot: role,
        code: 'CHANNEL_NOT_COVERED',
        message: `授权未覆盖渠道「${channelLabel(p.channel)}」，当前覆盖：${lic.channels.map(channelShort).join('、') || '无'}`,
      });
    }
    if (today > lic.validUntil) {
      slotIssues.push({ slot: role, code: 'EXPIRED', message: `授权已于 ${lic.validUntil} 过期` });
    } else if (today < lic.validFrom) {
      slotIssues.push({ slot: role, code: 'NOT_YET_VALID', message: `授权自 ${lic.validFrom} 才生效` });
    }
    return { role, slot, lic };
  });

  // 标题与正文来自不同授权主体时，必须分别记录授权依据
  const h = resolved.find((r) => r.role === 'heading')?.lic;
  const b = resolved.find((r) => r.role === 'body')?.lic;
  if (h && b && h.licensor.trim() !== b.licensor.trim()) {
    if (!p.heading.basis.trim()) {
      slotIssues.push({
        slot: 'heading',
        code: 'SEPARATE_BASIS',
        message: `标题字体由「${h.licensor}」授权、正文字体由「${b.licensor}」授权，主体不同，必须单独记录标题字体的授权依据`,
      });
    }
    if (!p.body.basis.trim()) {
      slotIssues.push({
        slot: 'body',
        code: 'SEPARATE_BASIS',
        message: `标题字体由「${h.licensor}」授权、正文字体由「${b.licensor}」授权，主体不同，必须单独记录正文字体的授权依据`,
      });
    }
  }

  return { general, slotIssues };
}

export const isEvaluationClean = (e: Evaluation) => e.general.length === 0 && e.slotIssues.length === 0;

function snapshotSlot(role: 'heading' | 'body', slot: LicenseSlot, lic: License): LicenseSnapshotSlot {
  return {
    role,
    font: slot.font,
    licenseId: lic.id,
    basis: slot.basis.trim() || lic.ref,
    licensor: lic.licensor,
    ref: lic.ref,
    channels: [...lic.channels],
    validFrom: lic.validFrom,
    validUntil: lic.validUntil,
  };
}

function releaseId(now: string, pairingId: number) {
  return `REL-${now.replace(/[-:T.Z]/g, '').slice(0, 14)}-${pairingId}`;
}

export type SubmissionPlan =
  | { ok: true; report: BatchReport; releases: Release[] }
  | { ok: false; report: BatchReport };

/**
 * 批次提交：任何一套配对存在缺口，整批中止，不产生任何发布版本。
 * 纯函数 —— 调用方负责在 ok 时一次性原子写回 state（草稿与发布版本同步冻结）。
 */
export function planSubmission(drafts: Pairing[], licenses: License[], now: string): SubmissionPlan {
  const conflicts: PairingConflict[] = drafts
    .map((d) => ({ pairingId: d.id, title: d.title, ...evaluatePairing(d, licenses, now.slice(0, 10)) }))
    .filter((c) => c.general.length > 0 || c.slotIssues.length > 0);

  if (conflicts.length > 0) {
    return { ok: false, report: { at: now, selected: drafts.length, conflicts } };
  }

  const releases: Release[] = drafts.map((d) => {
    const hLic = licenses.find((l) => l.id === d.heading.licenseId)!;
    const bLic = licenses.find((l) => l.id === d.body.licenseId)!;
    return {
      id: releaseId(now, d.id),
      pairingId: d.id,
      rootId: d.rootId,
      revision: d.revision,
      title: d.title,
      channel: d.channel as ChannelId,
      publishedAt: now,
      supersedesReleaseId: d.supersedesReleaseId,
      slots: [snapshotSlot('heading', d.heading, hLic), snapshotSlot('body', d.body, bLic)],
    };
  });

  return {
    ok: true,
    releases,
    report: {
      at: now,
      selected: drafts.length,
      conflicts: [],
      released: releases.map((r) => ({
        id: r.id,
        pairingId: r.pairingId,
        title: r.title,
        revision: r.revision,
        channel: r.channel,
      })),
    },
  };
}

/** 基于已发布版本新建修订草稿（唯一的换字途径） */
export function newRevisionDraft(
  frozen: Pairing,
  release: Release,
  newId: number,
  nowISO: string,
): Pairing {
  const h = release.slots.find((s) => s.role === 'heading')!;
  const b = release.slots.find((s) => s.role === 'body')!;
  return {
    id: newId,
    rootId: frozen.rootId,
    revision: release.revision + 1,
    title: frozen.title,
    category: frozen.category,
    sampleHeading: frozen.sampleHeading,
    sampleBody: frozen.sampleBody,
    channel: release.channel,
    heading: { font: h.font, licenseId: h.licenseId, basis: h.basis },
    body: { font: b.font, licenseId: b.licenseId, basis: b.basis },
    supersedesReleaseId: release.id,
    createdAt: nowISO,
  };
}

// ---- 种子数据 -------------------------------------------------------------
const dayOffset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export function seedLicenses(): License[] {
  const far = 3000;
  return [
    {
      id: 'lic-fraunces',
      font: 'Fraunces',
      licensor: 'Google Fonts（SIL OFL）',
      ref: 'OFL-1.1-Fraunces',
      channels: ['web', 'ios', 'android', 'print', 'outdoor'],
      validFrom: dayOffset(-far),
      validUntil: dayOffset(far),
      note: 'SIL Open Font License 1.1，永久免版税',
    },
    {
      id: 'lic-dmsans',
      font: 'DM Sans',
      licensor: 'Google Fonts（SIL OFL）',
      ref: 'OFL-1.1-DMSans',
      channels: ['web', 'ios', 'android', 'print', 'outdoor'],
      validFrom: dayOffset(-far),
      validUntil: dayOffset(far),
      note: 'SIL Open Font License 1.1，永久免版税',
    },
    {
      id: 'lic-space',
      font: 'Space Grotesk',
      licensor: 'Google Fonts（SIL OFL）',
      ref: 'OFL-1.1-SpaceGrotesk',
      channels: ['web', 'ios', 'android', 'print', 'outdoor'],
      validFrom: dayOffset(-far),
      validUntil: dayOffset(far),
    },
    {
      id: 'lic-newsreader',
      font: 'Newsreader',
      licensor: 'Google Fonts（SIL OFL）',
      ref: 'OFL-1.1-Newsreader',
      channels: ['web', 'ios', 'android', 'print', 'outdoor'],
      validFrom: dayOffset(-far),
      validUntil: dayOffset(far),
    },
    {
      id: 'lic-plex',
      font: 'IBM Plex Sans',
      licensor: 'IBM（IBM Plex Font License）',
      ref: 'IBM-PLEX-2022-07',
      channels: ['web', 'ios', 'android', 'print'],
      validFrom: dayOffset(-900),
      validUntil: dayOffset(1600),
      note: 'IBM Plex 字体许可，未含户外投放',
    },
    {
      id: 'lic-playfair',
      font: 'Playfair Display',
      licensor: 'Google Fonts（SIL OFL）',
      ref: 'OFL-1.1-Playfair',
      channels: ['web', 'ios', 'android', 'print', 'outdoor'],
      validFrom: dayOffset(-far),
      validUntil: dayOffset(far),
    },
    {
      id: 'lic-cerebri',
      font: 'Cerebri Sans',
      licensor: 'North Type Foundry',
      ref: 'NTF-2024-088',
      channels: ['web', 'ios'],
      validFrom: dayOffset(-420),
      validUntil: dayOffset(-12),
      note: '商用桌面/内嵌授权，已到期待续约',
    },
    {
      id: 'lic-atyp',
      font: 'Atyp Display',
      licensor: 'Kiln Font Studio',
      ref: 'KFS-2026-014',
      channels: ['web'],
      validFrom: dayOffset(-60),
      validUntil: dayOffset(420),
      note: '仅授权网站使用，App / 印刷 / 户外需另购',
    },
  ];
}

const nowText = () => new Date().toISOString();

export function seedPairings(): Pairing[] {
  return [
    {
      id: 1,
      rootId: 1,
      revision: 1,
      title: 'Editorial calm',
      category: 'Editorial',
      sampleHeading: 'A slower way to see',
      sampleBody:
        'Good typography creates space for ideas to breathe. Pair a confident display face with a quiet, generous text face.',
      channel: 'web',
      heading: { font: 'Fraunces', licenseId: 'lic-fraunces', basis: 'OFL-1.1-Fraunces' },
      body: { font: 'DM Sans', licenseId: 'lic-dmsans', basis: 'OFL-1.1-DMSans' },
      createdAt: nowText(),
    },
    {
      id: 2,
      rootId: 2,
      revision: 1,
      title: 'Field guide',
      category: 'Brand',
      sampleHeading: 'Small details, lasting impressions',
      sampleBody: 'Typography is the voice of a page. Find a combination that feels clear, warm and distinctly yours.',
      channel: 'print',
      // 故意制造：授权过期 + 渠道未覆盖 + 授权主体不同却漏记标题依据
      heading: { font: 'Cerebri Sans', licenseId: 'lic-cerebri', basis: '' },
      body: { font: 'Newsreader', licenseId: 'lic-newsreader', basis: 'OFL-1.1-Newsreader' },
      createdAt: nowText(),
    },
    {
      id: 3,
      rootId: 3,
      revision: 1,
      title: 'Studio notes',
      category: 'Portfolio',
      sampleHeading: 'Make room for the unexpected',
      sampleBody:
        'A thoughtful pairing can add rhythm to even the simplest interface. Try contrast in shape, not just size.',
      channel: 'android',
      // 故意制造：正文授权仅覆盖 Web + 两家主体不同却漏记正文依据
      heading: { font: 'IBM Plex Sans', licenseId: 'lic-plex', basis: 'IBM-PLEX-2022-07' },
      body: { font: 'Atyp Display', licenseId: 'lic-atyp', basis: '' },
      createdAt: nowText(),
    },
    {
      id: 4,
      rootId: 4,
      revision: 1,
      title: 'Quiet quarterly',
      category: 'Editorial',
      sampleHeading: 'Notes on patience and print',
      sampleBody: 'A quarterly journal set in two quiet faces, frozen at the moment it went to press.',
      channel: 'print',
      heading: { font: 'Playfair Display', licenseId: 'lic-playfair', basis: 'OFL-1.1-Playfair' },
      body: { font: 'IBM Plex Sans', licenseId: 'lic-plex', basis: 'IBM-PLEX-2022-07' },
      publishedReleaseId: 'REL-202608121030-4',
      createdAt: nowText(),
    },
  ];
}

export function seedReleases(licenses: License[]): Release[] {
  const find = (id: string) => licenses.find((l) => l.id === id)!;
  return [
    {
      id: 'REL-202608121030-4',
      pairingId: 4,
      rootId: 4,
      revision: 1,
      title: 'Quiet quarterly',
      channel: 'print',
      publishedAt: '2026-08-12T10:30:00.000Z',
      slots: [
        snapshotSlot('heading', { font: 'Playfair Display', licenseId: 'lic-playfair', basis: 'OFL-1.1-Playfair' }, find('lic-playfair')),
        snapshotSlot('body', { font: 'IBM Plex Sans', licenseId: 'lic-plex', basis: 'IBM-PLEX-2022-07' }, find('lic-plex')),
      ],
    },
  ];
}

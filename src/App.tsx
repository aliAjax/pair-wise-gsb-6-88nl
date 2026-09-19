import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  BookLock,
  CheckCircle2,
  ChevronRight,
  CopyPlus,
  FileCheck2,
  FileX2,
  History,
  Lock,
  Pencil,
  Plus,
  ScrollText,
  ShieldCheck,
  ShieldQuestion,
  Snowflake,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  BatchReport,
  CHANNELS,
  ChannelId,
  Evaluation,
  License,
  LicenseSlot,
  LicenseStatus,
  Pairing,
  PairingConflict,
  Release,
  channelLabel,
  channelShort,
  evaluatePairing,
  isEvaluationClean,
  licenseStatus,
  newRevisionDraft,
  planSubmission,
  seedLicenses,
  seedPairings,
  seedReleases,
  slotLabel,
  todayISO,
} from './domain';

const STORE_KEY = 'licensing-console-v1';

interface PersistShape {
  licenses: License[];
  pairings: Pairing[];
  releases: Release[];
  report: BatchReport | null;
}

function loadState(): PersistShape {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as PersistShape;
      if (Array.isArray(p.licenses) && Array.isArray(p.pairings) && Array.isArray(p.releases)) return p;
    }
  } catch {
    /* fall through to seed */
  }
  const licenses = seedLicenses();
  return { licenses, pairings: seedPairings(), releases: seedReleases(licenses), report: null };
}

type View = 'console' | 'releases' | 'licenses';

const statusMeta: Record<LicenseStatus, { text: string; cls: string }> = {
  active: { text: '有效', cls: 'st-active' },
  expired: { text: '已过期', cls: 'st-expired' },
  pending: { text: '未生效', cls: 'st-pending' },
};

function StatusPill({ lic }: { lic: Pick<License, 'validFrom' | 'validUntil'> }) {
  const s = licenseStatus(lic);
  return <span className={`pill ${statusMeta[s].cls}`}>{statusMeta[s].text}</span>;
}

function ChannelChips({ ids, dims = [] }: { ids: ChannelId[]; dims?: ChannelId[] }) {
  return (
    <span className="chips">
      {ids.map((c) => (
        <span key={c} className={`chip ${dims.includes(c) ? 'chip-dim' : ''}`}>
          {channelShort(c)}
        </span>
      ))}
    </span>
  );
}

export default function App() {
  const initial = useMemo(loadState, []);
  const [licenses, setLicenses] = useState<License[]>(initial.licenses);
  const [pairings, setPairings] = useState<Pairing[]>(initial.pairings);
  const [releases, setReleases] = useState<Release[]>(initial.releases);
  const [report, setReport] = useState<BatchReport | null>(initial.report);

  const [view, setView] = useState<View>('console');
  const [selectedId, setSelectedId] = useState<number>(initial.pairings[0]?.id ?? 0);
  const [checked, setChecked] = useState<number[]>([]);
  const [toast, setToast] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingLicense, setEditingLicense] = useState<License | null>(null);
  const [showLicenseForm, setShowLicenseForm] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ licenses, pairings, releases, report }));
  }, [licenses, pairings, releases, report]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const drafts = pairings.filter((p) => !p.publishedReleaseId);
  const frozen = pairings.filter((p) => p.publishedReleaseId);
  const current = pairings.find((p) => p.id === selectedId) ?? drafts[0] ?? frozen[0];

  const evals = useMemo(() => {
    const m = new Map<number, Evaluation>();
    pairings.forEach((p) => m.set(p.id, evaluatePairing(p, licenses)));
    return m;
  }, [pairings, licenses]);

  const readyIds = drafts.filter((d) => isEvaluationClean(evals.get(d.id)!)).map((d) => d.id);
  const selectedDrafts = drafts.filter((d) => checked.includes(d.id));

  // ---- 草稿编辑（已发布配对的组合不可改）----
  const mutateDraft = (id: number, patch: Partial<Pairing>) =>
    setPairings((ps) => ps.map((p) => (p.id === id && !p.publishedReleaseId ? { ...p, ...patch } : p)));

  const mutateSlot = (id: number, role: 'heading' | 'body', patch: Partial<LicenseSlot>) =>
    setPairings((ps) =>
      ps.map((p) => {
        if (p.id !== id || p.publishedReleaseId) return p;
        return { ...p, [role]: { ...p[role], ...patch } };
      }),
    );

  const onPickFont = (id: number, role: 'heading' | 'body', font: string) =>
    mutateSlot(id, role, { font, licenseId: '', basis: '' });

  const onPickLicense = (id: number, role: 'heading' | 'body', licId: string) => {
    const p = pairings.find((x) => x.id === id)!;
    const lic = licenses.find((l) => l.id === licId);
    if (!lic) return mutateSlot(id, role, { licenseId: '' });
    mutateSlot(id, role, { licenseId: licId, basis: p[role].basis.trim() || lic.ref });
  };

  const createDraft = () => {
    const title = newTitle.trim() || '未命名配对';
    const hLic = licenses.find((l) => l.font === 'Fraunces') ?? licenses[0];
    const bLic = licenses.find((l) => l.font === 'DM Sans' && l.id !== hLic.id) ?? licenses[1] ?? licenses[0];
    const id = Date.now();
    setPairings((ps) => [
      ...ps,
      {
        id,
        rootId: id,
        revision: 1,
        title,
        category: 'Untitled',
        sampleHeading: 'Your new headline',
        sampleBody: 'Start with a sentence that lets your type pairing show its character.',
        channel: 'web',
        heading: { font: hLic.font, licenseId: hLic.id, basis: hLic.ref },
        body: { font: bLic.font, licenseId: bLic.id, basis: bLic.ref },
        createdAt: new Date().toISOString(),
      },
    ]);
    setSelectedId(id);
    setChecked((c) => [...c, id]);
    setShowNew(false);
    setNewTitle('');
  };

  const deleteDraft = (id: number) => {
    setPairings((ps) => ps.filter((p) => p.id !== id));
    setChecked((c) => c.filter((x) => x !== id));
    if (selectedId === id) {
      const rest = pairings.filter((p) => p.id !== id);
      setSelectedId(rest[0]?.id ?? 0);
    }
  };

  // ---- 批次提交：任一缺口 → 整批中止，草稿不变 ----
  const submitBatch = () => {
    if (selectedDrafts.length === 0) return;
    const now = new Date().toISOString();
    const plan = planSubmission(selectedDrafts, licenses, now);
    setReport(plan.report);
    if (!plan.ok) {
      setToast({
        kind: 'warn',
        text: `整批发布中止：${plan.report.conflicts.length} 套配对存在 ${plan.report.conflicts.reduce(
          (n, c) => n + c.general.length + c.slotIssues.length,
          0,
        )} 项缺口，草稿未做任何改动。`,
      });
      const first = plan.report.conflicts[0];
      if (first) setSelectedId(first.pairingId);
      return;
    }
    // 全部通过 → 原子冻结：写发布版本并把对应草稿标记为已发布
    const releaseById = new Map(plan.releases.map((r) => [r.pairingId, r]));
    setReleases((rs) => [...plan.releases, ...rs]);
    setPairings((ps) =>
      ps.map((p) => {
        const r = releaseById.get(p.id);
        return r ? { ...p, publishedReleaseId: r.id } : p;
      }),
    );
    setChecked([]);
    setToast({ kind: 'ok', text: `已发布 ${plan.releases.length} 套配对，字体组合与授权快照已冻结。` });
  };

  // ---- 发布后只能新建修订 ----
  const createRevision = (frozenPair: Pairing) => {
    const release = releases.find((r) => r.id === frozenPair.publishedReleaseId);
    if (!release) return;
    const id = Date.now();
    const draft = newRevisionDraft(frozenPair, release, id, new Date().toISOString());
    setPairings((ps) => [...ps, draft]);
    setSelectedId(id);
    setView('console');
    setToast({ kind: 'ok', text: `已基于 ${release.id} 新建修订 v${draft.revision}（草稿），原发布版本保持冻结。` });
  };

  const saveLicense = (lic: License) => {
    setLicenses((ls) => {
      const exists = ls.some((l) => l.id === lic.id);
      return exists ? ls.map((l) => (l.id === lic.id ? lic : l)) : [...ls, lic];
    });
    setShowLicenseForm(false);
    setEditingLicense(null);
  };

  const deleteLicense = (lic: License) => {
    const used = drafts.filter((d) => d.heading.licenseId === lic.id || d.body.licenseId === lic.id);
    const msg =
      used.length > 0
        ? `该授权被 ${used.length} 套草稿引用（${used.map((u) => u.title).join('、')}）。删除后它们将因“授权不存在”而无法发布。已发布版本的冻结快照不受影响。仍要删除？`
        : '删除该授权记录？已发布版本的冻结快照不受影响。';
    if (!window.confirm(msg)) return;
    setLicenses((ls) => ls.filter((l) => l.id !== lic.id));
  };

  const fonts = Array.from(new Set(licenses.map((l) => l.font)));
  const allChecked = drafts.length > 0 && selectedDrafts.length === drafts.length;

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={18} />
          </div>
          <div>
            <b>License Desk</b>
            <small>授权与发布审批台</small>
          </div>
        </div>
        <div className="nav-section">
          <span>审批工作区</span>
          <button className={`nav ${view === 'console' ? 'active' : ''}`} onClick={() => setView('console')}>
            <FileCheck2 size={16} />
            发布审批台
            <b>{drafts.length}</b>
          </button>
          <button className={`nav ${view === 'releases' ? 'active' : ''}`} onClick={() => setView('releases')}>
            <History size={16} />
            发布台账
            <b>{releases.length}</b>
          </button>
          <button className={`nav ${view === 'licenses' ? 'active' : ''}`} onClick={() => setView('licenses')}>
            <BookLock size={16} />
            授权字体库
            <b>{licenses.length}</b>
          </button>
        </div>

        <div className="saved">
          <div className="saved-head">
            <span>批次状态</span>
          </div>
          <div className="stat">
            <BadgeCheck size={15} />
            可发布草稿
            <b>{readyIds.length}</b>
          </div>
          <div className="stat stat-warn">
            <ShieldQuestion size={15} />
            存在授权缺口
            <b>{drafts.length - readyIds.length}</b>
          </div>
          <div className="stat stat-frozen">
            <Snowflake size={15} />
            已冻结发布
            <b>{releases.length}</b>
          </div>
        </div>

        <div className="aside-foot">
          <div className="profile">
            <div className="avatar">YL</div>
            <div>
              <b>Yuki Lin</b>
              <small>字体授权管理员</small>
            </div>
          </div>
        </div>
      </aside>

      <main>
        {view === 'console' && (
          <ConsoleView
            header={
              <Header
                crumb="FONT LICENSING / 发布审批台"
                title="授权齐备，方可发布。"
                desc="每套配对登记标题字体、正文字体与发布渠道；授权未覆盖渠道、已过期，或不同授权主体缺少分别依据时，整批发布中止。"
                action={
                  <button className="primary" onClick={() => setShowNew(true)}>
                    <Plus size={16} />
                    新建配对
                  </button>
                }
              />
            }
            drafts={drafts}
            evals={evals}
            current={current}
            currentEval={current ? evals.get(current.id)! : undefined}
            selectedId={selectedId}
            checked={checked}
            allChecked={allChecked}
            readyIds={readyIds}
            report={report}
            licenses={licenses}
            fonts={fonts}
            frozenCount={frozen.length}
            releases={releases}
            onSelect={setSelectedId}
            onToggle={(id) =>
              setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
            }
            onToggleAll={() => setChecked(allChecked ? [] : drafts.map((d) => d.id))}
            onSubmit={submitBatch}
            onMutate={mutateDraft}
            onPickFont={onPickFont}
            onPickLicense={onPickLicense}
            onMutateSlot={mutateSlot}
            onDelete={deleteDraft}
            onNewRevision={createRevision}
            onGoReleases={() => setView('releases')}
          />
        )}

        {view === 'releases' && (
          <ReleasesView
            releases={releases}
            pairings={pairings}
            drafts={drafts}
            onNewRevision={createRevision}
            header={
              <Header
                crumb="FONT LICENSING / 发布台账"
                title="每一次发布都是一份冻结证据。"
                desc="发布后字体组合与授权依据被整体快照；即使授权库随后变更或过期，历史发布版本仍保持发布当时的状态。换字只能新建修订。"
              />
            }
          />
        )}

        {view === 'licenses' && (
          <LicensesView
            licenses={licenses}
            drafts={drafts}
            header={
              <Header
                crumb="FONT LICENSING / 授权字体库"
                title="授权依据登记处。"
                desc="维护每种字体的授权主体、授权编号、覆盖渠道与有效期。标题与正文来自不同授权主体时，配对两侧必须分别登记依据。"
                action={
                  <button
                    className="primary"
                    onClick={() => {
                      setEditingLicense(null);
                      setShowLicenseForm(true);
                    }}
                  >
                    <Plus size={16} />
                    新增授权
                  </button>
                }
              />
            }
            onEdit={(l) => {
              setEditingLicense(l);
              setShowLicenseForm(true);
            }}
            onDelete={deleteLicense}
          />
        )}
      </main>

      {toast && (
        <div className={`toast ${toast.kind === 'ok' ? 'toast-ok' : 'toast-warn'}`}>
          {toast.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.text}
          <button onClick={() => setToast(null)}>
            <X size={13} />
          </button>
        </div>
      )}

      {showNew && (
        <Modal onClose={() => setShowNew(false)} title="新建配对草稿">
          <label className="f-label">
            配对名称
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createDraft()}
              placeholder="例如：Quiet confidence"
            />
          </label>
          <div className="modal-actions">
            <button className="outline" onClick={() => setShowNew(false)}>
              取消
            </button>
            <button className="primary" onClick={createDraft}>
              创建草稿
            </button>
          </div>
        </Modal>
      )}

      {showLicenseForm && (
        <LicenseForm
          initial={editingLicense}
          onClose={() => {
            setShowLicenseForm(false);
            setEditingLicense(null);
          }}
          onSave={saveLicense}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// 通用骨架
// --------------------------------------------------------------------------

function Header({
  crumb,
  title,
  desc,
  action,
}: {
  crumb: string;
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <header>
      <div>
        <div className="crumb">{crumb}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {action && <div className="actions">{action}</div>}
    </header>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// 审批台
// --------------------------------------------------------------------------

function ConsoleView(props: {
  header: React.ReactNode;
  drafts: Pairing[];
  evals: Map<number, Evaluation>;
  current?: Pairing;
  currentEval?: Evaluation;
  selectedId: number;
  checked: number[];
  allChecked: boolean;
  readyIds: number[];
  report: BatchReport | null;
  licenses: License[];
  fonts: string[];
  frozenCount: number;
  releases: Release[];
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  onSubmit: () => void;
  onMutate: (id: number, patch: Partial<Pairing>) => void;
  onPickFont: (id: number, role: 'heading' | 'body', font: string) => void;
  onPickLicense: (id: number, role: 'heading' | 'body', licId: string) => void;
  onMutateSlot: (id: number, role: 'heading' | 'body', patch: Partial<LicenseSlot>) => void;
  onDelete: (id: number) => void;
  onNewRevision: (p: Pairing) => void;
  onGoReleases: () => void;
}) {
  const {
    header, drafts, evals, current, currentEval, selectedId, checked, allChecked, readyIds, report,
    licenses, fonts, releases, onSelect, onToggle, onToggleAll, onSubmit, onMutate, onPickFont,
    onPickLicense, onMutateSlot, onDelete, onNewRevision, onGoReleases,
  } = props;

  const selectedDrafts = drafts.filter((d) => checked.includes(d.id));
  const selectedReady = selectedDrafts.filter((d) => readyIds.includes(d.id)).length;

  return (
    <>
      {header}
      <div className="layout">
        <section className="gallery">
          <div className="gallery-head">
            <div>
              <h2>待审批草稿</h2>
              <span>{drafts.length} 套草稿 · {readyIds.length} 套满足发布条件</span>
            </div>
            <label className="check-all">
              <input type="checkbox" checked={allChecked} onChange={onToggleAll} />
              全选本批
            </label>
          </div>

          <div className="pair-list">
            {drafts.length === 0 && (
              <div className="empty-card">
                <Snowflake size={18} />
                <div>
                  <b>暂无待发布草稿</b>
                  <span>所有配对均已冻结发布。如需换字，请前往发布台账对某个版本「新建修订」。</span>
                </div>
                <button className="outline" onClick={onGoReleases}>
                  <History size={14} />
                  前往发布台账
                </button>
              </div>
            )}
            {drafts.map((p) => {
              const e = evals.get(p.id)!;
              const clean = isEvaluationClean(e);
              const issueCount = e.general.length + e.slotIssues.length;
              return (
                <div
                  key={p.id}
                  className={`pair ${selectedId === p.id ? 'selected' : ''} ${clean ? '' : 'pair-blocked'}`}
                  onClick={() => onSelect(p.id)}
                >
                  <div className="pair-check" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={checked.includes(p.id)} onChange={() => onToggle(p.id)} />
                  </div>
                  <div className="pair-body">
                    <div className="pair-top">
                      <span>
                        {p.category} · 修订 v{p.revision}
                      </span>
                      {clean ? (
                        <span className="mini mini-ok">
                          <BadgeCheck size={13} /> 可发布
                        </span>
                      ) : (
                        <span className="mini mini-bad">
                          <AlertTriangle size={13} /> {issueCount} 项阻断
                        </span>
                      )}
                    </div>
                    <strong style={{ fontFamily: p.heading.font }}>{p.title}</strong>
                    <p>
                      <Type size={10} /> {p.heading.font}
                      <ChevronRight size={10} />
                      {p.body.font}
                      <span className="dot">·</span>
                      {p.channel ? channelLabel(p.channel) : '未选渠道'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="batch-bar">
            <div>
              <b>批次提交</b>
              <span>
                已选 {selectedDrafts.length} 套{selectedDrafts.length > 0 && `，其中 ${selectedReady} 套通过校验`}
              </span>
            </div>
            <button className="primary" disabled={selectedDrafts.length === 0} onClick={onSubmit}>
              <ScrollText size={15} />
              提交发布
            </button>
          </div>
          <p className="batch-note">
            任一配对缺少覆盖该渠道且在有效期内的授权，或不同授权主体缺少分别依据，整批立即中止，所有草稿保持原样。
          </p>

          {report && <ReportPanel report={report} />}
        </section>

        <section className="studio">
          {current ? (
            current.publishedReleaseId ? (
              <FrozenPanel
                pairing={current}
                release={releases.find((r) => r.id === current.publishedReleaseId)}
                licenses={licenses}
                onNewRevision={() => onNewRevision(current)}
              />
            ) : (
              <DraftEditor
                p={current}
                evalResult={currentEval ?? evals.get(current.id)!}
                licenses={licenses}
                fonts={fonts}
                onMutate={(patch) => onMutate(current.id, patch)}
                onPickFont={(role, font) => onPickFont(current.id, role, font)}
                onPickLicense={(role, id) => onPickLicense(current.id, role, id)}
                onMutateSlot={(role, patch) => onMutateSlot(current.id, role, patch)}
                onDelete={() => onDelete(current.id)}
              />
            )
          ) : (
            <div className="empty-card">尚未创建任何配对。</div>
          )}
        </section>
      </div>
    </>
  );
}

function ReportPanel({ report }: { report: BatchReport | null }) {
  if (!report) return null;
  if (report.conflicts.length === 0) {
    return (
      <div className="report report-ok">
        <div className="report-head">
          <CheckCircle2 size={16} />
          <b>批次发布成功</b>
          <span>{new Date(report.at).toLocaleString('zh-CN')} · 共 {report.selected} 套</span>
        </div>
        <ul>
          {report.released?.map((r) => (
            <li key={r.id}>
              <Snowflake size={13} />
              <code>{r.id}</code>
              <span>
                {r.title} · v{r.revision} · {channelLabel(r.channel)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="report report-bad">
      <div className="report-head">
        <FileX2 size={16} />
        <b>整批发布中止 · 草稿保持不变</b>
        <span>
          {new Date(report.at).toLocaleString('zh-CN')} · 选送 {report.selected} 套，{report.conflicts.length} 套存在缺口
        </span>
      </div>
      {report.conflicts.map((c: PairingConflict) => (
        <div key={c.pairingId} className="conflict-block">
          <div className="conflict-title">
            <AlertTriangle size={13} />
            {c.title}
          </div>
          <ul>
            {c.general.map((g, i) => (
              <li key={`g${i}`}>{g}</li>
            ))}
            {c.slotIssues.map((s, i) => (
              <li key={`s${i}`}>
                <em>{slotLabel[s.slot]}</em>
                {s.message}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// 草稿编辑器
// --------------------------------------------------------------------------

function DraftEditor({
  p,
  evalResult,
  licenses,
  fonts,
  onMutate,
  onPickFont,
  onPickLicense,
  onMutateSlot,
  onDelete,
}: {
  p: Pairing;
  evalResult: Evaluation;
  licenses: License[];
  fonts: string[];
  onMutate: (patch: Partial<Pairing>) => void;
  onPickFont: (role: 'heading' | 'body', font: string) => void;
  onPickLicense: (role: 'heading' | 'body', licId: string) => void;
  onMutateSlot: (role: 'heading' | 'body', patch: Partial<LicenseSlot>) => void;
  onDelete: () => void;
}) {
  const clean = isEvaluationClean(evalResult);
  const hLic = licenses.find((l) => l.id === p.heading.licenseId);
  const bLic = licenses.find((l) => l.id === p.body.licenseId);
  const differentLicensor =
    hLic && bLic && hLic.licensor.trim() !== bLic.licensor.trim();

  return (
    <>
      <div className="studio-head">
        <div className="studio-title">
          <span>配对草稿 · 修订 v{p.revision}</span>
          {p.supersedesReleaseId && (
            <small className="rev-line">
              <History size={11} /> 修订自 <code>{p.supersedesReleaseId}</code>
            </small>
          )}
          <input className="title-input" value={p.title} onChange={(e) => onMutate({ title: e.target.value })} />
          <input className="cat-input" value={p.category} onChange={(e) => onMutate({ category: e.target.value })} />
        </div>
        <div className="head-tools">
          <span className={`pill ${clean ? 'st-active' : 'st-expired'}`}>
            {clean ? (
              <>
                <BadgeCheck size={13} /> 校验通过
              </>
            ) : (
              <>
                <AlertTriangle size={13} /> 阻断发布
              </>
            )}
          </span>
          <button className="delete" onClick={onDelete}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="canvas">
        <div className="canvas-bar">
          <span>PREVIEW · 随草稿实时变化（发布时才冻结）</span>
        </div>
        <div className="preview">
          <span className="preview-kicker">{p.category.toUpperCase()} · 发布渠道：{p.channel ? channelLabel(p.channel) : '未选择'}</span>
          <h3 style={{ fontFamily: p.heading.font }}>{p.sampleHeading}</h3>
          <p style={{ fontFamily: p.body.font }}>{p.sampleBody}</p>
          <div className="preview-rule" />
          <span className="preview-meta">
            {p.heading.font} / {p.body.font}
          </span>
        </div>
      </div>

      <div className="controls">
        <div className="control-head">
          <div>
            <span>发布渠道</span>
            <h3>这套配对将投放到哪里？</h3>
          </div>
        </div>
        <div className="channel-row">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`channel-btn ${p.channel === c.id ? 'on' : ''}`}
              onClick={() => onMutate({ channel: c.id })}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <SlotEditor
        role="heading"
        slot={p.heading}
        channel={p.channel}
        licenses={licenses}
        fonts={fonts}
        onPickFont={(f) => onPickFont('heading', f)}
        onPickLicense={(id) => onPickLicense('heading', id)}
        onMutateSlot={(patch) => onMutateSlot('heading', patch)}
      />
      <SlotEditor
        role="body"
        slot={p.body}
        channel={p.channel}
        licenses={licenses}
        fonts={fonts}
        onPickFont={(f) => onPickFont('body', f)}
        onPickLicense={(id) => onPickLicense('body', id)}
        onMutateSlot={(patch) => onMutateSlot('body', patch)}
      />

      {differentLicensor && (
        <div className="basis-banner">
          <ShieldQuestion size={16} />
          <div>
            <b>标题与正文来自不同授权主体</b>
            <span>
              {hLic!.licensor} / {bLic!.licensor} —— 两侧必须分别记录授权依据，缺少任何一项都会中止整批发布。
            </span>
          </div>
        </div>
      )}

      <IssueList evalResult={evalResult} />
    </>
  );
}

function SlotEditor({
  role,
  slot,
  channel,
  licenses,
  fonts,
  onPickFont,
  onPickLicense,
  onMutateSlot,
}: {
  role: 'heading' | 'body';
  slot: LicenseSlot;
  channel: ChannelId | '';
  licenses: License[];
  fonts: string[];
  onPickFont: (font: string) => void;
  onPickLicense: (licId: string) => void;
  onMutateSlot: (patch: Partial<LicenseSlot>) => void;
}) {
  const lic = licenses.find((l) => l.id === slot.licenseId);
  const matching = licenses.filter((l) => l.font === slot.font);
  const covered = lic && channel ? lic.channels.includes(channel) : false;

  return (
    <div className="controls slot-editor">
      <div className="control-head">
        <div>
          <span>{slotLabel[role]}字体</span>
          <h3>{role === 'heading' ? 'Heading · 标题字' : 'Body · 正文字'}</h3>
        </div>
        {lic && <StatusPill lic={lic} />}
      </div>

      <div className="font-row">
        <label className="f-label">
          字体
          <select value={fonts.includes(slot.font) ? slot.font : ''} onChange={(e) => onPickFont(e.target.value)}>
            {!fonts.includes(slot.font) && <option value="">{slot.font}（授权库已无此字体）</option>}
            {fonts.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="f-label">
          授权记录
          <select value={slot.licenseId} onChange={(e) => onPickLicense(e.target.value)}>
            <option value="">— 请选择该字体的授权 —</option>
            {matching.map((l) => (
              <option key={l.id} value={l.id}>
                {l.ref}（{l.licensor}）
              </option>
            ))}
          </select>
        </label>
      </div>

      {lic ? (
        <div className="lic-meta">
          <div>
            <span>授权主体</span>
            <b>{lic.licensor}</b>
          </div>
          <div>
            <span>有效期</span>
            <b className={licenseStatus(lic) === 'expired' ? 'danger' : licenseStatus(lic) === 'pending' ? 'warn-txt' : ''}>
              {lic.validFrom} → {lic.validUntil}
            </b>
          </div>
          <div className="lic-channels">
            <span>覆盖渠道</span>
            <ChannelChips
              ids={CHANNELS.map((c) => c.id)}
              dims={CHANNELS.map((c) => c.id).filter((c) => !lic.channels.includes(c))}
            />
          </div>
          {channel && (
            <div className={`cover-line ${covered ? 'cover-yes' : 'cover-no'}`}>
              {covered ? <BadgeCheck size={13} /> : <AlertTriangle size={13} />}
              {covered
                ? `授权覆盖所选渠道「${channelLabel(channel)}」`
                : `授权未覆盖所选渠道「${channelLabel(channel)}」`}
            </div>
          )}
          {lic.note && <p className="lic-note">{lic.note}</p>}
        </div>
      ) : (
        slot.licenseId && (
          <p className="field-error">
            <AlertTriangle size={13} /> 该授权记录已从授权库删除，引用编号：{slot.licenseId}
          </p>
        )
      )}

      <label className="f-label basis-field">
        授权依据（本配对登记）
        <input
          value={slot.basis}
          placeholder="合同 / 许可证编号，或与另一授权主体区分的依据说明"
          onChange={(e) => onMutateSlot({ basis: e.target.value })}
        />
      </label>
    </div>
  );
}

function IssueList({ evalResult }: { evalResult: Evaluation }) {
  const n = evalResult.general.length + evalResult.slotIssues.length;
  if (n === 0) {
    return (
      <div className="issues issues-ok">
        <CheckCircle2 size={15} />
        授权覆盖渠道且在有效期内；如涉及两家授权主体，依据已分别登记。可纳入批次发布。
      </div>
    );
  }
  return (
    <div className="issues issues-bad">
      <div className="issues-head">
        <AlertTriangle size={15} />
        <b>{n} 项阻断 —— 存在缺口时该配对无法通过批次提交</b>
      </div>
      <ul>
        {evalResult.general.map((g, i) => (
          <li key={`g${i}`}>{g}</li>
        ))}
        {evalResult.slotIssues.map((s, i) => (
          <li key={`s${i}`} className={`sev sev-${s.code}`}>
            <em>{slotLabel[s.slot]}</em>
            {s.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --------------------------------------------------------------------------
// 已发布（冻结）面板
// --------------------------------------------------------------------------

function FrozenPanel({
  pairing,
  release,
  licenses,
  onNewRevision,
}: {
  pairing: Pairing;
  release?: Release;
  licenses: License[];
  onNewRevision: () => void;
}) {
  if (!release) {
    return <div className="empty-card">找不到对应的发布快照（{pairing.publishedReleaseId}）。</div>;
  }
  return (
    <>
      <div className="studio-head">
        <div className="studio-title">
          <span className="frozen-tag">
            <Lock size={12} /> 已发布 · 已冻结 v{release.revision}
          </span>
          <h2 className="frozen-title">{release.title}</h2>
          <small className="rev-line">
            <code>{release.id}</code> · {new Date(release.publishedAt).toLocaleString('zh-CN')} · 渠道：
            {channelLabel(release.channel)}
          </small>
        </div>
        <button className="primary" onClick={onNewRevision}>
          <CopyPlus size={15} />
          新建修订 v{release.revision + 1}
        </button>
      </div>

      <div className="canvas frozen-canvas">
        <div className="canvas-bar">
          <span>
            <Snowflake size={10} /> 发布快照预览 · 不可编辑
          </span>
        </div>
        <div className="preview">
          <span className="preview-kicker">FROZEN RELEASE · {channelLabel(release.channel)}</span>
          <h3 style={{ fontFamily: release.slots.find((s) => s.role === 'heading')?.font }}>
            {pairing.sampleHeading}
          </h3>
          <p style={{ fontFamily: release.slots.find((s) => s.role === 'body')?.font }}>{pairing.sampleBody}</p>
          <div className="preview-rule" />
          <span className="preview-meta">{release.slots.map((s) => s.font).join(' / ')}</span>
        </div>
      </div>

      <p className="freeze-note">
        <Snowflake size={14} />
        字体组合与授权信息在发布时整体快照冻结。授权库中的记录即使随后过期、修改或删除，此版本均不随之改变；更换字体或渠道只能
        <b>新建修订</b>。
      </p>

      {release.slots.map((s) => {
        const current = licenses.find((l) => l.id === s.licenseId);
        const nowExpired = current && licenseStatus(current) === 'expired';
        const gone = !current;
        return (
          <div key={s.role} className="controls frozen-slot">
            <div className="control-head">
              <div>
                <span>{slotLabel[s.role]}字体 · 快照</span>
                <h3>
                  {s.font}
                </h3>
              </div>
              <span className={`pill ${todayISO() <= s.validUntil ? 'st-active' : 'st-expired'}`}>
                快照有效期至 {s.validUntil}
              </span>
            </div>
            <div className="snap-grid">
              <div>
                <span>授权主体</span>
                <b>{s.licensor}</b>
              </div>
              <div>
                <span>授权编号</span>
                <b>{s.ref}</b>
              </div>
              <div>
                <span>登记依据</span>
                <b>{s.basis}</b>
              </div>
              <div>
                <span>快照渠道</span>
                <ChannelChips ids={s.channels} />
              </div>
            </div>
            {(gone || nowExpired) && (
              <div className="drift-note">
                <History size={13} />
                {gone
                  ? '授权库现状：该授权记录已删除 —— 不影响本冻结版本。'
                  : '授权库现状：该授权现已过期 —— 不改变本版本发布当时的快照；如需继续投放请新建修订并选择有效授权。'}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// --------------------------------------------------------------------------
// 发布台账
// --------------------------------------------------------------------------

function ReleasesView({
  header,
  releases,
  pairings,
  drafts,
  onNewRevision,
}: {
  header: React.ReactNode;
  releases: Release[];
  pairings: Pairing[];
  drafts: Pairing[];
  onNewRevision: (p: Pairing) => void;
}) {
  const byRoot = new Map<number, Release[]>();
  [...releases]
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .forEach((r) => {
      const list = byRoot.get(r.rootId) ?? [];
      list.push(r);
      byRoot.set(r.rootId, list);
    });
  const groups = Array.from(byRoot.values()).sort((a, b) => (a[0].publishedAt < b[0].publishedAt ? 1 : -1));

  return (
    <>
      {header}
      <div className="ledger">
        {groups.length === 0 && <div className="empty-card">尚无发布版本。</div>}
        {groups.map((chain) => {
          const latest = chain[0];
          const frozenPair = pairings.find((p) => p.id === latest.pairingId) ?? pairings.find((p) => p.rootId === latest.rootId);
          const pendingRevision = drafts.find((d) => d.rootId === latest.rootId);
          return (
            <div key={latest.rootId} className="chain">
              <div className="chain-head">
                <div>
                  <b>{latest.title}</b>
                  <span>
                    配对血脉 #{latest.rootId} · 共 {chain.length} 个发布版本
                  </span>
                </div>
                {frozenPair && (
                  <button className="outline" onClick={() => onNewRevision(frozenPair)}>
                    <CopyPlus size={14} />
                    基于 v{latest.revision} 新建修订
                  </button>
                )}
              </div>
              {pendingRevision && (
                <div className="pending-rev">
                  <Pencil size={13} />
                  修订 v{pendingRevision.revision} 正在草稿中（修订自 {pendingRevision.supersedesReleaseId}），尚未发布。
                </div>
              )}
              {chain.map((r) => (
                <div key={r.id} className={`release-card ${r.id === latest.id ? 'is-latest' : ''}`}>
                  <div className="release-left">
                    <Snowflake size={16} />
                    <div>
                      <b>
                        v{r.revision} · {r.id}
                      </b>
                      <span>
                        {new Date(r.publishedAt).toLocaleString('zh-CN')} · {channelLabel(r.channel)}
                        {r.supersedesReleaseId && <> · 取代 <code>{r.supersedesReleaseId}</code></>}
                      </span>
                    </div>
                  </div>
                  <div className="release-slots">
                    {r.slots.map((s) => (
                      <div key={s.role} className="release-slot">
                        <em>{slotLabel[s.role]}</em>
                        <b>{s.font}</b>
                        <span>
                          {s.licensor} · {s.ref}
                        </span>
                        <small>依据：{s.basis}</small>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

// --------------------------------------------------------------------------
// 授权字体库
// --------------------------------------------------------------------------

function LicensesView({
  header,
  licenses,
  drafts,
  onEdit,
  onDelete,
}: {
  header: React.ReactNode;
  licenses: License[];
  drafts: Pairing[];
  onEdit: (l: License) => void;
  onDelete: (l: License) => void;
}) {
  return (
    <>
      {header}
      <div className="lic-grid">
        {licenses.map((l) => {
          const refs = drafts.filter((d) => d.heading.licenseId === l.id || d.body.licenseId === l.id);
          return (
            <div key={l.id} className={`lic-card lic-${licenseStatus(l)}`}>
              <div className="lic-card-head">
                <Type size={15} />
                <b>{l.font}</b>
                <StatusPill lic={l} />
              </div>
              <div className="lic-card-body">
                <div>
                  <span>授权主体</span>
                  <b>{l.licensor}</b>
                </div>
                <div>
                  <span>授权编号</span>
                  <b>{l.ref}</b>
                </div>
                <div>
                  <span>有效期</span>
                  <b>
                    {l.validFrom} → {l.validUntil}
                  </b>
                </div>
                <div>
                  <span>覆盖渠道</span>
                  <ChannelChips ids={l.channels} />
                </div>
                {l.note && <p className="lic-note">{l.note}</p>}
                {refs.length > 0 && (
                  <small className="lic-refs">被 {refs.length} 套草稿引用：{refs.map((r) => r.title).join('、')}</small>
                )}
              </div>
              <div className="lic-card-foot">
                <button className="outline" onClick={() => onEdit(l)}>
                  <Pencil size={13} /> 编辑
                </button>
                <button className="delete" onClick={() => onDelete(l)}>
                  <Trash2 size={13} /> 删除
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function LicenseForm({ initial, onClose, onSave }: { initial: License | null; onClose: () => void; onSave: (l: License) => void }) {
  const [font, setFont] = useState(initial?.font ?? '');
  const [licensor, setLicensor] = useState(initial?.licensor ?? '');
  const [ref, setRef] = useState(initial?.ref ?? '');
  const [channels, setChannels] = useState<ChannelId[]>(initial?.channels ?? ['web']);
  const [validFrom, setValidFrom] = useState(initial?.validFrom ?? todayISO());
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? todayISO());
  const [note, setNote] = useState(initial?.note ?? '');

  const toggle = (c: ChannelId) =>
    setChannels((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));

  const valid = font.trim() && licensor.trim() && ref.trim() && channels.length > 0 && validFrom && validUntil;

  const submit = () => {
    if (!valid) return;
    onSave({
      id: initial?.id ?? `lic-${Date.now()}`,
      font: font.trim(),
      licensor: licensor.trim(),
      ref: ref.trim(),
      channels,
      validFrom,
      validUntil,
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal title={initial ? `编辑授权 · ${initial.font}` : '新增字体授权'} onClose={onClose} wide>
      <div className="form-grid">
        <label className="f-label">
          字体名称
          <input value={font} onChange={(e) => setFont(e.target.value)} placeholder="例如：Fraunces" />
        </label>
        <label className="f-label">
          授权主体
          <input value={licensor} onChange={(e) => setLicensor(e.target.value)} placeholder="例如：Google Fonts（SIL OFL）" />
        </label>
        <label className="f-label">
          授权编号 / 依据
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="例如：OFL-1.1-Fraunces" />
        </label>
        <div className="f-label">
          覆盖渠道
          <div className="channel-row">
            {CHANNELS.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`channel-btn ${channels.includes(c.id) ? 'on' : ''}`}
                onClick={() => toggle(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <label className="f-label">
          生效日
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </label>
        <label className="f-label">
          到期日
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </label>
        <label className="f-label form-wide">
          备注
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" />
        </label>
      </div>
      <div className="modal-actions">
        <button className="outline" onClick={onClose}>
          取消
        </button>
        <button className="primary" disabled={!valid} onClick={submit}>
          保存授权
        </button>
      </div>
    </Modal>
  );
}

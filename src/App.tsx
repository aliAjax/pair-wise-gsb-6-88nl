import {useEffect,useState} from 'react';
import {AlertTriangle,Check,ChevronDown,Download,Grid3X3,History,Lock,Plus,Send,Settings2,ShieldCheck,Snowflake,Trash2,Type,X} from 'lucide-react';

// ---------- 领域模型 ----------
type Channel='web'|'print'|'app'|'social';
type License={id:string;licensor:string;basis:string;fonts:string[];channels:Channel[];expiresAt:string};
type Draft={revision:number;headingFont:string;bodyFont:string;channel:Channel;headingLicenseId:string|null;bodyLicenseId:string|null;locked:boolean};
type Pairing={id:number;title:string;heading:string;body:string;draft:Draft};
type Release={id:string;pairingId:number;pairingTitle:string;revision:number;headingFont:string;bodyFont:string;channel:Channel;headingLicense:License;bodyLicense:License;publishedAt:string};
type ConflictItem={pairingId:number;title:string;issues:string[]};
type Batch={id:string;at:string;status:'published'|'aborted';pairingIds:number[];releaseIds:string[];conflicts:ConflictItem[]};

const FONTS=['Fraunces','DM Sans','Space Grotesk','Newsreader','IBM Plex Sans','Playfair Display'];
const CHANNELS:{id:Channel;label:string}[]=[{id:'web',label:'网站'},{id:'print',label:'印刷'},{id:'app',label:'移动应用'},{id:'social',label:'社交媒体'}];
const channelLabel=(c:Channel)=>CHANNELS.find(x=>x.id===c)?.label||c;
const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>Math.random().toString(36).slice(2,10);
const fmtTime=(iso:string)=>{const d=new Date(iso);const p=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`};
function load<T>(key:string,fallback:T):T{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback}catch{return fallback}}

const seedLicenses:License[]=[
  {id:'lic-ofl',licensor:'Google Fonts',basis:'OFL-1.1 开源字体许可',fonts:['Fraunces','DM Sans','Space Grotesk'],channels:['web','print','app','social'],expiresAt:'2099-12-31'},
  {id:'lic-adobe',licensor:'Adobe Fonts',basis:'订阅协议 AF-2026-0188',fonts:['Newsreader','Playfair Display'],channels:['web','social'],expiresAt:'2026-12-31'},
  {id:'lic-mono',licensor:'Monotype',basis:'企业合同 MT-2025-4471',fonts:['IBM Plex Sans'],channels:['web','print'],expiresAt:'2026-06-30'},
  {id:'lic-pp',licensor:'Pangram Pangram',basis:'',fonts:['Playfair Display'],channels:['web','print','app','social'],expiresAt:'2027-03-01'},
];
const seedPairings:Pairing[]=[
  {id:1,title:'Editorial calm',heading:'A slower way to see',body:'Good typography creates space for ideas to breathe. Pair a confident display face with a quiet, generous text face.',draft:{revision:1,headingFont:'Fraunces',bodyFont:'DM Sans',channel:'web',headingLicenseId:'lic-ofl',bodyLicenseId:'lic-ofl',locked:false}},
  {id:2,title:'Studio notes',heading:'Make room for the unexpected',body:'A thoughtful pairing can add rhythm to even the simplest interface. Try contrast in shape, not just size.',draft:{revision:1,headingFont:'Playfair Display',bodyFont:'IBM Plex Sans',channel:'web',headingLicenseId:'lic-adobe',bodyLicenseId:'lic-mono',locked:false}},
  {id:3,title:'Field guide',heading:'Small details, lasting impressions',body:'Typography is the voice of a page. Find a combination that feels clear, warm and distinctly yours.',draft:{revision:1,headingFont:'Newsreader',bodyFont:'Fraunces',channel:'print',headingLicenseId:'lic-adobe',bodyLicenseId:'lic-ofl',locked:false}},
  {id:4,title:'Launch page',heading:'Ship the quiet launch',body:'Every release note deserves a voice. Keep the headline sharp and the copy easy to scan.',draft:{revision:1,headingFont:'Space Grotesk',bodyFont:'Playfair Display',channel:'app',headingLicenseId:'lic-ofl',bodyLicenseId:'lic-pp',locked:false}},
];

// ---------- 授权校验 ----------
export function draftChecks(d:Draft,lics:License[]){
  const hl=lics.find(l=>l.id===d.headingLicenseId);
  const bl=lics.find(l=>l.id===d.bodyLicenseId);
  const t=today();
  const side=(label:string,lic:License|undefined,font:string)=>[
    {ok:!!lic,text:`${label}授权依据已记录`},
    {ok:!!lic&&lic.fonts.includes(font),text:`${label}授权涵盖字体 ${font}`},
    {ok:!!lic&&lic.channels.includes(d.channel),text:`${label}授权覆盖渠道「${channelLabel(d.channel)}」`},
    {ok:!!lic&&lic.expiresAt>=t,text:`${label}授权在有效期内${lic?`（至 ${lic.expiresAt}）`:''}`},
    {ok:!!lic&&lic.basis.trim().length>0,text:`${label}授权依据编号完整`},
  ];
  const rows=[...side('标题',hl,d.headingFont),...side('正文',bl,d.bodyFont)];
  if(hl&&bl&&hl.licensor!==bl.licensor)
    rows.push({ok:true,text:`标题与正文分属不同授权主体（${hl.licensor} / ${bl.licensor}），已分别记录授权依据`});
  return rows;
}
export const validateDraft=(d:Draft,lics:License[])=>draftChecks(d,lics).filter(c=>!c.ok).map(c=>c.text);
export const __seeds={seedLicenses,seedPairings};

export default function App(){
  const [licenses,setLicenses]=useState<License[]>(()=>load('fd.licenses',seedLicenses));
  const [pairings,setPairings]=useState<Pairing[]>(()=>load('fd.pairings',seedPairings));
  const [releases,setReleases]=useState<Release[]>(()=>load<Release[]>('fd.releases',[]));
  const [batches,setBatches]=useState<Batch[]>(()=>load<Batch[]>('fd.batches',[]));
  const [selectedId,setSelectedId]=useState<number>(()=>load('fd.pairings',seedPairings)[0]?.id??0);
  const [checked,setChecked]=useState<number[]>([]);
  const [showAdd,setShowAdd]=useState(false);
  const [showLic,setShowLic]=useState(false);
  const [newTitle,setNewTitle]=useState('');
  const [lf,setLf]=useState<{licensor:string;basis:string;expiresAt:string;fonts:string[];channels:Channel[]}>({licensor:'',basis:'',expiresAt:'',fonts:[],channels:[]});

  useEffect(()=>{localStorage.setItem('fd.licenses',JSON.stringify(licenses))},[licenses]);
  useEffect(()=>{localStorage.setItem('fd.pairings',JSON.stringify(pairings))},[pairings]);
  useEffect(()=>{localStorage.setItem('fd.releases',JSON.stringify(releases))},[releases]);
  useEffect(()=>{localStorage.setItem('fd.batches',JSON.stringify(batches))},[batches]);

  const current=pairings.find(p=>p.id===selectedId)||pairings[0];
  const firstLic=(font:string)=>licenses.find(l=>l.fonts.includes(font))?.id??null;
  const submittable=pairings.filter(p=>!p.draft.locked).map(p=>p.id);
  const checkedIds=checked.filter(id=>submittable.includes(id));
  const statusOf=(p:Pairing):'locked'|'ready'|'conflict'=>p.draft.locked?'locked':(validateDraft(p.draft,licenses).length?'conflict':'ready');

  // ---------- 行为 ----------
  const patchDraft=(id:number,patch:Partial<Draft>)=>setPairings(ps=>ps.map(p=>p.id===id&&!p.draft.locked?{...p,draft:{...p.draft,...patch}}:p));
  const setFont=(side:'heading'|'body',font:string)=>{
    if(!current)return;
    const licId=firstLic(font);
    patchDraft(current.id,side==='heading'?{headingFont:font,headingLicenseId:licId}:{bodyFont:font,bodyLicenseId:licId});
  };
  const toggleCheck=(id:number)=>setChecked(cs=>cs.includes(id)?cs.filter(c=>c!==id):[...cs,id]);
  const toggleAll=()=>setChecked(cs=>cs.length===submittable.length?[]:submittable);

  // 整批发布：逐套校验，任一冲突则整批中止，草稿保持不变
  const publish=(ids:number[])=>{
    const targets=pairings.filter(p=>ids.includes(p.id)&&!p.draft.locked);
    if(!targets.length)return;
    const conflicts:ConflictItem[]=targets
      .map(p=>({pairingId:p.id,title:p.title,issues:validateDraft(p.draft,licenses)}))
      .filter(c=>c.issues.length>0);
    const batch:Batch={id:uid(),at:new Date().toISOString(),status:conflicts.length?'aborted':'published',pairingIds:targets.map(t=>t.id),releaseIds:[],conflicts};
    if(conflicts.length){setBatches(bs=>[batch,...bs].slice(0,30));return}
    const now=new Date().toISOString();
    const newReleases:Release[]=targets.map(p=>{
      const hl=licenses.find(l=>l.id===p.draft.headingLicenseId)!;
      const bl=licenses.find(l=>l.id===p.draft.bodyLicenseId)!;
      return {id:uid(),pairingId:p.id,pairingTitle:p.title,revision:p.draft.revision,headingFont:p.draft.headingFont,bodyFont:p.draft.bodyFont,channel:p.draft.channel,headingLicense:{...hl},bodyLicense:{...bl},publishedAt:now};
    });
    batch.releaseIds=newReleases.map(r=>r.id);
    setReleases(rs=>[...rs,...newReleases]);
    setPairings(ps=>ps.map(p=>targets.some(t=>t.id===p.id)?{...p,draft:{...p.draft,locked:true}}:p));
    setBatches(bs=>[batch,...bs].slice(0,30));
    setChecked(cs=>cs.filter(c=>!targets.some(t=>t.id===c)));
  };
  const newRevision=(id:number)=>setPairings(ps=>ps.map(p=>p.id===id?{...p,draft:{...p.draft,revision:p.draft.revision+1,locked:false}}:p));
  const removePairing=(id:number)=>{
    setPairings(ps=>ps.filter(p=>p.id!==id));
    setChecked(cs=>cs.filter(c=>c!==id));
    if(selectedId===id)setSelectedId(pairings.find(p=>p.id!==id)?.id??0);
  };
  const createPairing=()=>{
    if(!newTitle.trim())return;
    const id=Date.now();
    setPairings(ps=>[...ps,{id,title:newTitle.trim(),heading:'Your new headline',body:'Start with a sentence that lets your type pairing show its character.',draft:{revision:1,headingFont:'Fraunces',bodyFont:'DM Sans',channel:'web',headingLicenseId:firstLic('Fraunces'),bodyLicenseId:firstLic('DM Sans'),locked:false}}]);
    setSelectedId(id);setNewTitle('');setShowAdd(false);
  };
  const licFormOk=lf.licensor.trim().length>0&&lf.expiresAt.length>0&&lf.fonts.length>0&&lf.channels.length>0;
  const addLicense=()=>{
    if(!licFormOk)return;
    setLicenses(ls=>[...ls,{id:uid(),licensor:lf.licensor.trim(),basis:lf.basis.trim(),fonts:lf.fonts,channels:lf.channels,expiresAt:lf.expiresAt}]);
    setLf({licensor:'',basis:'',expiresAt:'',fonts:[],channels:[]});setShowLic(false);
  };
  const removeLicense=(id:string)=>{
    if(pairings.some(p=>p.draft.headingLicenseId===id||p.draft.bodyLicenseId===id))return;
    setLicenses(ls=>ls.filter(l=>l.id!==id));
  };
  const exportCss=()=>{
    if(!current)return;
    const d=current.draft;
    const css=`/* ${current.title} · R${d.revision} · ${channelLabel(d.channel)} */\n.heading { font-family: '${d.headingFont}'; }\n.body { font-family: '${d.bodyFont}'; }`;
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([css],{type:'text/css'}));
    a.download='type-pair.css';a.click();URL.revokeObjectURL(a.href);
  };

  // ---------- 渲染辅助 ----------
  const badge=(p:Pairing)=>{
    const s=statusOf(p);
    if(s==='locked')return <span className="tag t-lock"><Lock size={10}/>已发布 R{p.draft.revision}</span>;
    if(s==='ready')return <span className="tag t-ok">可发布</span>;
    return <span className="tag t-err">冲突 {validateDraft(p.draft,licenses).length}</span>;
  };
  const licOptions=(font:string,selected:string|null)=>{
    const opts=licenses.filter(l=>l.fonts.includes(font));
    const cur=licenses.find(l=>l.id===selected);
    return cur&&!opts.includes(cur)?[cur,...opts]:opts;
  };

  const d=current?.draft;
  const hl=d?licenses.find(l=>l.id===d.headingLicenseId):undefined;
  const bl=d?licenses.find(l=>l.id===d.bodyLicenseId):undefined;
  const checks=d?draftChecks(d,licenses):[];
  const pairReleases=current?releases.filter(r=>r.pairingId===current.id).sort((a,b)=>b.revision-a.revision):[];

  return <div className="app">
    <aside>
      <div className="brand"><div className="brand-mark"><Type size={18}/></div><div><b>字体审批台</b><small>LICENSE &amp; RELEASE</small></div></div>
      <div className="nav-section">
        <span>审批台 DESK</span>
        <button className="nav active"><Grid3X3 size={16}/>全部配对 <b>{pairings.length}</b></button>
        <button className="nav"><ShieldCheck size={16}/>已发布版本 <b>{releases.length}</b></button>
        <button className="nav"><AlertTriangle size={16}/>冲突批次 <b>{batches.filter(b=>b.status==='aborted').length}</b></button>
      </div>
      <div className="saved">
        <div className="saved-head"><span>授权主体 LICENSES</span><button onClick={()=>setShowLic(true)}><Plus size={14}/></button></div>
        {licenses.map(l=>{
          const expired=l.expiresAt<today();
          const used=pairings.some(p=>p.draft.headingLicenseId===l.id||p.draft.bodyLicenseId===l.id);
          return <div className="lic" key={l.id}>
            <div className="lic-top"><b>{l.licensor}</b>{expired?<em className="tag t-err">已过期</em>:<em className="tag t-ok">至 {l.expiresAt}</em>}</div>
            <small>{l.fonts.join(' · ')}</small>
            <small>{l.channels.map(channelLabel).join(' / ')} · {l.basis||'无依据编号'}</small>
            <button className="lic-del" disabled={used} title={used?'有草稿引用，不可删除':'删除授权'} onClick={()=>removeLicense(l.id)}><X size={12}/></button>
          </div>;
        })}
      </div>
      <div className="aside-foot">
        <button className="nav"><Settings2 size={16}/>Preferences</button>
        <div className="profile"><div className="avatar">YL</div><div><b>Yuki Lin</b><small>Design workspace</small></div><ChevronDown size={14}/></div>
      </div>
    </aside>

    <main>
      <header>
        <div>
          <div className="crumb">TYPE LIBRARY / <b>授权与发布审批台</b></div>
          <h1>先授权，再发布。</h1>
          <p>每套配对记录标题字体、正文字体与发布渠道；授权覆盖渠道且未过期才可提交，任一冲突即整批中止。</p>
        </div>
        <div className="actions">
          <button className="outline" onClick={exportCss}><Download size={15}/>导出 CSS</button>
          <button className="outline" onClick={()=>setShowAdd(true)}><Plus size={16}/>新建配对</button>
          <button className="primary" disabled={!checkedIds.length} onClick={()=>publish(checkedIds)}><Send size={15}/>提交发布{checkedIds.length?`（${checkedIds.length}）`:''}</button>
        </div>
      </header>

      <div className="layout">
        <section className="gallery">
          <div className="gallery-head">
            <div><h2>配对草稿</h2><span>{pairings.length} 套 · {submittable.length} 套待发布</span></div>
            <label className="pick-all"><input type="checkbox" checked={submittable.length>0&&checkedIds.length===submittable.length} onChange={toggleAll}/>全选待发布</label>
          </div>
          <div className="pair-list">
            {pairings.map(p=>
              <button key={p.id} className={selectedId===p.id?'pair selected':'pair'} onClick={()=>setSelectedId(p.id)}>
                <div className="pair-top">
                  <label className="pick" onClick={e=>e.stopPropagation()}>
                    <input type="checkbox" checked={checkedIds.includes(p.id)} disabled={p.draft.locked} onChange={()=>toggleCheck(p.id)}/>R{p.draft.revision}
                  </label>
                  {badge(p)}
                </div>
                <strong style={{fontFamily:p.draft.headingFont}}>{p.heading}</strong>
                <p style={{fontFamily:p.draft.bodyFont}}>{p.body}</p>
                <div className="pair-foot"><span>{p.title}</span><small>{p.draft.headingFont} / {p.draft.bodyFont} · {channelLabel(p.draft.channel)}</small></div>
              </button>
            )}
            {!pairings.length&&<div className="empty">暂无配对，点击「新建配对」开始。</div>}
          </div>
        </section>

        {current&&d?<section className="studio">
          <div className="studio-head">
            <div><span>PAIRING DOSSIER · R{d.revision}</span><h2>{current.title}</h2></div>
            {badge(current)}
          </div>
          {d.locked&&<div className="locked-bar">
            <Lock size={14}/>
            <div>此版本已发布并冻结，字体组合与授权快照不可更改。如需换字，请新建修订。</div>
            <button className="mini" onClick={()=>newRevision(current.id)}>新建修订 R{d.revision+1}</button>
          </div>}
          <div className="canvas">
            <div className="canvas-bar"><span>PREVIEW · R{d.revision}</span><div><button>{channelLabel(d.channel)}</button></div></div>
            <div className="preview">
              <span className="preview-kicker">A NOTE ON TYPE</span>
              <h3 style={{fontFamily:d.headingFont}}>{current.heading}</h3>
              <p style={{fontFamily:d.bodyFont}}>{current.body}</p>
              <div className="preview-rule"/>
              <span className="preview-meta">R{d.revision} · {channelLabel(d.channel)} · {hl?hl.licensor:'未记录授权'}</span>
            </div>
          </div>
          <div className="controls">
            <div className="control-head"><div><span>RELEASE CONFIG</span><h3>发布配置与授权依据</h3></div><ShieldCheck size={17}/></div>
            <div className="font-row">
              <label>标题字体
                <select disabled={d.locked} value={d.headingFont} onChange={e=>setFont('heading',e.target.value)}>{FONTS.map(f=><option key={f}>{f}</option>)}</select>
              </label>
              <label>正文字体
                <select disabled={d.locked} value={d.bodyFont} onChange={e=>setFont('body',e.target.value)}>{FONTS.map(f=><option key={f}>{f}</option>)}</select>
              </label>
            </div>
            <div className="chan-row">
              <span>发布渠道</span>
              <div className="seg">{CHANNELS.map(c=><button key={c.id} disabled={d.locked} className={d.channel===c.id?'on':''} onClick={()=>patchDraft(current.id,{channel:c.id})}>{c.label}</button>)}</div>
            </div>
            <div className="font-row">
              <label>标题授权依据
                <select disabled={d.locked} value={d.headingLicenseId??''} onChange={e=>patchDraft(current.id,{headingLicenseId:e.target.value||null})}>
                  <option value="">未记录</option>
                  {licOptions(d.headingFont,d.headingLicenseId).map(l=><option key={l.id} value={l.id}>{l.licensor} · {l.basis||'无编号'} · 至 {l.expiresAt}</option>)}
                </select>
              </label>
              <label>正文授权依据
                <select disabled={d.locked} value={d.bodyLicenseId??''} onChange={e=>patchDraft(current.id,{bodyLicenseId:e.target.value||null})}>
                  <option value="">未记录</option>
                  {licOptions(d.bodyFont,d.bodyLicenseId).map(l=><option key={l.id} value={l.id}>{l.licensor} · {l.basis||'无编号'} · 至 {l.expiresAt}</option>)}
                </select>
              </label>
            </div>
            {hl&&bl&&hl.licensor!==bl.licensor&&<div className="notice">标题与正文分属不同授权主体（{hl.licensor} / {bl.licensor}），已分别记录授权依据，缺一不可。</div>}
            <div className="checklist">
              {checks.map((c,i)=><div key={i} className={c.ok?'ok':'bad'}>{c.ok?<Check size={12}/>:<X size={12}/>}<span>{c.text}</span></div>)}
            </div>
          </div>
          <div className="studio-foot">
            <button className="delete" onClick={()=>removePairing(current.id)}><Trash2 size={15}/>删除配对</button>
            <button className="primary" disabled={d.locked} onClick={()=>publish([current.id])}><Send size={14}/>提交发布</button>
          </div>
          <div className="releases">
            <div className="rel-head"><span>RELEASES</span><h3>发布版本（冻结快照）</h3></div>
            {!pairReleases.length&&<div className="empty">尚未发布。提交成功后，字体组合与授权快照将冻结在此。</div>}
            {pairReleases.map(r=>
              <div className="rel" key={r.id}>
                <div className="rel-top"><b>R{r.revision}</b><span className="tag t-lock"><Snowflake size={10}/>已冻结</span><span className="tag">{channelLabel(r.channel)}</span><time>{fmtTime(r.publishedAt)}</time></div>
                <div className="rel-fonts"><span style={{fontFamily:r.headingFont}}>{r.headingFont}</span><i>×</i><span style={{fontFamily:r.bodyFont}}>{r.bodyFont}</span></div>
                <div className="rel-lics">
                  <small>标题 · {r.headingLicense.licensor} · {r.headingLicense.basis||'无编号'} · 至 {r.headingLicense.expiresAt}</small>
                  <small>正文 · {r.bodyLicense.licensor} · {r.bodyLicense.basis||'无编号'} · 至 {r.bodyLicense.expiresAt}</small>
                </div>
              </div>
            )}
          </div>
        </section>:<section className="studio"><div className="empty">暂无配对，点击「新建配对」开始。</div></section>}
      </div>

      <section className="batches">
        <div className="batches-head"><div><span>AUDIT TRAIL</span><h2><History size={18}/>发布批次与冲突明细</h2></div><span>{batches.length} 批次</span></div>
        {!batches.length&&<div className="empty">暂无发布记录。勾选草稿后点击「提交发布」；如有冲突，整批中止并在此留痕。</div>}
        {batches.map(b=>
          <div className={`batch ${b.status}`} key={b.id}>
            <div className="batch-top">
              {b.status==='published'?<ShieldCheck size={15}/>:<AlertTriangle size={15}/>}
              <b>{b.status==='published'?'已发布':'已中止'}</b>
              <span>{fmtTime(b.at)}</span>
              <span>{b.pairingIds.length} 套配对</span>
              {b.status==='aborted'&&<span className="tag t-err">草稿保持不变</span>}
            </div>
            {b.status==='aborted'&&<div className="batch-issues">
              {b.conflicts.map(c=><div key={c.pairingId}><b>{c.title}</b><ul>{c.issues.map((iss,i)=><li key={i}>{iss}</li>)}</ul></div>)}
            </div>}
            {b.status==='published'&&<div className="batch-rels">
              {b.releaseIds.map(id=>{const r=releases.find(x=>x.id===id);return r?<span className="tag t-lock" key={id}><Snowflake size={10}/>R{r.revision} · {r.pairingTitle}</span>:null})}
            </div>}
          </div>
        )}
      </section>
    </main>

    {showAdd&&<div className="backdrop" onClick={()=>setShowAdd(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <h2>新建配对</h2>
      <label>配对名称<input autoFocus value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="e.g. Quiet confidence"/></label>
      <div className="modal-actions"><button className="outline" onClick={()=>setShowAdd(false)}>取消</button><button className="primary" onClick={createPairing}>创建配对</button></div>
    </div></div>}

    {showLic&&<div className="backdrop" onClick={()=>setShowLic(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <h2>新增授权主体</h2>
      <label>授权主体<input autoFocus value={lf.licensor} onChange={e=>setLf(s=>({...s,licensor:e.target.value}))} placeholder="e.g. Monotype / Adobe Fonts"/></label>
      <label>授权依据编号<input value={lf.basis} onChange={e=>setLf(s=>({...s,basis:e.target.value}))} placeholder="合同号 / 协议号，如 MT-2026-118"/></label>
      <label>有效期至<input type="date" value={lf.expiresAt} onChange={e=>setLf(s=>({...s,expiresAt:e.target.value}))}/></label>
      <div className="check-group"><span>覆盖字体</span><div className="checks">{FONTS.map(f=><label key={f}><input type="checkbox" checked={lf.fonts.includes(f)} onChange={()=>setLf(s=>({...s,fonts:s.fonts.includes(f)?s.fonts.filter(x=>x!==f):[...s.fonts,f]}))}/>{f}</label>)}</div></div>
      <div className="check-group"><span>覆盖渠道</span><div className="checks">{CHANNELS.map(c=><label key={c.id}><input type="checkbox" checked={lf.channels.includes(c.id)} onChange={()=>setLf(s=>({...s,channels:s.channels.includes(c.id)?s.channels.filter(x=>x!==c.id):[...s.channels,c.id]}))}/>{c.label}</label>)}</div></div>
      <div className="modal-actions"><button className="outline" onClick={()=>setShowLic(false)}>取消</button><button className="primary" disabled={!licFormOk} onClick={addLicense}>保存授权</button></div>
    </div></div>}
  </div>;
}

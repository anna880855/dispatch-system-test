import { useState } from 'react';
import { useApp } from '../AppContext';
import { today, daysBetween } from '../utils/helpers';
import { Card, PageHeader, BtnSmall, BtnPrimary, BtnSecondary, Badge, Input, Alert, C } from '../components/UI';

export default function Dashboard({ setPage }) {
  const { currentUser, cases, masterCases, updateMasterCase } = useApp();
  const t = today();
  const myCases = currentUser?.role === 'admin' ? cases : cases.filter(c => c.managerId === currentUser?.id);
  const trackable = myCases.filter(c => c.status !== '不承接');
  const withoutEntry = trackable.filter(c => !c.entryDate);
  const overdue = withoutEntry.filter(c => daysBetween(c.referralDate, t) > 5);
  const pending = withoutEntry.filter(c => daysBetween(c.referralDate, t) <= 5);
  const completed = trackable.filter(c => c.entryDate);
  const monthCases = myCases.filter(c => c.referralDate?.startsWith(t.slice(0, 7)));
  const recent = [...myCases].sort((a, b) => b.referralDate?.localeCompare(a.referralDate)).slice(0, 10);

  const myMasterCases = Object.values(masterCases || {}).filter(ex =>
    !ex.closeDate &&
    (currentUser?.role === 'admin' || ex.managerId === currentUser?.id)
  );

  const noPlanDate = myMasterCases.filter(ex => !ex.planDate);
  const noApproval = myMasterCases.filter(ex => !ex.approvalDate);
  const needsCloseInfo = Object.values(masterCases || {}).filter(ex =>
    ex.needsCloseInfo && !ex.closeReason &&
    (currentUser?.role === 'admin' || ex.managerId === currentUser?.id)
  );

  const stats = [
    { label: '本月派案', val: monthCases.length, color: C.accent, bg: C.accentL, icon: '📋', link: false },
    { label: '進行中（5天內）', val: pending.length, color: C.warning, bg: C.warningL, icon: '⏳', link: true },
    { label: '逾期未填進場', val: overdue.length, color: C.alert, bg: C.alertL, icon: '⚠️', link: true },
    { label: '已完成進場', val: completed.length, color: C.success, bg: C.successL, icon: '✅', link: false },
  ];

  // ── 通過日期補填 Modal ─────────────────────────────────────────────
  const [approvalModal, setApprovalModal] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  function openApprovalModal() {
    const init = {};
    noApproval.forEach(ex => { init[ex.key] = ''; });
    setDrafts(init);
    setSaveMsg(null);
    setApprovalModal(true);
  }

  async function saveApprovals() {
    const toSave = noApproval.filter(ex => drafts[ex.key]);
    if (toSave.length === 0) {
      setSaveMsg({ type: 'warn', text: '尚未填寫任何通過日期' });
      return;
    }
    setSaving(true);
    try {
      for (const ex of toSave) {
        await updateMasterCase(ex.key, { approvalDate: drafts[ex.key] });
      }
      setSaveMsg({ type: 'success', text: `✓ 已更新 ${toSave.length} 筆通過日期` });
      setTimeout(() => { setApprovalModal(false); setSaveMsg(null); }, 1500);
    } catch (e) {
      setSaveMsg({ type: 'error', text: `儲存失敗：${e.message}` });
    }
    setSaving(false);
  }

  return (
    <div>
      <PageHeader title="總覽" subtitle={`今日：${t}`} />

      {noPlanDate.length > 0 && (
        <div style={{ background: C.accentL, border: `1px solid ${C.accent}44`, borderRadius: 14, padding: '14px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 22 }}>📅</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.accent, fontWeight: 600, fontSize: 14 }}>有 {noPlanDate.length} 筆個案尚未填寫計畫日期</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              {noPlanDate.slice(0, 3).map(ex => ex.clientName).join('、')}{noPlanDate.length > 3 ? `…等 ${noPlanDate.length} 人` : ''}
            </div>
          </div>
          <BtnSmall onClick={() => setPage('masterList')} style={{ background: C.accent, color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>前往個案總表</BtnSmall>
        </div>
      )}

      {noApproval.length > 0 && (
        <div style={{ background: C.warningL, border: '1px solid #e8d5a0', borderRadius: 14, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 22 }}>📋</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.warning, fontWeight: 600, fontSize: 14 }}>有 {noApproval.length} 筆個案尚未填寫通過日期</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              {noApproval.slice(0, 3).map(ex => ex.clientName).join('、')}{noApproval.length > 3 ? `…等 ${noApproval.length} 人` : ''}
            </div>
          </div>
          <BtnSmall onClick={openApprovalModal} style={{ background: C.warning, color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>前往填寫</BtnSmall>
        </div>
      )}

      {needsCloseInfo.length > 0 && (
        <div style={{ background: C.alertL, border: '1px solid #e0a090', borderRadius: 14, padding: '14px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 22 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.alert, fontWeight: 600, fontSize: 14 }}>有 {needsCloseInfo.length} 筆個案已自動結案，尚未填寫結案資訊</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              {needsCloseInfo.slice(0, 3).map(ex => ex.clientName).join('、')}{needsCloseInfo.length > 3 ? `…等 ${needsCloseInfo.length} 人` : ''}
            </div>
          </div>
          <BtnSmall onClick={() => setPage('masterList')} style={{ background: C.alert, color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>前往填寫結案</BtnSmall>
        </div>
      )}

      {overdue.length > 0 && (
        <div style={{ background: C.alertL, border: '1px solid #e0a090', borderRadius: 14, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.alert, fontWeight: 600, fontSize: 14 }}>有 {overdue.length} 筆案件照會超過5天未填寫進場日期</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>請盡快前往「進場時效」頁面處理</div>
          </div>
          <BtnSmall onClick={() => setPage('entry')} style={{ background: C.alert, color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>立即處理</BtnSmall>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
        {stats.map(s => (
          <div
            key={s.label}
            onClick={s.link ? () => setPage('entry') : undefined}
            style={{ background: s.bg, borderRadius: 18, padding: '22px 20px', border: `1px solid ${C.border}`, cursor: s.link ? 'pointer' : 'default', transition: s.link ? 'transform 0.1s' : '' }}
            onMouseEnter={s.link ? e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; } : undefined}
            onMouseLeave={s.link ? e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; } : undefined}
          >
            <div style={{ fontSize: 26, marginBottom: 10 }}>{s.icon}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{s.label}{s.link && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>→</span>}</div>
          </div>
        ))}
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>最近派案紀錄</h3>
          <BtnSmall onClick={() => setPage('cases')}>查看全部</BtnSmall>
        </div>
        {recent.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '28px 0' }}>尚無派案紀錄</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>{['照會日', '個案姓名', '碼別', '派案單位', '進場日', '狀態'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 14px', color: C.muted, fontWeight: 500, borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {recent.map(c => {
                  const days = c.entryDate ? daysBetween(c.referralDate, c.entryDate) : daysBetween(c.referralDate, t);
                  const od = !c.entryDate && days > 5 && c.status !== '不承接';
                  return (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}`, background: od ? `${C.alertL}60` : '' }}>
                      <td style={{ padding: '10px 14px' }}>{c.referralDate}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>{c.clientName}</td>
                      <td style={{ padding: '10px 14px' }}><Badge>{c.codeType}</Badge></td>
                      <td style={{ padding: '10px 14px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.unit}</td>
                      <td style={{ padding: '10px 14px' }}>{c.entryDate || <span style={{ color: od ? C.alert : C.warning }}>未填入</span>}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {c.status === '不承接' ? <span style={{ color: C.muted }}>不承接</span>
                          : c.entryDate ? <span style={{ color: C.success }}>✓ 已進場</span>
                          : <span style={{ color: od ? C.alert : C.warning }}>{od ? `⚠️ 逾期 ${days} 天` : `第 ${days} 天`}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── 通過日期補填 Modal ── */}
      {approvalModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(60,50,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }} onClick={e => { if (e.target === e.currentTarget) setApprovalModal(false); }}>
          <div style={{
            background: C.card, borderRadius: 22, padding: 32,
            maxWidth: 560, width: '92%', maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          }} onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>填寫通過日期</h3>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>共 {noApproval.length} 筆待填寫，填寫後同步更新個案總表</div>
              </div>
              <button onClick={() => setApprovalModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.muted, lineHeight: 1 }}>✕</button>
            </div>

            {saveMsg && <div style={{ marginBottom: 16 }}><Alert type={saveMsg.type}>{saveMsg.text}</Alert></div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {/* 欄位標頭 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, padding: '0 4px' }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>個案姓名</div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>通過日期</div>
              </div>

              {noApproval.map(ex => (
                <div key={ex.key} style={{
                  display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, alignItems: 'center',
                  padding: '10px 14px', borderRadius: 10,
                  background: drafts[ex.key] ? C.successL || '#edf3ee' : C.bg,
                  border: `1px solid ${drafts[ex.key] ? C.success + '60' : C.border}`,
                  transition: 'background 0.2s',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{ex.clientName}</div>
                    {ex.caseNumber && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>案號：{ex.caseNumber}</div>}
                  </div>
                  <Input
                    type="date"
                    value={drafts[ex.key] || ''}
                    onChange={e => setDrafts(d => ({ ...d, [ex.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <BtnPrimary onClick={saveApprovals} disabled={saving} style={{ flex: 1 }}>
                {saving ? '儲存中…' : '儲存通過日期'}
              </BtnPrimary>
              <BtnSecondary onClick={() => setApprovalModal(false)}>取消</BtnSecondary>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

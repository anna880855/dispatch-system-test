import { useState } from 'react';
import { useApp } from '../AppContext';
import { today } from '../utils/helpers';
import { Card, PageHeader, BtnSmall, Badge, Input, Alert, C } from '../components/UI';

function minutesBetween(dt1, dt2) {
  if (!dt1 || !dt2) return null;
  const d1 = new Date(dt1);
  const d2 = new Date(dt2);
  return Math.round((d2 - d1) / 60000);
}

function formatDuration(minutes) {
  if (minutes === null || isNaN(minutes)) return '—';
  if (minutes < 0) return '時間有誤';
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}天${h}小時${m}分`;
  if (h > 0) return `${h}小時${m}分`;
  return `${m}分`;
}

function nowDatetime() {
  const n = new Date();
  const pad = v => String(v).padStart(2, '0');
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`;
}

const EMPTY_FORM = {
  receiveDate: today(),
  planDraftDatetime: '',
  planSubmitDatetime: '',
  planCompleteDatetime: '',
  hasReturn: false,
  returnDatetime: '',
};

function PlanForm({ c, onSave, onCancel }) {
  const [form, setForm] = useState({
    receiveDate: c.receiveDate || today(),
    planDraftDatetime: c.planDraftDatetime || '',
    planSubmitDatetime: c.planSubmitDatetime || '',
    planCompleteDatetime: c.planCompleteDatetime || '',
    hasReturn: c.hasReturn || false,
    returnDatetime: c.returnDatetime || '',
  });
  const [msg, setMsg] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.receiveDate) { setMsg({ type: 'error', text: '請填寫接案日' }); return; }
    await onSave(form);
  }

  const labelStyle = { fontSize: 12, color: C.muted, whiteSpace: 'nowrap', minWidth: 76 };
  const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' };

  return (
    <div style={{ marginTop: 14, padding: 16, background: C.bg, borderRadius: 12 }}>
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}

      <div style={rowStyle}>
        <label style={labelStyle}>接案日：</label>
        <Input type="date" value={form.receiveDate} onChange={e => set('receiveDate', e.target.value)} style={{ width: 160 }} />
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>計畫擬定：</label>
        <Input type="datetime-local" value={form.planDraftDatetime} onChange={e => set('planDraftDatetime', e.target.value)} style={{ width: 200 }} />
        <BtnSmall onClick={() => set('planDraftDatetime', nowDatetime())} style={{ fontSize: 11 }}>現在</BtnSmall>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>計劃送出：</label>
        <Input type="datetime-local" value={form.planSubmitDatetime} onChange={e => set('planSubmitDatetime', e.target.value)} style={{ width: 200 }} />
        <BtnSmall onClick={() => set('planSubmitDatetime', nowDatetime())} style={{ fontSize: 11 }}>現在</BtnSmall>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>計劃完成：</label>
        <Input type="datetime-local" value={form.planCompleteDatetime} onChange={e => set('planCompleteDatetime', e.target.value)} style={{ width: 200 }} />
        <BtnSmall onClick={() => set('planCompleteDatetime', nowDatetime())} style={{ fontSize: 11 }}>現在</BtnSmall>
      </div>

      <div style={{ ...rowStyle, marginTop: 4 }}>
        <label style={labelStyle}>退件：</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.hasReturn} onChange={e => set('hasReturn', e.target.checked)} style={{ width: 15, height: 15 }} />
          有退件
        </label>
        {form.hasReturn && (
          <>
            <Input type="datetime-local" value={form.returnDatetime} onChange={e => set('returnDatetime', e.target.value)} style={{ width: 200 }} />
            <BtnSmall onClick={() => set('returnDatetime', nowDatetime())} style={{ fontSize: 11 }}>現在</BtnSmall>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <BtnSmall onClick={handleSave} style={{ background: C.success, color: '#fff', border: 'none' }}>確認儲存</BtnSmall>
        <BtnSmall onClick={onCancel}>取消</BtnSmall>
      </div>
    </div>
  );
}

function TimelineRow({ label, value, prev, color }) {
  const mins = minutesBetween(prev, value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 13 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color || C.accent, flexShrink: 0 }} />
      <span style={{ color: C.muted, minWidth: 68 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value ? value.replace('T', ' ') : '—'}</span>
      {mins !== null && <span style={{ color: C.muted, fontSize: 11 }}>（距上一步：{formatDuration(mins)}）</span>}
    </div>
  );
}

export default function PlanTimeline() {
  const { currentUser, cases, updateCase, syncPlanToSheets } = useApp();
  const [editing, setEditing] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const myCases = currentUser?.role === 'admin'
    ? cases
    : cases.filter(c => c.managerId === currentUser?.id);

  const pending = myCases
    .filter(c => c.status !== '不承接' && !c.planCompleteDatetime)
    .sort((a, b) => (a.referralDate || '').localeCompare(b.referralDate || ''));

  const completed = myCases
    .filter(c => c.planCompleteDatetime)
    .sort((a, b) => (b.planCompleteDatetime || '').localeCompare(a.planCompleteDatetime || ''));

  async function handleSave(caseId, form) {
    await updateCase(caseId, form);
    const c = cases.find(x => x.id === caseId);
    if (c) syncPlanToSheets({ ...c, ...form });
    setEditing(null);
  }

  function stepsDone(c) {
    let n = 0;
    if (c.receiveDate) n++;
    if (c.planDraftDatetime) n++;
    if (c.planSubmitDatetime) n++;
    if (c.planCompleteDatetime) n++;
    return n;
  }

  return (
    <div>
      <PageHeader title="計劃時效管理" subtitle={`待完成：${pending.length} 筆`} />

      {pending.length === 0 && (
        <div style={{ background: C.successL, borderRadius: 16, padding: 32, textAlign: 'center', marginBottom: 24, border: '1px solid #b3d4b7' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ color: C.success, fontWeight: 600, fontSize: 15 }}>所有案件均已完成計劃！</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
        {pending.map(c => {
          const done = stepsDone(c);
          const isEditing = editing === c.id;
          return (
            <div key={c.id} style={{ background: C.card, borderRadius: 16, padding: '16px 22px', border: `1px solid ${C.border}`, display: 'flex', alignItems: isEditing ? 'flex-start' : 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: C.warningL, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.warning, lineHeight: 1 }}>{done}/4</div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>步驟</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{c.clientName}</span>
                  <Badge>{c.codeType}</Badge>
                  {c.hasReturn && <span style={{ background: C.alertL, color: C.alert, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>退件</span>}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                  照會日：{c.referralDate}　｜　{c.region}　｜　{c.unit || '—'}
                </div>
                {!isEditing && done > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {c.receiveDate && <TimelineRow label="接案日" value={c.receiveDate} color="#7a9e7e" />}
                    {c.planDraftDatetime && <TimelineRow label="計畫擬定" value={c.planDraftDatetime} prev={c.receiveDate ? c.receiveDate + 'T00:00' : null} color="#c4a55a" />}
                    {c.planSubmitDatetime && <TimelineRow label="計劃送出" value={c.planSubmitDatetime} prev={c.planDraftDatetime} color="#6a9fc0" />}
                    {c.hasReturn && c.returnDatetime && <TimelineRow label="退件" value={c.returnDatetime} prev={c.planSubmitDatetime} color={C.alert} />}
                  </div>
                )}
                {isEditing && (
                  <PlanForm
                    c={c}
                    onSave={form => handleSave(c.id, form)}
                    onCancel={() => setEditing(null)}
                  />
                )}
              </div>
              {!isEditing && (
                <BtnSmall onClick={() => setEditing(c.id)} style={{ background: C.accent, color: '#fff', border: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  填寫時效
                </BtnSmall>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={() => setShowDone(v => !v)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13, marginBottom: 12, fontFamily: 'inherit' }}>
        {showDone ? '▲' : '▼'} 已完成計劃紀錄（{completed.length} 筆）
      </button>

      {showDone && completed.length > 0 && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: C.bg }}>
                <tr>{['個案姓名', '碼別', '接案日', '計畫擬定', '計劃送出', '計劃完成', '退件', '總時效'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: C.muted, fontWeight: 500, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {completed.map((c, i) => {
                  const totalMins = minutesBetween(
                    c.receiveDate ? c.receiveDate + 'T00:00' : null,
                    c.planCompleteDatetime
                  );
                  return (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 1 ? `${C.bg}50` : '' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>{c.clientName}</td>
                      <td style={{ padding: '10px 14px' }}><Badge>{c.codeType}</Badge></td>
                      <td style={{ padding: '10px 14px' }}>{c.receiveDate || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{c.planDraftDatetime ? c.planDraftDatetime.replace('T', ' ') : '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{c.planSubmitDatetime ? c.planSubmitDatetime.replace('T', ' ') : '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{c.planCompleteDatetime ? c.planCompleteDatetime.replace('T', ' ') : '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {c.hasReturn
                          ? <span style={{ color: C.alert, fontWeight: 500 }}>是{c.returnDatetime ? `（${c.returnDatetime.replace('T', ' ')}）` : ''}</span>
                          : <span style={{ color: C.muted }}>否</span>
                        }
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ color: C.success, fontWeight: 500 }}>{formatDuration(totalMins)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

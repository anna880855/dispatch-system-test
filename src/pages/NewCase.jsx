import { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import { today, ROTATING_CODES, REJECT_REASONS, REFERRAL_REASONS, REGIONS } from '../utils/helpers';
import { Card, PageHeader, FormField, Input, Select, BtnPrimary, BtnSecondary, Alert, C, MultiSelect } from '../components/UI';

const DA01_BATCH = 3;
const CODE_TYPES = ['BA', 'BB', 'BC', 'CA', 'CB', 'CC', 'CD', 'DA01'];

function initForm() {
  return {
    clientName: '', idNumber: '', address: '', region: '', managerId: '',
    caseNumber: '', acceptDate: '',
    planDate: '', approvalDate: '',
    referralDate: today(), caseType: '初評', dispatchType: '新案',
    codeEntries: [], status: '承接', rejectReason: '', rejectReasonOther: '',
  };
}

const SectionHeader = ({ title, color }) => (
  <div style={{ fontSize: 14, fontWeight: 600, color, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
    {title}
  </div>
);

export default function NewCase({ setPage }) {
  const { units, users, addCase, advanceRotation, getCurrentRotUnit, addMasterCase, updateMasterCase, deleteMasterCase, masterCases, autoGenerateNumber, advanceNumberConfig, currentUser } = useApp();
  const [form, setForm] = useState(initForm);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const isManager = currentUser?.role === 'manager';
  const managers = users.filter(u => u.role === 'manager');

  useEffect(() => {
    if (isManager && currentUser?.region) {
      setForm(f => ({ ...f, region: currentUser.region, managerId: currentUser.id }));
    }
  }, [isManager, currentUser]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function toggleCode(code) {
    setForm(f => {
      const exists = f.codeEntries.find(e => e.codeType === code);
      if (exists) return { ...f, codeEntries: f.codeEntries.filter(e => e.codeType !== code) };
      return { ...f, codeEntries: [...f.codeEntries, { codeType: code, isRotating: false, unit: '', units: [], referralReason: '', referralReasonOther: '' }] };
    });
  }

  function updateEntry(codeType, updates) {
    setForm(f => ({ ...f, codeEntries: f.codeEntries.map(e => e.codeType === codeType ? { ...e, ...updates } : e) }));
  }

  function getUnitList(codeType, isRotating) {
    const region = form.region;
    if (!codeType || !region) return [];
    if (isRotating && ROTATING_CODES.includes(codeType)) return units.rotating?.[region]?.[codeType] || [];
    return units.nonRotating?.[codeType] || [];
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const idNumber = form.idNumber.trim();
      const key = idNumber || `${form.clientName.trim()}|${form.caseNumber || ''}`;
      const autoNumber = form.region ? autoGenerateNumber(form.region) : '';

      // 若身分證字號與現有在案個案相符，自動結案舊資料
      if (idNumber) {
        const existing = Object.entries(masterCases || {}).filter(([, ex]) =>
          ex.idNumber === idNumber && !ex.closeDate
        );
        for (const [oldKey, oldData] of existing) {
          const archiveKey = `${oldKey}_closed_${Date.now()}`;
          await addMasterCase(archiveKey, { ...oldData, key: archiveKey, closeDate: today(), needsCloseInfo: true });
          await deleteMasterCase(oldKey);
        }
      }

      // 1. 建立個案總表資料
      const masterEntry = {
        clientName: form.clientName.trim(), idNumber: form.idNumber.trim(), address: form.address.trim(),
        region: form.region, managerId: form.managerId, caseNumber: form.caseNumber, acceptDate: form.acceptDate,
        planDate: form.planDate, approvalDate: form.approvalDate,
        isDirectEntry: true, createdAt: today(), autoNumber,
      };
      await addMasterCase(key, masterEntry);
      if (form.region) await advanceNumberConfig(form.region);

      // 2. 建立派案紀錄（若有選碼別）
      if (form.codeEntries.length > 0) {
        let finalReject = form.rejectReason;
        if (finalReject === '其他' && form.rejectReasonOther) finalReject = `其他：${form.rejectReasonOther}`;
        const dispatchedUnits = {};

        for (const entry of form.codeEntries) {
          const unitList = getUnitList(entry.codeType, entry.isRotating);
          const rotInfo = entry.isRotating && form.region ? getCurrentRotUnit(form.region, entry.codeType) : null;
          const isDA01Rotating = entry.codeType === 'DA01' && entry.isRotating;
          const rotUnits = rotInfo && unitList.length
            ? isDA01Rotating ? Array.from({ length: DA01_BATCH }, (_, i) => unitList[(rotInfo.index + i) % unitList.length]) : [rotInfo.unit]
            : [];
          const unitsList = entry.isRotating ? rotUnits.filter(Boolean) : (entry.units.length > 0 ? entry.units : entry.unit ? [entry.unit] : []);
          dispatchedUnits[entry.codeType] = unitsList;
          let finalReferral = entry.referralReason;
          if (finalReferral === '其他' && entry.referralReasonOther) finalReferral = `其他：${entry.referralReasonOther}`;

          for (const u of unitsList) {
            await addCase({
              masterKey: key, clientName: form.clientName.trim(), managerId: form.managerId, region: form.region,
              referralDate: form.referralDate, evalType: form.caseType, caseType: form.dispatchType, codeType: entry.codeType,
              isRotating: entry.isRotating, unit: u, status: form.status,
              referralReason: finalReferral, rejectReason: finalReject,
            });
          }
          if (entry.isRotating && ROTATING_CODES.includes(entry.codeType)) {
            await advanceRotation(form.region, entry.codeType, isDA01Rotating ? DA01_BATCH : 1);
          }
        }

        // 初評/複評時寫回派案單位
        if (['初評', '複評'].includes(form.caseType)) {
          const newLastUnits = {};
          for (const [codeType, unitsList] of Object.entries(dispatchedUnits)) {
            if (unitsList.length > 0) newLastUnits[codeType] = codeType === 'DA01' ? unitsList.join('、') : unitsList[0];
          }
          await updateMasterCase(key, { lastUnits: newLastUnits });
        }
      }

      setMsg({ type: 'success', text: '✓ 個案已建立並寫入總表！' });
      setTimeout(() => { setForm(initForm()); setPage('masterList'); }, 1500);
    } catch (e) {
      setMsg({ type: 'error', text: `儲存失敗：${e.message}` });
    }
    setSaving(false);
  }

  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' };
  const allRejectReasons = [...new Set(form.codeEntries.flatMap(e => REJECT_REASONS[e.codeType] || []))];

  return (
    <div>
      <PageHeader title="新增個案" subtitle="建立新個案並同步寫入個案總表" />

      {msg && <div style={{ marginBottom: 16 }}><Alert type={msg.type}>{msg.text}</Alert></div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>

        {/* ── 一、個案基本資料 ── */}
        <Card>
          <SectionHeader title="個案基本資料" color={C.primary} />
          <div style={grid2}>
            <FormField label="個案姓名">
              <Input value={form.clientName} onChange={e => set('clientName', e.target.value)} placeholder="請輸入姓名" />
            </FormField>
            <FormField label="身分證字號">
              <Input value={form.idNumber} onChange={e => set('idNumber', e.target.value.toUpperCase())} placeholder="A123456789" maxLength={10} style={{ textTransform: 'uppercase' }} />
            </FormField>
            <FormField label="地址" fullWidth>
              <Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="請輸入完整地址" />
            </FormField>
            <FormField label="案號">
              <Input value={form.caseNumber} onChange={e => set('caseNumber', e.target.value)} placeholder="請輸入案號" />
            </FormField>
            <FormField label="接案日期">
              <Input type="date" value={form.acceptDate} onChange={e => set('acceptDate', e.target.value)} />
            </FormField>
            <FormField label="服務區域">
              {isManager ? (
                <div style={{ padding: '9px 12px', background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13 }}>
                  {currentUser.region}區（已自動帶入）
                </div>
              ) : (
                <Select value={form.region} onChange={e => set('region', e.target.value)}>
                  <option value="">請選擇</option>
                  {REGIONS.map(r => <option key={r}>{r}</option>)}
                </Select>
              )}
            </FormField>
            {currentUser?.role === 'admin' && (
              <FormField label="負責個管">
                <Select value={form.managerId} onChange={e => set('managerId', e.target.value)}>
                  <option value="">請選擇</option>
                  {managers.map(u => <option key={u.id} value={u.id}>{u.name}（{u.region || '—'}區）</option>)}
                </Select>
              </FormField>
            )}
          </div>
        </Card>

        {/* ── 二、計畫資料 ── */}
        <Card>
          <SectionHeader title="計畫資料（選填）" color={C.accent} />
          <div style={grid2}>
            <FormField label="計畫日期">
              <Input type="date" value={form.planDate} onChange={e => set('planDate', e.target.value)} />
            </FormField>
            <FormField label="通過日期">
              <Input type="date" value={form.approvalDate} onChange={e => set('approvalDate', e.target.value)} />
            </FormField>
          </div>
        </Card>

        {/* ── 三、派案資料 ── */}
        <Card>
          <SectionHeader title="派案資料（選填）" color={C.accent} />

          <div style={grid2}>
            <FormField label="照會日（派案日）">
              <Input type="date" value={form.referralDate} onChange={e => set('referralDate', e.target.value)} />
            </FormField>
            <FormField label="評估類型">
              <div style={{ display: 'flex', gap: 20, paddingTop: 10 }}>
                {['初評', '複評'].map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" checked={form.caseType === v} onChange={() => set('caseType', v)} />
                    {v}
                  </label>
                ))}
              </div>
            </FormField>
            <FormField label="案別">
              <div style={{ display: 'flex', gap: 20, paddingTop: 10 }}>
                {['新案', '舊案'].map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" checked={form.dispatchType === v} onChange={() => set('dispatchType', v)} />
                    {v}
                  </label>
                ))}
              </div>
            </FormField>
            <FormField label="服務碼別（可多選）" fullWidth>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CODE_TYPES.map(code => {
                  const selected = form.codeEntries.some(e => e.codeType === code);
                  return (
                    <button key={code} type="button" onClick={() => toggleCode(code)} style={{ padding: '7px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, border: `1.5px solid ${selected ? C.primary : C.border}`, background: selected ? C.primaryL : C.card, color: selected ? C.primaryH : C.text, fontWeight: selected ? 600 : 400, fontFamily: 'inherit', transition: 'all 0.15s' }}>
                      {code}{ROTATING_CODES.includes(code) ? ' ⟳' : ''}
                    </button>
                  );
                })}
              </div>
            </FormField>
          </div>

          {form.codeEntries.map(entry => {
            const isRotCode = ROTATING_CODES.includes(entry.codeType);
            const unitList = getUnitList(entry.codeType, entry.isRotating);
            const rotInfo = entry.isRotating && form.region ? getCurrentRotUnit(form.region, entry.codeType) : null;
            const isDA01Rotating = entry.codeType === 'DA01' && entry.isRotating;
            const rotUnits = rotInfo && unitList.length
              ? isDA01Rotating ? Array.from({ length: DA01_BATCH }, (_, i) => unitList[(rotInfo.index + i) % unitList.length]) : [rotInfo.unit]
              : [];
            return (
              <div key={entry.codeType} style={{ marginTop: 16, padding: '16px 18px', borderRadius: 12, border: `1.5px solid ${C.primary}44`, background: C.bg }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.primaryH, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ background: C.primaryL, padding: '2px 10px', borderRadius: 8 }}>{entry.codeType}</span>
                  {isRotCode && <span style={{ fontSize: 11, color: C.muted }}>可輪派</span>}
                </div>
                <div style={grid2}>
                  {isRotCode && (
                    <FormField label="派案方式">
                      <div style={{ display: 'flex', gap: 20, paddingTop: 10 }}>
                        {[{ v: false, l: '非輪派（指定）' }, { v: true, l: '輪派' }].map(opt => (
                          <label key={opt.l} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                            <input type="radio" checked={entry.isRotating === opt.v} onChange={() => {
                              const rot = opt.v && form.region ? getCurrentRotUnit(form.region, entry.codeType) : null;
                              updateEntry(entry.codeType, { isRotating: opt.v, unit: rot ? rot.unit : '', units: [] });
                            }} />
                            {opt.l}
                          </label>
                        ))}
                      </div>
                    </FormField>
                  )}
                  <FormField
                    label={entry.isRotating ? '派案單位' : unitList.length > 0 ? '派案單位（可多選）' : '派案單位'}
                    fullWidth={!isRotCode || entry.isRotating}
                  >
                    {entry.isRotating ? (
                      rotInfo ? (
                        <div style={{ background: C.warningL, borderRadius: 12, padding: '14px 18px', border: '1px solid #e8d5a0' }}>
                          <div style={{ fontWeight: 600, color: C.warning, fontSize: 13, marginBottom: 8 }}>
                            🔄 {isDA01Rotating ? `輪派 第 ${rotInfo.index + 1}～${(rotInfo.index + DA01_BATCH - 1) % rotInfo.total + 1} / ${rotInfo.total} 號（共 ${DA01_BATCH} 間）` : `輪派順序 第 ${rotInfo.index + 1} / ${rotInfo.total} 號`}
                          </div>
                          {isDA01Rotating ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {rotUnits.map((u, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ width: 20, height: 20, borderRadius: 6, background: C.warning + '44', color: C.warning, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                                  <span style={{ fontSize: 13, fontWeight: 500 }}>{u}</span>
                                </div>
                              ))}
                            </div>
                          ) : <div style={{ fontSize: 14, fontWeight: 600 }}>{rotInfo.unit}</div>}
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>儲存後自動推進 {isDA01Rotating ? DA01_BATCH : 1} 間輪派進度</div>
                        </div>
                      ) : <div style={{ color: C.muted, fontSize: 13 }}>⚠️ 尚未設定輪派清單，請至管理後台新增</div>
                    ) : unitList.length > 0 ? (
                      <MultiSelect options={unitList} selected={entry.units} onChange={v => updateEntry(entry.codeType, { units: v })} placeholder="輸入關鍵字篩選單位" />
                    ) : (
                      <Input value={entry.unit} onChange={e => updateEntry(entry.codeType, { unit: e.target.value })} placeholder={form.region ? '可至管理後台設定單位，或直接輸入' : '請先選擇服務區域'} />
                    )}
                  </FormField>
                  {!entry.isRotating && isRotCode && (
                    <FormField label="派案原因" fullWidth>
                      <Select value={entry.referralReason} onChange={e => updateEntry(entry.codeType, { referralReason: e.target.value, referralReasonOther: '' })}>
                        <option value="">請選擇派案原因</option>
                        {REFERRAL_REASONS.map(o => <option key={o}>{o}</option>)}
                      </Select>
                      {entry.referralReason === '其他' && (
                        <Input style={{ marginTop: 8 }} value={entry.referralReasonOther} onChange={e => updateEntry(entry.codeType, { referralReasonOther: e.target.value })} placeholder="請說明原因" />
                      )}
                    </FormField>
                  )}
                </div>
              </div>
            );
          })}

          {form.codeEntries.length > 0 && (
            <div style={{ ...grid2, marginTop: 20 }}>
              <FormField label="承接狀態">
                <Select value={form.status} onChange={e => { set('status', e.target.value); set('rejectReason', ''); set('rejectReasonOther', ''); }}>
                  <option>承接</option><option>不承接</option>
                </Select>
              </FormField>
              {form.status === '不承接' && (
                <FormField label="不承接原因">
                  <Select value={form.rejectReason} onChange={e => { set('rejectReason', e.target.value); set('rejectReasonOther', ''); }}>
                    <option value="">請選擇</option>
                    {(allRejectReasons.length > 0 ? allRejectReasons : REJECT_REASONS.BA).map(o => <option key={o}>{o}</option>)}
                  </Select>
                  {form.rejectReason === '其他' && (
                    <Input style={{ marginTop: 8 }} value={form.rejectReasonOther} onChange={e => set('rejectReasonOther', e.target.value)} placeholder="請說明原因" />
                  )}
                </FormField>
              )}
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', gap: 12 }}>
          <BtnPrimary style={{ flex: 1 }} onClick={handleSubmit} disabled={saving}>
            {saving ? '儲存中…' : '儲存個案'}
          </BtnPrimary>
          <BtnSecondary onClick={() => setPage('masterList')}>取消</BtnSecondary>
        </div>
      </div>
    </div>
  );
}

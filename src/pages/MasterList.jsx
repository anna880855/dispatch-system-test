import { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../AppContext';
import { today, daysBetween, REGIONS, ROTATING_CODES, REJECT_REASONS, REFERRAL_REASONS } from '../utils/helpers';
import { Card, PageHeader, Input, Select, BtnSmall, BtnPrimary, BtnSecondary, Badge, Alert, C, MultiSelect } from '../components/UI';
import { fbSet, fbUpdate, fbGet, fbRemove } from '../utils/firebase';

const CLOSE_REASONS = [
  '入住機構',
  '搬離原行政區或外縣市',
  '複評後無符合失能等級',
  '轉換A單位',
  '個案過世',
  '暫無使用意願/服務需求，自行照顧',
  '專員自管',
];


function workdaysBetween(d1, d2) {
  if (!d1 || !d2) return 0;
  const start = new Date(d1); start.setHours(0, 0, 0, 0);
  const end = new Date(d2);   end.setHours(0, 0, 0, 0);
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function calcIsOverdue(planDate, approvalDate) {
  if (!planDate || !approvalDate) return false;
  return workdaysBetween(planDate, approvalDate) > 4;
}

export default function MasterList({ setPage }) {
  const { currentUser, cases, users, units, masterCases, updateCase, deleteCase, addMasterCase, updateMasterCase, deleteMasterCase, addCase, advanceRotation, getCurrentRotUnit, autoGenerateNumber, advanceNumberConfig } = useApp();

  const [filter, setFilter] = useState({
    region: '',
    manager: '',
    search: '',
    closed: '',
    overdue: '',
  });

  const [editingKey, setEditingKey] = useState(null);
  const editingKeyRef = useRef(null);
  useEffect(() => { editingKeyRef.current = editingKey; }, [editingKey]);
  const [extras, setExtras] = useState({});
  const [saveMsgs, setSaveMsgs] = useState({});

  // 新增個案 Modal
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState(() => ({
    clientName: '', idNumber: '', address: '',
    region: currentUser?.role === 'manager' ? currentUser.region : '',
    managerId: currentUser?.role === 'manager' ? currentUser.id : '',
    caseNumber: '', acceptDate: '',
  }));
  const [addSaving, setAddSaving] = useState(false);
  const [addMsg, setAddMsg] = useState(null);

  // 派案 Modal
  const [dispatchModal, setDispatchModal] = useState(false);
  const [dispatchPerson, setDispatchPerson] = useState(null);
  const [dispatchForm, setDispatchForm] = useState({ referralDate: today(), caseType: '新案', codeEntries: [], status: '承接', rejectReason: '', rejectReasonOther: '' });
  const [dispatchSaving, setDispatchSaving] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState(null);

  // 評估派案 Modal
  const [planModal, setPlanModal] = useState(false);
  const [planPerson, setPlanPerson] = useState(null);
  const [planForm, setPlanForm] = useState({ planDate: '', approvalDate: '', referralDate: today(), caseType: '複評', dispatchType: '新案', codeEntries: [], status: '承接', rejectReason: '', rejectReasonOther: '' });
  const [planSaving, setPlanSaving] = useState(false);
  const [planMsg, setPlanMsg] = useState(null);

  const isAdmin = currentUser?.role === 'admin';
  const isManager = currentUser?.role === 'manager';
  const managers = users.filter(u => u.role === 'manager');

  const DA01_BATCH = 3;
  const CODE_TYPES_LIST = ['BA', 'BB', 'BC', 'CA', 'CB', 'CC', 'CD', 'DA01'];

  useEffect(() => {
    if (masterCases && Object.keys(masterCases).length > 0) {
      setExtras(prev => {
        const next = { ...masterCases };
        const ek = editingKeyRef.current;
        if (ek && prev[ek]) next[ek] = prev[ek];
        return next;
      });
    } else {
      fbGet('masterCases').then(data => {
        if (data && typeof data === 'object') setExtras(data);
      });
    }
  }, [masterCases]);

  const persons = useMemo(() => {
    return Object.entries(extras)
      .filter(([, ex]) => isAdmin || ex.managerId === currentUser?.id)
      .map(([nodeKey, ex]) => ({ key: nodeKey, info: ex, dispatches: [] }))
      .filter(p => {
        const i = p.info;
        const ex = extras[p.key] || {};
        const isClosed = !!(ex.closeDate || i.isClosed);
        const isOverdue = calcIsOverdue(i.planDate, i.approvalDate);

        if (filter.region && i.region !== filter.region) return false;
        if (isAdmin && filter.manager && i.managerId !== filter.manager) return false;
        if (filter.search) {
          const q = filter.search;
          if (
            !(i.clientName || '').includes(q) &&
            !(i.idNumber || '').includes(q) &&
            !(i.caseNumber || '').includes(q)
          ) return false;
        }
        if (filter.closed === '是' && !isClosed) return false;
        if (filter.closed === '否' && isClosed) return false;
        if (filter.overdue === '是' && !isOverdue) return false;
        return true;
      })
      .sort((a, b) => {
        const na = a.info.autoNumber || a.info.clientName || '';
        const nb = b.info.autoNumber || b.info.clientName || '';
        return na.localeCompare(nb, 'zh-TW');
      });
  }, [extras, filter, isAdmin, currentUser]);

  function cf(k, v) { setFilter(f => ({ ...f, [k]: v })); }
  function clearFilter() {
    setFilter({ region: '', manager: '', search: '', closed: '', overdue: '' });
  }

  function toggleEdit(key) {
    if (editingKey !== key) {
      const person = persons.find(pp => pp.key === key);
      if (person) {
        const i = person.info;
        setExtras(prev => ({
          ...prev,
          [key]: {
            clientName: i.clientName || '',
            idNumber: i.idNumber || '',
            address: i.address || '',
            transferType: i.transferType || '',
            acceptDate: i.acceptDate || '',
            caseNumber: i.caseNumber || '',
            planDate: i.planDate || '',
            approvalDate: i.approvalDate || '',
            managerId: i.managerId || '',
            region: i.region || '',
            ...(prev[key] || {}),
          },
        }));
      }
    }
    setEditingKey(prev => prev === key ? null : key);
    setSaveMsgs(prev => ({ ...prev, [key]: null }));
  }

  function setExtra(key, field, val) {
    setExtras(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: val },
    }));
  }

  async function handleSave(key, p) {
    const ex = extras[key] || {};
    try {
      const masterUpdates = ex.closeReason ? { ...ex, needsCloseInfo: null } : ex;
      await updateMasterCase(key, masterUpdates);
      if (ex.closeDate) {
        const related = cases.filter(c => c.masterKey === key && !c.isClosed);
        for (const c of related) {
          await updateCase(c.id, { isClosed: true, closeDate: ex.closeDate, closeReason: ex.closeReason || '' });
        }
      }
      setSaveMsgs(prev => ({ ...prev, [key]: { type: 'success', text: '已儲存' } }));
      setTimeout(() => setSaveMsgs(prev => ({ ...prev, [key]: null })), 2500);
      setEditingKey(null);
    } catch (e) {
      setSaveMsgs(prev => ({ ...prev, [key]: { type: 'error', text: `儲存失敗：${e.message}` } }));
    }
  }

  async function handleDeletePerson(key, p) {
    const name = p.info.clientName || '此個案';
    if (!window.confirm(`確定要刪除「${name}」的個案資料？此操作無法復原。`)) return;
    try {
      await deleteMasterCase(key);
      setExtras(prev => { const n = { ...prev }; delete n[key]; return n; });
      if (editingKey === key) setEditingKey(null);
    } catch (e) {
      alert(`刪除失敗：${e.message}`);
    }
  }

  function af(k, v) { setAddForm(f => ({ ...f, [k]: v })); }

  function closeAddModal() {
    setAddModal(false);
    setAddMsg(null);
    setAddForm({
      clientName: '', idNumber: '', address: '',
      region: isManager ? currentUser.region : '',
      managerId: isManager ? currentUser.id : '',
      caseNumber: '', acceptDate: '',
    });
  }

  async function handleAddCase() {
    setAddSaving(true);
    try {
      const idNumber = addForm.idNumber.trim();
      const key = idNumber || `${addForm.clientName}|${addForm.caseNumber || ''}`;

      // 若身分證字號與現有在案個案相符，自動結案舊資料
      if (idNumber) {
        const existing = Object.entries(masterCases).filter(([, ex]) =>
          ex.idNumber === idNumber && !ex.closeDate
        );
        for (const [oldKey, oldData] of existing) {
          const archiveKey = `${oldKey}_closed_${Date.now()}`;
          await addMasterCase(archiveKey, { ...oldData, key: archiveKey, closeDate: today(), needsCloseInfo: true });
          await deleteMasterCase(oldKey);
        }
      }

      const autoNumber = addForm.region ? autoGenerateNumber(addForm.region) : '';
      const entry = { ...addForm, key, isDirectEntry: true, createdAt: today(), autoNumber };
      await addMasterCase(key, entry);
      if (addForm.region) await advanceNumberConfig(addForm.region);
      setExtras(prev => ({ ...prev, [key]: entry }));
      closeAddModal();
    } catch (e) {
      setAddMsg({ type: 'error', text: `儲存失敗：${e.message}` });
    }
    setAddSaving(false);
  }

  // 評估派案操作
  function openPlanModal(p) {
    const i = p.info;
    const ex = extras[p.key] || {};
    setPlanForm({
      planDate: ex.planDate || i.planDate || '',
      approvalDate: ex.approvalDate || i.approvalDate || '',
      referralDate: today(),
      caseType: '複評',
      dispatchType: '新案',
      codeEntries: [],
      status: '承接',
      rejectReason: '',
      rejectReasonOther: '',
    });
    setPlanPerson(p);
    setPlanMsg(null);
    setPlanModal(true);
  }

  function closePlanModal() {
    setPlanModal(false);
    setPlanPerson(null);
    setPlanMsg(null);
  }

  function togglePlanCode(code) {
    setPlanForm(f => {
      const exists = f.codeEntries.find(e => e.codeType === code);
      if (exists) return { ...f, codeEntries: f.codeEntries.filter(e => e.codeType !== code) };
      return { ...f, codeEntries: [...f.codeEntries, { codeType: code, isRotating: false, unit: '', units: [], referralReason: '', referralReasonOther: '' }] };
    });
  }

  function updatePlanEntry(codeType, updates) {
    setPlanForm(f => ({ ...f, codeEntries: f.codeEntries.map(e => e.codeType === codeType ? { ...e, ...updates } : e) }));
  }

  function getPlanUnitList(codeType, isRotating) {
    const region = planPerson?.info?.region;
    if (!codeType || !region) return [];
    if (isRotating && ROTATING_CODES.includes(codeType)) return units.rotating?.[region]?.[codeType] || [];
    return units.nonRotating?.[codeType] || [];
  }

  async function handlePlanSubmit() {
    setPlanSaving(true);
    try {
      const key = planPerson.key;
      const region = planPerson.info.region;

      const masterUpdates = { planDate: planForm.planDate, approvalDate: planForm.approvalDate };
      await updateMasterCase(key, masterUpdates);
      setExtras(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...masterUpdates } }));

      let totalSaved = 0;
      if (planForm.codeEntries.length > 0) {
        let finalReject = planForm.rejectReason;
        if (finalReject === '其他' && planForm.rejectReasonOther) finalReject = `其他：${planForm.rejectReasonOther}`;
        const dispatchedUnits = {};

        for (const entry of planForm.codeEntries) {
          const unitList = getPlanUnitList(entry.codeType, entry.isRotating);
          const rotInfo = entry.isRotating && region ? getCurrentRotUnit(region, entry.codeType) : null;
          const isDA01Rotating = entry.codeType === 'DA01' && entry.isRotating;
          const rotUnits = rotInfo && unitList.length ? (isDA01Rotating ? Array.from({ length: DA01_BATCH }, (_, i) => unitList[(rotInfo.index + i) % unitList.length]) : [rotInfo.unit]) : [];
          const unitsList = entry.isRotating ? rotUnits.filter(Boolean) : (entry.units.length > 0 ? entry.units : entry.unit ? [entry.unit] : []);
          dispatchedUnits[entry.codeType] = unitsList;
          let finalReferral = entry.referralReason;
          if (finalReferral === '其他' && entry.referralReasonOther) finalReferral = `其他：${entry.referralReasonOther}`;

          for (const u of unitsList) {
            await addCase({
              masterKey: key,
              clientName: planPerson.info.clientName || '',
              managerId: planPerson.info.managerId || '',
              region,
              referralDate: planForm.referralDate,
              evalType: planForm.caseType,
              caseType: planForm.dispatchType,
              codeType: entry.codeType,
              isRotating: entry.isRotating,
              unit: u,
              status: planForm.status,
              referralReason: finalReferral,
              rejectReason: finalReject,
            });
            totalSaved++;
          }
          if (entry.isRotating && ROTATING_CODES.includes(entry.codeType)) {
            await advanceRotation(region, entry.codeType, isDA01Rotating ? DA01_BATCH : 1);
          }
        }

        const currentLastUnits = extras[key]?.lastUnits || {};
        const newLastUnits = { ...currentLastUnits };
        for (const [codeType, unitsList] of Object.entries(dispatchedUnits)) {
          if (unitsList.length > 0) newLastUnits[codeType] = codeType === 'DA01' ? unitsList.join('、') : unitsList[0];
        }
        await updateMasterCase(key, { lastUnits: newLastUnits });
        setExtras(prev => ({ ...prev, [key]: { ...(prev[key] || {}), lastUnits: newLastUnits } }));
      }

      const dispatchMsg = totalSaved > 0 ? `，已建立 ${totalSaved} 筆派案紀錄` : planForm.codeEntries.length > 0 ? '（警告：未選擇任何派案單位，派案紀錄未建立）' : '';
      setPlanMsg({ type: totalSaved === 0 && planForm.codeEntries.length > 0 ? 'warn' : 'success', text: `✓ 計畫日期已儲存${dispatchMsg}` });
      setTimeout(() => closePlanModal(), 1500);
    } catch (e) {
      setPlanMsg({ type: 'error', text: `儲存失敗：${e.message}` });
    }
    setPlanSaving(false);
  }

  // 派案 Modal 操作
  function handleDispatchPerson(p) {
    const i = p.info;
    setDispatchPerson({ key: p.key, clientName: i.clientName || '', idNumber: i.idNumber || '', region: i.region || '', managerId: i.managerId || '' });
    setDispatchForm({ referralDate: today(), caseType: '新案', codeEntries: [], status: '承接', rejectReason: '', rejectReasonOther: '' });
    setDispatchMsg(null);
    setDispatchModal(true);
  }

  function toggleDispatchCode(code) {
    setDispatchForm(f => {
      const exists = f.codeEntries.find(e => e.codeType === code);
      if (exists) return { ...f, codeEntries: f.codeEntries.filter(e => e.codeType !== code) };
      return { ...f, codeEntries: [...f.codeEntries, { codeType: code, isRotating: false, unit: '', units: [], referralReason: '', referralReasonOther: '' }] };
    });
  }

  function updateDispatchEntry(codeType, updates) {
    setDispatchForm(f => ({ ...f, codeEntries: f.codeEntries.map(e => e.codeType === codeType ? { ...e, ...updates } : e) }));
  }

  function getDispatchUnitList(codeType, isRotating) {
    const region = dispatchPerson?.region;
    if (!codeType || !region) return [];
    if (isRotating && ROTATING_CODES.includes(codeType)) return units.rotating?.[region]?.[codeType] || [];
    return units.nonRotating?.[codeType] || [];
  }

  async function handleDispatchSubmit() {
    setDispatchSaving(true);
    try {
      const mc = dispatchPerson;
      const region = mc.region;
      let finalReject = dispatchForm.rejectReason;
      if (finalReject === '其他' && dispatchForm.rejectReasonOther) finalReject = `其他：${dispatchForm.rejectReasonOther}`;
      let totalSaved = 0;
      const dispatchedUnits = {};
      for (const entry of dispatchForm.codeEntries) {
        const unitList = getDispatchUnitList(entry.codeType, entry.isRotating);
        const rotInfo = entry.isRotating && region ? getCurrentRotUnit(region, entry.codeType) : null;
        const isDA01Rotating = entry.codeType === 'DA01' && entry.isRotating;
        const rotUnits = rotInfo && unitList.length ? (isDA01Rotating ? Array.from({ length: DA01_BATCH }, (_, i) => unitList[(rotInfo.index + i) % unitList.length]) : [rotInfo.unit]) : [];
        const unitsList = entry.isRotating ? rotUnits.filter(Boolean) : (entry.units.length > 0 ? entry.units : entry.unit ? [entry.unit] : []);
        dispatchedUnits[entry.codeType] = unitsList;
        let finalReferral = entry.referralReason;
        if (finalReferral === '其他' && entry.referralReasonOther) finalReferral = `其他：${entry.referralReasonOther}`;
        for (const u of unitsList) {
          await addCase({ masterKey: mc.key, clientName: mc.clientName, managerId: mc.managerId, region: mc.region, referralDate: dispatchForm.referralDate, caseType: dispatchForm.caseType, codeType: entry.codeType, isRotating: entry.isRotating, unit: u, status: dispatchForm.status, referralReason: finalReferral, rejectReason: finalReject });
          totalSaved++;
        }
        if (entry.isRotating && ROTATING_CODES.includes(entry.codeType)) await advanceRotation(region, entry.codeType, isDA01Rotating ? DA01_BATCH : 1);
      }
      setDispatchMsg({ type: 'success', text: `✓ 已建立 ${totalSaved} 筆派案紀錄！` });
      setTimeout(() => { setDispatchModal(false); setDispatchPerson(null); }, 1500);
    } catch (e) {
      setDispatchMsg({ type: 'error', text: `儲存失敗：${e.message}` });
    }
    setDispatchSaving(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <PageHeader title="個案總表" subtitle={`共 ${persons.length} 筆個案`} />
        <BtnPrimary onClick={() => setAddModal(true)} style={{ marginTop: 4, whiteSpace: 'nowrap' }}>
          ＋ 新增個案
        </BtnPrimary>
      </div>

      <div style={{
        background: C.card, borderRadius: 14, padding: '16px 20px',
        marginBottom: 16, border: `1px solid ${C.border}`,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <Input
          value={filter.search}
          onChange={e => cf('search', e.target.value)}
          placeholder="🔍 搜尋姓名／身分證／案號"
          style={{ width: 190 }}
        />
        <Select value={filter.region} onChange={e => cf('region', e.target.value)} style={{ width: 110 }}>
          <option value="">全部區域</option>
          {REGIONS.map(r => <option key={r}>{r}</option>)}
        </Select>
        <Select value={filter.closed} onChange={e => cf('closed', e.target.value)} style={{ width: 110 }}>
          <option value="">全部狀態</option>
          <option value="否">在案中</option>
          <option value="是">已結案</option>
        </Select>
        <Select value={filter.overdue} onChange={e => cf('overdue', e.target.value)} style={{ width: 110 }}>
          <option value="">逾期篩選</option>
          <option value="是">計畫逾期</option>
        </Select>
        {isAdmin && (
          <Select value={filter.manager} onChange={e => cf('manager', e.target.value)} style={{ width: 130 }}>
            <option value="">全部個管</option>
            {managers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )}
        <BtnSecondary onClick={clearFilter}>清除</BtnSecondary>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {persons.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>
            無符合條件的個案
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {['編號', '姓名', '身分證', '案號', '計畫日期', '通過日期', '逾期', '區域', '狀態', ''].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '10px 14px',
                      color: C.muted, fontWeight: 500, fontSize: 12,
                      borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {persons.map(p => {
                  const i = p.info;
                  const ex = extras[p.key] || {};
                  const isClosed = !!(ex.closeDate || i.isClosed);
                  const isOverdue = calcIsOverdue(i.planDate, i.approvalDate);
                  const isEdit = editingKey === p.key;

                  return (
                    <>
                      <tr
                        key={p.key}
                        style={{
                          borderBottom: `1px solid ${C.border}`,
                          opacity: isClosed ? 0.65 : 1,
                          background: isOverdue && !isClosed ? `${C.alertL}40` : '',
                        }}
                      >
                        <td style={{ padding: '10px 14px', fontSize: 11, color: C.muted }}>
                          {i.autoNumber || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 500 }}>{i.clientName}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: C.muted }}>
                          {i.idNumber || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12 }}>{i.caseNumber || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12 }}>{i.planDate || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12 }}>{i.approvalDate || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {isOverdue && !isClosed
                            ? <span style={{ background: C.alertL, color: C.alert, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>逾期</span>
                            : <span style={{ color: C.success, fontSize: 11 }}>正常</span>
                          }
                        </td>
                        <td style={{ padding: '10px 14px' }}>{i.region || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {isClosed
                            ? <span style={{ color: C.muted, fontSize: 11 }}>結案</span>
                            : <span style={{ color: C.success, fontSize: 11 }}>在案</span>
                          }
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <BtnSmall
                              onClick={() => toggleEdit(p.key)}
                              style={isEdit ? { background: C.primary, color: '#fff', border: 'none' } : {}}
                            >
                              {isEdit ? '收起' : '編輯'}
                            </BtnSmall>
                            <BtnSmall
                              onClick={() => openPlanModal(p)}
                              style={{ background: C.accentL, color: C.accent, border: `1px solid ${C.accent}44` }}
                            >
                              評估派案
                            </BtnSmall>
                            <BtnSmall
                              onClick={() => handleDispatchPerson(p)}
                              style={{ background: C.primary, color: '#fff', border: 'none' }}
                            >
                              派案
                            </BtnSmall>
                            <BtnSmall
                              onClick={() => handleDeletePerson(p.key, p)}
                              style={{ background: C.alertL, color: C.alert, border: `1px solid ${C.alert}44` }}
                            >
                              刪除
                            </BtnSmall>
                          </div>
                        </td>
                      </tr>

                      {isEdit && (
                        <tr key={`${p.key}-edit`} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td colSpan={10} style={{ padding: 0, background: C.bg }}>
                            <MasterEditPanel
                              p={p}
                              ex={ex}
                              saveMsg={saveMsgs[p.key]}
                              onSetExtra={(field, val) => setExtra(p.key, field, val)}
                              onSave={() => handleSave(p.key, p)}
                              onCancel={() => toggleEdit(p.key)}
                              regions={REGIONS}
                              managers={managers}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 派案 Modal */}
      {dispatchModal && dispatchPerson && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(60,50,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}
          onClick={e => { if (e.target === e.currentTarget) { setDispatchModal(false); setDispatchPerson(null); } }}>
          <div style={{ background: C.card, borderRadius: 22, padding: 32, maxWidth: 700, width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>派案</h3>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                  {dispatchPerson.clientName}（{dispatchPerson.idNumber || '—'}）｜ {dispatchPerson.region || '—'} 區
                </div>
              </div>
              <button onClick={() => { setDispatchModal(false); setDispatchPerson(null); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.muted, lineHeight: 1 }}>✕</button>
            </div>

            {dispatchMsg && <div style={{ marginBottom: 16 }}><Alert type={dispatchMsg.type}>{dispatchMsg.text}</Alert></div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
              <FormRow label="照會日（派案日）">
                <Input type="date" value={dispatchForm.referralDate} onChange={e => setDispatchForm(f => ({ ...f, referralDate: e.target.value }))} />
              </FormRow>
              <FormRow label="派案類型">
                <div style={{ display: 'flex', gap: 20, paddingTop: 10, flexWrap: 'wrap' }}>
                  {['新案', '舊案'].map(v => (
                    <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input type="radio" checked={dispatchForm.caseType === v} onChange={() => setDispatchForm(f => ({ ...f, caseType: v }))} />
                      {v}
                    </label>
                  ))}
                </div>
              </FormRow>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 500 }}>服務碼別（可多選）</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {CODE_TYPES_LIST.map(code => {
                    const sel = dispatchForm.codeEntries.some(e => e.codeType === code);
                    return (
                      <button key={code} type="button" onClick={() => toggleDispatchCode(code)} style={{ padding: '7px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, border: `1.5px solid ${sel ? C.primary : C.border}`, background: sel ? C.primaryL : C.card, color: sel ? C.primaryH : C.text, fontWeight: sel ? 600 : 400, fontFamily: 'inherit', transition: 'all 0.15s' }}>
                        {code}{ROTATING_CODES.includes(code) ? ' ⟳' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {dispatchForm.codeEntries.map(entry => {
              const isRotCode = ROTATING_CODES.includes(entry.codeType);
              const region = dispatchPerson.region;
              const unitList = getDispatchUnitList(entry.codeType, entry.isRotating);
              const rotInfo = entry.isRotating && region ? getCurrentRotUnit(region, entry.codeType) : null;
              const isDA01R = entry.codeType === 'DA01' && entry.isRotating;
              const rotUnits = rotInfo && unitList.length ? (isDA01R ? Array.from({ length: DA01_BATCH }, (_, i) => unitList[(rotInfo.index + i) % unitList.length]) : [rotInfo.unit]) : [];
              return (
                <div key={entry.codeType} style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${C.primary}44`, background: C.bg }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.primaryH, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: C.primaryL, padding: '2px 10px', borderRadius: 8 }}>{entry.codeType}</span>
                    {isRotCode && <span style={{ fontSize: 11, color: C.muted }}>可輪派</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
                    {isRotCode && (
                      <FormRow label="派案方式">
                        <div style={{ display: 'flex', gap: 20, paddingTop: 10 }}>
                          {[{ v: false, l: '非輪派（指定）' }, { v: true, l: '輪派' }].map(opt => (
                            <label key={opt.l} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                              <input type="radio" checked={entry.isRotating === opt.v} onChange={() => {
                                const rot = opt.v && region ? getCurrentRotUnit(region, entry.codeType) : null;
                                updateDispatchEntry(entry.codeType, { isRotating: opt.v, unit: rot ? rot.unit : '', units: [] });
                              }} />
                              {opt.l}
                            </label>
                          ))}
                        </div>
                      </FormRow>
                    )}
                    <div style={{ gridColumn: (!isRotCode || entry.isRotating) ? '1 / -1' : undefined }}>
                      <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 500 }}>
                        {entry.isRotating ? '派案單位' : unitList.length > 0 ? '派案單位（可多選）' : '派案單位'}
                      </label>
                      {entry.isRotating ? (
                        rotInfo ? (
                          <div style={{ background: C.warningL, borderRadius: 12, padding: '12px 16px', border: '1px solid #e8d5a0' }}>
                            <div style={{ fontWeight: 600, color: C.warning, fontSize: 13, marginBottom: 6 }}>
                              🔄 {isDA01R ? `輪派 第 ${rotInfo.index + 1}～${(rotInfo.index + DA01_BATCH - 1) % rotInfo.total + 1} / ${rotInfo.total} 號（共 ${DA01_BATCH} 間）` : `輪派順序 第 ${rotInfo.index + 1} / ${rotInfo.total} 號`}
                            </div>
                            {isDA01R ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {rotUnits.map((u, i) => (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 20, height: 20, borderRadius: 6, background: C.warning + '44', color: C.warning, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                                    <span style={{ fontSize: 13, fontWeight: 500 }}>{u}</span>
                                  </div>
                                ))}
                              </div>
                            ) : <div style={{ fontSize: 14, fontWeight: 600 }}>{rotInfo.unit}</div>}
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>儲存後自動推進 {isDA01R ? DA01_BATCH : 1} 間輪派進度</div>
                          </div>
                        ) : <div style={{ color: C.muted, fontSize: 13 }}>⚠️ 尚未設定輪派清單，請至管理後台新增</div>
                      ) : unitList.length > 0 ? (
                        <MultiSelect options={unitList} selected={entry.units} onChange={v => updateDispatchEntry(entry.codeType, { units: v })} placeholder="輸入關鍵字篩選單位" />
                      ) : (
                        <Input value={entry.unit} onChange={e => updateDispatchEntry(entry.codeType, { unit: e.target.value })} placeholder={region ? '可至管理後台設定單位，或直接輸入' : '個案未設定服務區域'} />
                      )}
                    </div>
                    {!entry.isRotating && isRotCode && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <FormRow label="派案原因">
                          <Select value={entry.referralReason} onChange={e => updateDispatchEntry(entry.codeType, { referralReason: e.target.value, referralReasonOther: '' })}>
                            <option value="">請選擇派案原因</option>
                            {REFERRAL_REASONS.map(o => <option key={o}>{o}</option>)}
                          </Select>
                          {entry.referralReason === '其他' && (
                            <Input style={{ marginTop: 8 }} value={entry.referralReasonOther} onChange={e => updateDispatchEntry(entry.codeType, { referralReasonOther: e.target.value })} placeholder="請說明原因" />
                          )}
                        </FormRow>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px', marginTop: 20 }}>
              <FormRow label="承接狀態">
                <Select value={dispatchForm.status} onChange={e => setDispatchForm(f => ({ ...f, status: e.target.value, rejectReason: '', rejectReasonOther: '' }))}>
                  <option>承接</option><option>不承接</option>
                </Select>
              </FormRow>
              {dispatchForm.status === '不承接' && (() => {
                const allRR = [...new Set(dispatchForm.codeEntries.flatMap(e => REJECT_REASONS[e.codeType] || []))];
                return (
                  <FormRow label="不承接原因">
                    <Select value={dispatchForm.rejectReason} onChange={e => setDispatchForm(f => ({ ...f, rejectReason: e.target.value, rejectReasonOther: '' }))}>
                      <option value="">請選擇</option>
                      {(allRR.length > 0 ? allRR : REJECT_REASONS.BA).map(o => <option key={o}>{o}</option>)}
                    </Select>
                    {dispatchForm.rejectReason === '其他' && (
                      <Input style={{ marginTop: 8 }} value={dispatchForm.rejectReasonOther} onChange={e => setDispatchForm(f => ({ ...f, rejectReasonOther: e.target.value }))} placeholder="請說明原因" />
                    )}
                  </FormRow>
                );
              })()}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
              <BtnPrimary style={{ flex: 1 }} onClick={handleDispatchSubmit} disabled={dispatchSaving}>
                {dispatchSaving ? '儲存中…' : '儲存派案'}
              </BtnPrimary>
              <BtnSecondary onClick={() => { setDispatchModal(false); setDispatchPerson(null); }}>取消</BtnSecondary>
            </div>
          </div>
        </div>
      )}

      {/* 評估派案 Modal */}
      {planModal && planPerson && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(60,50,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}
          onClick={e => { if (e.target === e.currentTarget) closePlanModal(); }}>
          <div style={{ background: C.card, borderRadius: 22, padding: 32, maxWidth: 700, width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>評估派案</h3>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                  {planPerson.info.clientName}（{planPerson.info.idNumber || '—'}）｜ {planPerson.info.region || '—'} 區
                </div>
              </div>
              <button onClick={closePlanModal} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.muted, lineHeight: 1 }}>✕</button>
            </div>

            {planMsg && <div style={{ marginBottom: 16 }}><Alert type={planMsg.type}>{planMsg.text}</Alert></div>}

            {/* 計畫資料 */}
            <div style={{ marginBottom: 20, padding: '16px 18px', borderRadius: 14, border: `1px solid ${C.border}`, background: C.bg }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.accent, marginBottom: 14 }}>計畫資料</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
                <FormRow label="計畫日期">
                  <Input type="date" value={planForm.planDate} onChange={e => setPlanForm(f => ({ ...f, planDate: e.target.value }))} />
                </FormRow>
                <FormRow label="通過日期">
                  <Input type="date" value={planForm.approvalDate} onChange={e => setPlanForm(f => ({ ...f, approvalDate: e.target.value }))} />
                </FormRow>
                {planForm.planDate && planForm.approvalDate && (() => {
                  const isOd = workdaysBetween(planForm.planDate, planForm.approvalDate) > 4;
                  return (
                    <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 500, color: isOd ? C.alert : C.success }}>
                      {isOd ? '⚠️ 計畫逾期（超過4個工作天）' : '✓ 時效正常'}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* 派案資料（選填） */}
            <div style={{ marginBottom: 20, padding: '16px 18px', borderRadius: 14, border: `1px solid ${C.border}`, background: C.bg }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, marginBottom: 14 }}>派案資料（選填）</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
                <FormRow label="評估類型">
                  <div style={{ display: 'flex', gap: 20, paddingTop: 10 }}>
                    {['初評', '複評'].map(v => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" checked={planForm.caseType === v} onChange={() => setPlanForm(f => ({ ...f, caseType: v }))} />
                        {v}
                      </label>
                    ))}
                  </div>
                </FormRow>
                <FormRow label="案別">
                  <div style={{ display: 'flex', gap: 20, paddingTop: 10 }}>
                    {['新案', '舊案'].map(v => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" checked={planForm.dispatchType === v} onChange={() => setPlanForm(f => ({ ...f, dispatchType: v }))} />
                        {v}
                      </label>
                    ))}
                  </div>
                </FormRow>
                <FormRow label="照會日（派案日）">
                  <Input type="date" value={planForm.referralDate} onChange={e => setPlanForm(f => ({ ...f, referralDate: e.target.value }))} />
                </FormRow>
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 500 }}>服務碼別（可多選）</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {CODE_TYPES_LIST.map(code => {
                    const sel = planForm.codeEntries.some(e => e.codeType === code);
                    return (
                      <button key={code} type="button" onClick={() => togglePlanCode(code)} style={{ padding: '7px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, border: `1.5px solid ${sel ? C.primary : C.border}`, background: sel ? C.primaryL : C.card, color: sel ? C.primaryH : C.text, fontWeight: sel ? 600 : 400, fontFamily: 'inherit', transition: 'all 0.15s' }}>
                        {code}{ROTATING_CODES.includes(code) ? ' ⟳' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>

              {planForm.codeEntries.map(entry => {
                const isRotCode = ROTATING_CODES.includes(entry.codeType);
                const region = planPerson.info.region;
                const unitList = getPlanUnitList(entry.codeType, entry.isRotating);
                const rotInfo = entry.isRotating && region ? getCurrentRotUnit(region, entry.codeType) : null;
                const isDA01R = entry.codeType === 'DA01' && entry.isRotating;
                const rotUnits = rotInfo && unitList.length ? (isDA01R ? Array.from({ length: DA01_BATCH }, (_, i) => unitList[(rotInfo.index + i) % unitList.length]) : [rotInfo.unit]) : [];
                return (
                  <div key={entry.codeType} style={{ marginTop: 14, padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${C.primary}44`, background: C.card }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.primaryH, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: C.primaryL, padding: '2px 10px', borderRadius: 8 }}>{entry.codeType}</span>
                      {isRotCode && <span style={{ fontSize: 11, color: C.muted }}>可輪派</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
                      {isRotCode && (
                        <FormRow label="派案方式">
                          <div style={{ display: 'flex', gap: 20, paddingTop: 10 }}>
                            {[{ v: false, l: '非輪派（指定）' }, { v: true, l: '輪派' }].map(opt => (
                              <label key={opt.l} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                                <input type="radio" checked={entry.isRotating === opt.v} onChange={() => {
                                  const rot = opt.v && region ? getCurrentRotUnit(region, entry.codeType) : null;
                                  updatePlanEntry(entry.codeType, { isRotating: opt.v, unit: rot ? rot.unit : '', units: [] });
                                }} />
                                {opt.l}
                              </label>
                            ))}
                          </div>
                        </FormRow>
                      )}
                      <div style={{ gridColumn: (!isRotCode || entry.isRotating) ? '1 / -1' : undefined }}>
                        <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 500 }}>
                          {entry.isRotating ? '派案單位' : unitList.length > 0 ? '派案單位（可多選）' : '派案單位'}
                        </label>
                        {entry.isRotating ? (
                          rotInfo ? (
                            <div style={{ background: C.warningL, borderRadius: 12, padding: '12px 16px', border: '1px solid #e8d5a0' }}>
                              <div style={{ fontWeight: 600, color: C.warning, fontSize: 13, marginBottom: 6 }}>
                                🔄 {isDA01R ? `輪派 第 ${rotInfo.index + 1}～${(rotInfo.index + DA01_BATCH - 1) % rotInfo.total + 1} / ${rotInfo.total} 號（共 ${DA01_BATCH} 間）` : `輪派順序 第 ${rotInfo.index + 1} / ${rotInfo.total} 號`}
                              </div>
                              {isDA01R ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {rotUnits.map((u, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ width: 20, height: 20, borderRadius: 6, background: C.warning + '44', color: C.warning, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                                      <span style={{ fontSize: 13, fontWeight: 500 }}>{u}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : <div style={{ fontSize: 14, fontWeight: 600 }}>{rotInfo.unit}</div>}
                              <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>儲存後自動推進 {isDA01R ? DA01_BATCH : 1} 間輪派進度</div>
                            </div>
                          ) : <div style={{ color: C.muted, fontSize: 13 }}>⚠️ 尚未設定輪派清單，請至管理後台新增</div>
                        ) : unitList.length > 0 ? (
                          <MultiSelect options={unitList} selected={entry.units} onChange={v => updatePlanEntry(entry.codeType, { units: v })} placeholder="輸入關鍵字篩選單位" />
                        ) : (
                          <Input value={entry.unit} onChange={e => updatePlanEntry(entry.codeType, { unit: e.target.value })} placeholder={region ? '可至管理後台設定單位，或直接輸入' : '個案未設定服務區域'} />
                        )}
                      </div>
                      {!entry.isRotating && isRotCode && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <FormRow label="派案原因">
                            <Select value={entry.referralReason} onChange={e => updatePlanEntry(entry.codeType, { referralReason: e.target.value, referralReasonOther: '' })}>
                              <option value="">請選擇派案原因</option>
                              {REFERRAL_REASONS.map(o => <option key={o}>{o}</option>)}
                            </Select>
                            {entry.referralReason === '其他' && (
                              <Input style={{ marginTop: 8 }} value={entry.referralReasonOther} onChange={e => updatePlanEntry(entry.codeType, { referralReasonOther: e.target.value })} placeholder="請說明原因" />
                            )}
                          </FormRow>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {planForm.codeEntries.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px', marginTop: 16 }}>
                  <FormRow label="承接狀態">
                    <Select value={planForm.status} onChange={e => setPlanForm(f => ({ ...f, status: e.target.value, rejectReason: '', rejectReasonOther: '' }))}>
                      <option>承接</option><option>不承接</option>
                    </Select>
                  </FormRow>
                  {planForm.status === '不承接' && (() => {
                    const allRR = [...new Set(planForm.codeEntries.flatMap(e => REJECT_REASONS[e.codeType] || []))];
                    return (
                      <FormRow label="不承接原因">
                        <Select value={planForm.rejectReason} onChange={e => setPlanForm(f => ({ ...f, rejectReason: e.target.value, rejectReasonOther: '' }))}>
                          <option value="">請選擇</option>
                          {(allRR.length > 0 ? allRR : REJECT_REASONS.BA).map(o => <option key={o}>{o}</option>)}
                        </Select>
                        {planForm.rejectReason === '其他' && (
                          <Input style={{ marginTop: 8 }} value={planForm.rejectReasonOther} onChange={e => setPlanForm(f => ({ ...f, rejectReasonOther: e.target.value }))} placeholder="請說明原因" />
                        )}
                      </FormRow>
                    );
                  })()}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <BtnPrimary style={{ flex: 1 }} onClick={handlePlanSubmit} disabled={planSaving}>
                {planSaving ? '儲存中…' : '儲存評估派案'}
              </BtnPrimary>
              <BtnSecondary onClick={closePlanModal}>取消</BtnSecondary>
            </div>
          </div>
        </div>
      )}

      {/* 新增個案 Modal */}
      {addModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(60,50,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }} onClick={e => { if (e.target === e.currentTarget) closeAddModal(); }}>
          <div style={{
            background: C.card, borderRadius: 22, padding: 32,
            maxWidth: 560, width: '90%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>新增個案</h3>
              <button onClick={closeAddModal} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.muted, lineHeight: 1 }}>✕</button>
            </div>

            {addMsg && <div style={{ marginBottom: 16 }}><Alert type={addMsg.type}>{addMsg.text}</Alert></div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px', marginBottom: 24 }}>
              <FormRow label="個案姓名">
                <Input value={addForm.clientName} onChange={e => af('clientName', e.target.value)} placeholder="請輸入姓名" />
              </FormRow>
              <FormRow label="身分證字號">
                <Input value={addForm.idNumber} onChange={e => af('idNumber', e.target.value.toUpperCase())} placeholder="A123456789" maxLength={10} style={{ textTransform: 'uppercase' }} />
              </FormRow>
              <FormRow label="地址" style={{ gridColumn: '1 / -1' }}>
                <Input value={addForm.address} onChange={e => af('address', e.target.value)} placeholder="請輸入完整地址" />
              </FormRow>
              <FormRow label="案號">
                <Input value={addForm.caseNumber} onChange={e => af('caseNumber', e.target.value)} placeholder="請輸入案號" />
              </FormRow>
              <FormRow label="接案日期">
                <Input type="date" value={addForm.acceptDate} onChange={e => af('acceptDate', e.target.value)} />
              </FormRow>
              <FormRow label="服務區域">
                {isManager ? (
                  <div style={{ padding: '9px 12px', background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13 }}>
                    {currentUser.region}區（已自動帶入）
                  </div>
                ) : (
                  <Select value={addForm.region} onChange={e => af('region', e.target.value)}>
                    <option value="">請選擇</option>
                    {REGIONS.map(r => <option key={r}>{r}</option>)}
                  </Select>
                )}
              </FormRow>
              {isAdmin && (
                <FormRow label="負責個管">
                  <Select value={addForm.managerId} onChange={e => af('managerId', e.target.value)}>
                    <option value="">請選擇</option>
                    {managers.map(u => <option key={u.id} value={u.id}>{u.name}（{u.region || '—'}區）</option>)}
                  </Select>
                </FormRow>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <BtnPrimary onClick={handleAddCase} disabled={addSaving} style={{ flex: 1 }}>
                {addSaving ? '儲存中…' : '儲存個案'}
              </BtnPrimary>
              <BtnSecondary onClick={closeAddModal}>取消</BtnSecondary>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MasterEditPanel({ p, ex, saveMsg, onSetExtra, onSave, onCancel, regions, managers }) {
  const isOverdue = workdaysBetween(ex.planDate, ex.approvalDate) > 4;

  return (
    <div style={{ padding: '20px 24px', borderTop: `2px solid ${C.accentL || '#dce6ee'}` }}>

      <Section title="個案基本資料" color={C.primary}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 20px' }}>
          <FormRow label="個案姓名">
            <Input value={ex.clientName || ''} onChange={e => onSetExtra('clientName', e.target.value)} placeholder="姓名" />
          </FormRow>
          <FormRow label="身分證字號">
            <Input value={ex.idNumber || ''} onChange={e => onSetExtra('idNumber', e.target.value.toUpperCase())} placeholder="A123456789" maxLength={10} style={{ textTransform: 'uppercase' }} />
          </FormRow>
          <FormRow label="案號">
            <Input value={ex.caseNumber || ''} onChange={e => onSetExtra('caseNumber', e.target.value)} placeholder="案號" />
          </FormRow>
          <FormRow label="地址" style={{ gridColumn: '1 / -1' }}>
            <Input value={ex.address || ''} onChange={e => onSetExtra('address', e.target.value)} placeholder="完整地址" />
          </FormRow>
          <FormRow label="接案日期">
            <Input type="date" value={ex.acceptDate || ''} onChange={e => onSetExtra('acceptDate', e.target.value)} />
          </FormRow>
          <FormRow label="服務區域">
            <Select value={ex.region || ''} onChange={e => onSetExtra('region', e.target.value)}>
              <option value="">請選擇</option>
              {regions.map(r => <option key={r}>{r}</option>)}
            </Select>
          </FormRow>
          <FormRow label="個管人員">
            <Select value={ex.managerId || ''} onChange={e => onSetExtra('managerId', e.target.value)}>
              <option value="">請選擇</option>
              {managers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </FormRow>
        </div>
      </Section>

      <Section title="計畫資料" color={C.accent} style={{ marginTop: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 20px' }}>
          <FormRow label="計畫日期">
            <Input type="date" value={ex.planDate || ''} onChange={e => onSetExtra('planDate', e.target.value)} />
          </FormRow>
          <FormRow label="通過日期">
            <Input type="date" value={ex.approvalDate || ''} onChange={e => onSetExtra('approvalDate', e.target.value)} />
          </FormRow>
          {ex.planDate && ex.approvalDate && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: isOverdue ? C.alert : C.success }}>
                {isOverdue ? '⚠️ 計畫逾期' : '✓ 時效正常'}
              </span>
            </div>
          )}
        </div>
      </Section>

      <Section title="補充資料" color={C.accent} style={{ marginTop: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 20px' }}>
          <FormRow label="居護所">
            <Input value={ex.nursingHome || ''} onChange={e => onSetExtra('nursingHome', e.target.value)} placeholder="居護所名稱" />
          </FormRow>
          <FormRow label="醫師意見書派件日">
            <Input type="date" value={ex.doctorOpDate || ''} onChange={e => onSetExtra('doctorOpDate', e.target.value)} />
          </FormRow>
          <FormRow label="個管註記日期">
            <Input type="date" value={ex.managerNoteDate || ''} onChange={e => onSetExtra('managerNoteDate', e.target.value)} />
          </FormRow>
          <FormRow label="備註" style={{ gridColumn: '1 / 3' }}>
            <Input value={ex.remarks || ''} onChange={e => onSetExtra('remarks', e.target.value)} placeholder="備註" />
          </FormRow>
          <FormRow label="其他備註">
            <Input value={ex.otherRemarks || ''} onChange={e => onSetExtra('otherRemarks', e.target.value)} placeholder="其他備註" />
          </FormRow>
        </div>
      </Section>

      <Section title="結案資料" color={C.alert} style={{ marginTop: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 20px' }}>
          <FormRow label="結案日期">
            <Input type="date" value={ex.closeDate || ''} onChange={e => onSetExtra('closeDate', e.target.value)} />
          </FormRow>
          <FormRow label="結案原因" style={{ gridColumn: '2 / 4' }}>
            <Select value={ex.closeReason || ''} onChange={e => onSetExtra('closeReason', e.target.value)}>
              <option value="">請選擇結案原因</option>
              {CLOSE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          </FormRow>
        </div>
      </Section>

      {saveMsg && (
        <div style={{ marginTop: 12 }}>
          <Alert type={saveMsg.type}>{saveMsg.text}</Alert>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <BtnPrimary onClick={onSave}>儲存</BtnPrimary>
        <BtnSecondary onClick={onCancel}>取消</BtnSecondary>
      </div>
    </div>
  );
}

function Section({ title, color, children, style }) {
  return (
    <div style={style}>
      <div style={{
        fontSize: 13, fontWeight: 600, color,
        marginBottom: 12, paddingBottom: 6,
        borderBottom: `1px solid ${C.border}`,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function FormRow({ label, children, style }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 500 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import { today, daysBetween, getMonth, getManagerName, REGIONS, ROTATING_CODES, CODE_TYPES, genId } from '../utils/helpers';
import { Card, PageHeader, Tab, FormField, Input, Select, BtnPrimary, BtnSecondary, BtnSmall, Alert, Badge, C } from '../components/UI';
import { fbGet } from '../utils/firebase';

export default function Admin() {
  const [tab, setTab] = useState('accounts');
  const tabs = [
    { id: 'accounts', label: '👤 帳號管理' },
    { id: 'rotating', label: '🔄 輪派單位' },
    { id: 'rotationStatus', label: '📍 輪派進度' },
    { id: 'nonRotating', label: '📌 特約單位' },
    { id: 'numberConfig', label: '🔢 編號設定' },
    { id: 'export', label: '📤 匯出資料' },
    { id: 'sheets', label: '📊 Google Sheets' },
  ];

  return (
    <div>
      <PageHeader title="管理員後台" subtitle="帳號管理、單位設定、資料匯出" />
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map(t => <Tab key={t.id} id={t.id} label={t.label} active={tab === t.id} onClick={setTab} />)}
      </div>
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'rotating' && <RotatingTab />}
      {tab === 'rotationStatus' && <RotationStatusTab />}
      {tab === 'nonRotating' && <NonRotatingTab />}
      {tab === 'numberConfig' && <NumberConfigTab />}
      {tab === 'export' && <ExportTab />}
      {tab === 'sheets' && <SheetsTab />}
    </div>
  );
}

function AccountsTab() {
  const { users, saveUsers } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [nu, setNu] = useState({ username: '', password: '', name: '', role: 'manager', region: '三重' });
  const [editForm, setEditForm] = useState({});
  const [msg, setMsg] = useState(null);

  async function addUser() {
    if (!nu.username.trim() || !nu.password || !nu.name.trim()) { setMsg({ type: 'error', text: '請填寫所有欄位' }); return; }
    if (users.find(u => u.username === nu.username)) { setMsg({ type: 'error', text: '此帳號名稱已存在' }); return; }
    await saveUsers([...users, { ...nu, id: genId() }]);
    setNu({ username: '', password: '', name: '', role: 'manager', region: '三重' });
    setShowAdd(false);
    setMsg({ type: 'success', text: '✓ 帳號已新增' });
  }

  function startEdit(u) {
    setEditingId(u.id);
    setEditForm({ ...u });
    setShowAdd(false);
  }

  async function saveEdit() {
    if (!editForm.name.trim() || !editForm.username.trim() || !editForm.password) {
      setMsg({ type: 'error', text: '姓名、帳號、密碼不能為空' }); return;
    }
    const dup = users.find(u => u.username === editForm.username && u.id !== editingId);
    if (dup) { setMsg({ type: 'error', text: '此帳號名稱已被使用' }); return; }
    await saveUsers(users.map(u => u.id === editingId ? { ...u, ...editForm } : u));
    setEditingId(null);
    setMsg({ type: 'success', text: '✓ 帳號已更新' });
  }

  async function removeUser(id) {
    if (!window.confirm('確定要刪除此帳號？')) return;
    await saveUsers(users.filter(u => u.id !== id));
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>帳號管理（共 {users.length} 位）</h3>
        <BtnSmall onClick={() => { setShowAdd(v => !v); setEditingId(null); }} style={{ background: C.primary, color: '#fff', border: 'none' }}>＋ 新增帳號</BtnSmall>
      </div>
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}

      {/* 新增表單 */}
      {showAdd && (
        <div style={{ background: C.bg, borderRadius: 12, padding: 20, marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="姓名"><Input value={nu.name} onChange={e => setNu(f => ({ ...f, name: e.target.value }))} placeholder="顯示姓名" /></FormField>
          <FormField label="帳號"><Input value={nu.username} onChange={e => setNu(f => ({ ...f, username: e.target.value }))} placeholder="登入帳號" /></FormField>
          <FormField label="密碼"><Input type="password" value={nu.password} onChange={e => setNu(f => ({ ...f, password: e.target.value }))} placeholder="登入密碼" /></FormField>
          <FormField label="角色">
            <Select value={nu.role} onChange={e => setNu(f => ({ ...f, role: e.target.value }))}>
              <option value="manager">個管師</option><option value="admin">管理員</option>
            </Select>
          </FormField>
          {nu.role === 'manager' && (
            <FormField label="服務區域">
              <Select value={nu.region} onChange={e => setNu(f => ({ ...f, region: e.target.value }))}>
                {REGIONS.map(r => <option key={r}>{r}</option>)}
              </Select>
            </FormField>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <BtnSmall onClick={addUser} style={{ background: C.success, color: '#fff', border: 'none' }}>儲存</BtnSmall>
            <BtnSmall onClick={() => setShowAdd(false)}>取消</BtnSmall>
          </div>
        </div>
      )}

      {/* 帳號列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map(u => (
          <div key={u.id}>
            {/* 一般顯示列 */}
            {editingId !== u.id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: C.bg, borderRadius: 12, border: `1px solid ${C.border}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    帳號：{u.username}　｜　{u.role === 'admin' ? '管理員' : `個管師・${u.region || '—'}區`}
                  </div>
                </div>
                <Badge color={u.role === 'admin' ? 'alert' : 'primary'}>{u.role === 'admin' ? '管理員' : '個管師'}</Badge>
                <BtnSmall onClick={() => startEdit(u)} style={{ fontSize: 11 }}>✏️ 修改</BtnSmall>
                {u.id !== 'u1' && (
                  <BtnSmall onClick={() => removeUser(u.id)} style={{ color: C.alert, background: C.alertL, border: 'none', fontSize: 11 }}>刪除</BtnSmall>
                )}
              </div>
            )}

            {/* 編輯列 */}
            {editingId === u.id && (
              <div style={{ background: C.primaryL, borderRadius: 12, padding: 20, border: `1px solid ${C.primary}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.primaryH, marginBottom: 14 }}>✏️ 修改帳號：{u.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <FormField label="姓名">
                    <Input value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                  </FormField>
                  <FormField label="帳號">
                    <Input value={editForm.username || ''} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} />
                  </FormField>
                  <FormField label="新密碼">
                    <Input type="password" value={editForm.password || ''} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="輸入新密碼" />
                  </FormField>
                  <FormField label="角色">
                    <Select value={editForm.role || 'manager'} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                      <option value="manager">個管師</option>
                      <option value="admin">管理員</option>
                    </Select>
                  </FormField>
                  {editForm.role === 'manager' && (
                    <FormField label="服務區域">
                      <Select value={editForm.region || '三重'} onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))}>
                        {REGIONS.map(r => <option key={r}>{r}</option>)}
                      </Select>
                    </FormField>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <BtnSmall onClick={saveEdit} style={{ background: C.primary, color: '#fff', border: 'none' }}>儲存變更</BtnSmall>
                    <BtnSmall onClick={() => setEditingId(null)}>取消</BtnSmall>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function RotatingTab() {
  const { units, saveUnits } = useApp();
  const [region, setRegion] = useState('三重');
  const [code, setCode] = useState('BA');
  const [newUnit, setNewUnit] = useState('');
  const list = units.rotating?.[region]?.[code] || [];

  async function add() {
    if (!newUnit.trim()) return;
    const u = { ...units, rotating: { ...units.rotating, [region]: { ...units.rotating[region], [code]: [...list, newUnit.trim()] } } };
    await saveUnits(u); setNewUnit('');
  }
  async function remove(idx) {
    const u = { ...units, rotating: { ...units.rotating, [region]: { ...units.rotating[region], [code]: list.filter((_, i) => i !== idx) } } };
    await saveUnits(u);
  }

  return (
    <Card>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>輪派單位設定（各區 BA / DA01）</h3>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {REGIONS.map(r => <Tab key={r} id={r} label={`${r}區`} active={region === r} onClick={setRegion} />)}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {ROTATING_CODES.map(c => <Tab key={c} id={c} label={`${c}碼`} active={code === c} onClick={setCode} />)}
      </div>
      <div style={{ marginBottom: 14 }}>
        {list.length === 0 ? <div style={{ color: C.muted, fontSize: 13, padding: '10px 0' }}>尚未設定輪派單位</div>
          : list.map((u, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: C.bg, borderRadius: 10, marginBottom: 6, border: `1px solid ${C.border}` }}>
              <span style={{ color: C.muted, fontSize: 12, width: 28, textAlign: 'center' }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{u}</span>
              <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: C.alert, cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>
            </div>
          ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input value={newUnit} onChange={e => setNewUnit(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="輸入單位全名" style={{ flex: 1 }} />
        <BtnSmall onClick={add} style={{ background: C.primary, color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>新增</BtnSmall>
      </div>
    </Card>
  );
}

function RotationStatusTab() {
  const { units, rotationIndex, setRotIndex } = useApp();
  const rows = REGIONS.flatMap(r => ROTATING_CODES.map(c => {
    const list = units.rotating?.[r]?.[c] || [];
    if (!list.length) return null;
    const key = `${r}_${c}`;
    const idx = rotationIndex[key] || 0;
    const cur = list[idx % list.length];
    const next = list[(idx + 1) % list.length];
    return { region: r, code: c, cur, next, idx: (idx % list.length) + 1, total: list.length, key };
  }).filter(Boolean));

  return (
    <Card>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>輪派進度管理</h3>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>查看各區目前輪派到哪一間，可手動調整</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: C.bg }}>{['區域', '碼別', '目前輪派', '下一間', '進度', '操作'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: C.muted, fontWeight: 500, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{r.region}</td>
                <td style={{ padding: '10px 14px' }}><Badge>{r.code}</Badge></td>
                <td style={{ padding: '10px 14px', color: C.warning, fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.cur}>{r.cur}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.next}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{r.idx} / {r.total}</td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <BtnSmall style={{ fontSize: 11 }} onClick={() => setRotIndex(r.key, r.idx % r.total)}>跳過 ▶</BtnSmall>
                    <BtnSmall style={{ fontSize: 11, color: C.alert, background: C.alertL, border: 'none' }} onClick={() => { if (window.confirm('重設回第1號？')) setRotIndex(r.key, 0); }}>重設 ↺</BtnSmall>
                    <input type="number" min="1" max={r.total} defaultValue={r.idx} onBlur={e => setRotIndex(r.key, Math.max(0, Math.min(parseInt(e.target.value) - 1 || 0, r.total - 1)))}
                      style={{ width: 54, padding: '4px 6px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, textAlign: 'center', fontFamily: 'inherit' }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NonRotatingTab() {
  const { units, saveUnits } = useApp();
  const [code, setCode] = useState('BA');
  const [newUnit, setNewUnit] = useState('');
  const nonCodes = CODE_TYPES.filter(c => c !== 'DA01');
  const list = units.nonRotating?.[code] || [];

  async function add() {
    if (!newUnit.trim()) return;
    const u = { ...units, nonRotating: { ...units.nonRotating, [code]: [...list, newUnit.trim()] } };
    await saveUnits(u); setNewUnit('');
  }
  async function remove(idx) {
    const u = { ...units, nonRotating: { ...units.nonRotating, [code]: list.filter((_, i) => i !== idx) } };
    await saveUnits(u);
  }
  async function importCSV(e) {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const codes = ['BA', 'BB', 'BC', 'CA', 'CB', 'CC', 'CD'];
    const colMap = {};
    headers.forEach((h, i) => { if (codes.includes(h)) colMap[i] = h; });
    if (!Object.keys(colMap).length) { alert('找不到有效表頭（BA,BB...CD）'); return; }
    const newData = { ...units.nonRotating };
    codes.forEach(c => newData[c] = []);
    lines.slice(1).forEach(line => {
      const cols = line.split(',');
      Object.entries(colMap).forEach(([idx, code]) => {
        const val = cols[idx]?.trim().replace(/"/g, '');
        if (val) newData[code].push(val);
      });
    });
    await saveUnits({ ...units, nonRotating: newData });
    alert('✅ 匯入成功！');
  }

  return (
    <Card>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>特約單位設定（全區共用）</h3>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>依碼別設定特約單位</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {nonCodes.map(c => <Tab key={c} id={c} label={c} active={code === c} onClick={setCode} />)}
      </div>
      <div style={{ marginBottom: 14 }}>
        {list.length === 0 ? <div style={{ color: C.muted, fontSize: 13, padding: '10px 0' }}>尚未設定特約單位</div>
          : list.map((u, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: C.bg, borderRadius: 10, marginBottom: 6, border: `1px solid ${C.border}` }}>
              <span style={{ color: C.muted, fontSize: 12, width: 28, textAlign: 'center' }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{u}</span>
              <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: C.alert, cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>
            </div>
          ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <Input value={newUnit} onChange={e => setNewUnit(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="輸入特約單位全名" style={{ flex: 1 }} />
        <BtnSmall onClick={add} style={{ background: C.primary, color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>新增</BtnSmall>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📥 批次匯入 CSV</div>
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>表頭格式：BA,BB,BC,CA,CB,CC,CD</p>
        <label style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer', fontSize: 12 }}>
          📂 上傳 CSV<input type="file" accept=".csv" style={{ display: 'none' }} onChange={importCSV} />
        </label>
      </div>
    </Card>
  );
}

function NumberConfigTab() {
  const { numberConfig, saveNumberConfig } = useApp();
  const [cfg, setCfg] = useState(() => {
    const base = {};
    REGIONS.forEach(r => { base[r] = { prefix: '', start: 1, current: 1 }; });
    return base;
  });
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  // Firebase 載入完成後同步進來
  useEffect(() => {
    if (numberConfig && Object.keys(numberConfig).length > 0) {
      setCfg(prev => {
        const updated = { ...prev };
        REGIONS.forEach(r => { if (numberConfig[r]) updated[r] = { ...prev[r], ...numberConfig[r] }; });
        return updated;
      });
    }
  }, [numberConfig]);

  function set(region, key, val) {
    setCfg(prev => ({ ...prev, [region]: { ...prev[region], [key]: val } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveNumberConfig(cfg);
      setMsg({ type: 'success', text: '編號設定已儲存' });
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg({ type: 'error', text: `儲存失敗：${e.message}` });
    }
    setSaving(false);
  }

  return (
    <Card>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>個案總表編號設定</h3>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>
        各區設定英文前綴代號與起始流水數字（如前綴 C + 起始 1 = C001）
      </p>
      <p style={{ color: C.alert, fontSize: 12, marginBottom: 20 }}>
        注意：「目前號碼」即下一筆案件將使用的號碼，新增派案儲存後自動+1
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.bg }}>
              {['區域', '英文前綴', '起始號碼', '目前號碼', '下一個編號預覽'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '10px 14px',
                  color: C.muted, fontWeight: 500, fontSize: 12,
                  borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REGIONS.map(r => {
              const c = cfg[r] || { prefix: '', start: 1, current: 1 };
              const preview = c.prefix
                ? (c.prefix + String(c.current || c.start || 1).padStart(3, '0'))
                : '（未設定）';
              return (
                <tr key={r} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{r}區</td>
                  <td style={{ padding: '10px 14px' }}>
                    <Input
                      value={c.prefix || ''}
                      onChange={e => set(r, 'prefix', e.target.value.toUpperCase())}
                      placeholder="字母"
                      maxLength={3}
                      style={{ width: 80, textAlign: 'center', fontWeight: 600 }}
                    />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Input
                      type="number"
                      value={c.start || 1}
                      min={1}
                      onChange={e => set(r, 'start', parseInt(e.target.value) || 1)}
                      style={{ width: 100 }}
                    />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Input
                      type="number"
                      value={c.current || c.start || 1}
                      min={1}
                      onChange={e => set(r, 'current', parseInt(e.target.value) || 1)}
                      style={{ width: 100 }}
                    />
                  </td>
                  <td style={{ padding: '10px 14px', color: C.primary, fontWeight: 600, fontSize: 14 }}>
                    {preview}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {msg && <div style={{ marginTop: 12 }}><Alert type={msg.type}>{msg.text}</Alert></div>}
      <div style={{ marginTop: 16 }}>
        <BtnPrimary onClick={handleSave} disabled={saving}>
          {saving ? '儲存中…' : '儲存編號設定'}
        </BtnPrimary>
      </div>
    </Card>
  );
}

function ExportTab() {
  const { cases, users } = useApp();
  const t = today();
  const [month, setMonth] = useState('');
  const [code, setCode] = useState('');
  const [masterRegion, setMasterRegion] = useState('');
  const [masterPlanMonth, setMasterPlanMonth] = useState('');
  const [exporting, setExporting] = useState(false);

  const filtered = cases.filter(c => {
    if (month && !c.referralDate?.startsWith(month)) return false;
    if (code && c.codeType !== code) return false;
    return true;
  });

  function buildRow(c, type) {
    const days = c.entryDate ? daysBetween(c.referralDate, c.entryDate) : '';
    const od = days && days > 5 ? days - 5 : '';
    const mgr = getManagerName(users, c.managerId);
    const mon = getMonth(c.referralDate);
    if (type === 'BA') return { 服務區域: c.region, 派案日期: c.referralDate, 派案月份: mon, 個案姓名: c.clientName, 個管人員: mgr, 服務碼別: c.codeType, 派案單位: c.unit, 新舊案: c.caseType, 是否為輪派: c.isRotating ? '是' : '否', 派案原因: c.referralReason, 承接狀態: c.status, 未承接原因: c.rejectReason, 進場日: c.entryDate, 逾期進場天數: od, 逾期因素: c.overdueType, 逾期原因: c.overdueReason };
    if (type === 'DA01') return { 服務區域: c.region, 派案日期: c.referralDate, 派車月份: mon, 個案姓名: c.clientName, 派車單位: c.unit, 個管人員: mgr, 是否為輪派: c.isRotating ? '是' : '否' };
    return { 服務區域: c.region, 派案日期: c.referralDate, 派案月份: mon, 個案姓名: c.clientName, 個管人員: mgr, 派案碼別: c.codeType, 派案單位: c.unit, 承接狀態: c.status, 未承接原因: c.rejectReason, 進場日: c.entryDate, 逾期進場天數: od, 逾期因素: c.overdueType, 逾期原因: c.overdueReason };
  }

  function dlCSV(rows, filename) {
    if (!rows.length) return alert('無符合條件的個案資料');
    const isArr = Array.isArray(rows[0]);
    let csv;
    if (isArr) {
      csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    } else {
      const hs = Object.keys(rows[0]);
      csv = [hs, ...rows.map(r => hs.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`))].map(r => r.join ? r.join(',') : r).join('\n');
    }
    const a = document.createElement('a');
    a.setAttribute('href', 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv));
    a.setAttribute('download', filename);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function exportByCode(grp) {
    const data = cases.filter(c => grp === 'BA' ? c.codeType === 'BA' : grp === 'DA01' ? c.codeType === 'DA01' : ['BB', 'BC', 'CA', 'CB', 'CC', 'CD'].includes(c.codeType));
    const name = grp === 'BA' ? 'BA碼派案紀錄' : grp === 'DA01' ? '交通車派案紀錄' : '非輪派單位照會紀錄';
    dlCSV(data.map(c => buildRow(c, grp)), `${name}_${t}.csv`);
  }

  async function exportMasterList() {
    setExporting(true);
    try {
      const masterData = (await fbGet('masterCases')) || {};

      function wdBetween(d1, d2) {
        if (!d1 || !d2) return 0;
        const s = new Date(d1); s.setHours(0, 0, 0, 0);
        const e = new Date(d2); e.setHours(0, 0, 0, 0);
        if (e < s) return 0;
        let n = 0; const cur = new Date(s);
        while (cur <= e) { const d = cur.getDay(); if (d && d !== 6) n++; cur.setDate(cur.getDate() + 1); }
        return n;
      }
      function wdHelper(ds) {
        if (!ds) return '';
        const dow = new Date(ds).getDay();
        return dow === 0 ? 7 : dow;
      }
      function yr(ds) { return ds ? new Date(ds).getFullYear() : ''; }
      function mo(ds) { return ds ? (new Date(ds).getMonth() + 1) : ''; }

      const headers = [
        '編號', '個案姓名', '個管', '出備/轉案', '案號', '身分證字號',
        '接案日期', '計畫日期', '年份', '月份(統計用)', '星期輔助欄', '通過日期', '逾期',
        '地址', '區域', '結案日期', '結案原因',
        '居護所', '醫師意見書派件日', '個管註記日期', '備註', '其他備註',
      ];

      const rows = Object.values(masterData)
        .filter(ex => {
          if (masterRegion && ex.region !== masterRegion) return false;
          if (masterPlanMonth && !(ex.planDate || '').startsWith(masterPlanMonth)) return false;
          return true;
        })
        .sort((a, b) => (a.autoNumber || a.clientName || '').localeCompare(b.autoNumber || b.clientName || '', 'zh-TW'))
        .map(ex => {
          const mgr = getManagerName(users, ex.managerId);
          const isOverdue = wdBetween(ex.planDate, ex.approvalDate) > 4 ? '是' : '';
          return [
            ex.autoNumber || '', ex.clientName || '', mgr,
            ex.transferType || '', ex.caseNumber || '', ex.idNumber || '',
            ex.acceptDate || '', ex.planDate || '', yr(ex.planDate), mo(ex.planDate),
            wdHelper(ex.approvalDate), ex.approvalDate || '', isOverdue,
            ex.address || '', ex.region || '', ex.closeDate || '', ex.closeReason || '',
            ex.nursingHome || '', ex.doctorOpDate || '', ex.managerNoteDate || '', ex.remarks || '', ex.otherRemarks || '',
          ];
        });

      dlCSV([headers, ...rows], `個案總表_${t}.csv`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>資料匯出</h3>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>匯出 CSV，可直接用 Excel 開啟</p>

      {/* ── 個案總表匯出 ── */}
      <div style={{
        background: C.accentL || '#eef4ee', borderRadius: 14, padding: '20px 24px',
        marginBottom: 24, border: '1px solid #c8dac9',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.primary, marginBottom: 6 }}>個案總表</div>
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          以個案（身分證字號）為單位，一人一列，欄位格式與總表樣式相同，含逾期計算
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <Select value={masterRegion} onChange={e => setMasterRegion(e.target.value)} style={{ width: 110 }}>
            <option value="">全部區域</option>
            {REGIONS.map(r => <option key={r}>{r}</option>)}
          </Select>
          <Input type="month" value={masterPlanMonth} onChange={e => setMasterPlanMonth(e.target.value)} style={{ width: 150 }} />
          <span style={{ fontSize: 12, color: C.muted }}>依計畫月份篩選（留空=全部）</span>
        </div>
        <BtnPrimary onClick={exportMasterList} disabled={exporting}>
          {exporting ? '匯出中…' : '⬇ 匯出個案總表'}
        </BtnPrimary>
      </div>

      {/* ── 派案紀錄匯出 ── */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>派案紀錄分頁匯出</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 150 }} />
          <Select value={code} onChange={e => setCode(e.target.value)} style={{ width: 130 }}>
            <option value="">全部碼別</option>
            {CODE_TYPES.map(c => <option key={c}>{c}</option>)}
          </Select>
          <BtnSecondary onClick={() => dlCSV(filtered.map(c => buildRow(c, c.codeType === 'DA01' ? 'DA01' : c.codeType === 'BA' ? 'BA' : 'non')), `派案紀錄_${month || t}.csv`)}>
            ⬇ 全部派案紀錄
          </BtnSecondary>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[['BA', 'BA碼派案紀錄'], ['non', '非輪派照會紀錄'], ['DA01', '交通車（DA01）']].map(([g, l]) => (
            <BtnSecondary key={g} onClick={() => exportByCode(g)} style={{ fontSize: 12 }}>⬇ {l}</BtnSecondary>
          ))}
        </div>
      </div>
    </Card>
  );
}

function SheetsTab() {
  const { sheetsConfig, saveSheetsConfig, syncToSheets } = useApp();
  const [url, setUrl] = useState(sheetsConfig.scriptUrl || '');
  const [msg, setMsg] = useState(null);

  async function save() {
    await saveSheetsConfig({ scriptUrl: url });
    setMsg({ type: 'success', text: '✓ 設定已儲存' });
  }
  async function test() {
    if (!url) { setMsg({ type: 'error', text: '請先填寫網址' }); return; }
    setMsg({ type: 'warn', text: '測試中…' });
    syncToSheets({ id: 'test-' + Date.now(), region: '測試區', referralDate: '2026-01-01', managerId: 'u1', clientName: '測試個案', codeType: 'BA', isRotating: true, unit: '測試單位', caseType: '新案', status: '承接', rejectReason: '', referralReason: '', entryDate: '' }, 'add');
    setTimeout(() => setMsg({ type: 'success', text: '✓ 已送出！請到 Google Sheets「BA碼派案紀錄」確認是否出現「測試個案」。' }), 1500);
  }

  const appsScript = `function doGet(e) {
  var p = e.parameter;
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var code = p.codeType || '';
  var tabName;
  if(code === 'DA01') tabName = '交通車派案紀錄';
  else if(code === 'BA') tabName = 'BA碼派案紀錄';
  else tabName = '非輪派單位照會紀錄';

  var tab = sheet.getSheetByName(tabName);
  if(!tab) tab = sheet.insertSheet(tabName);

  var headers;
  if(code === 'BA'){
    headers = ['服務區域','派案日期','派案月份','個案姓名','個管人員','服務碼別','派案單位','新舊案','是否為輪派','派案原因','承接狀態','未承接原因','進場日','逾期進場天數','逾期因素','逾期原因','案件ID'];
  } else if(code === 'DA01'){
    headers = ['服務區域','派案日期','派車月份','個案姓名','派車單位','個管人員','是否為輪派','案件ID'];
  } else {
    headers = ['服務區域','派案日期','派案月份','個案姓名','個管人員','派案碼別','派案單位','承接狀態','未承接原因','進場日','逾期進場天數','逾期因素','逾期原因','案件ID'];
  }
  if(tab.getLastRow() === 0) tab.appendRow(headers);

  if(p.action === 'add'){
    var row;
    if(code === 'BA') row = [p.region,p.referralDate,p.month,p.clientName,p.manager,p.codeType,p.unit,p.caseType,p.isRotating,p.referralReason,p.status,p.rejectReason,p.entryDate,p.odDays,p.overdueType,p.overdueReason,p.caseId];
    else if(code === 'DA01') row = [p.region,p.referralDate,p.month,p.clientName,p.unit,p.manager,p.isRotating,p.caseId];
    else row = [p.region,p.referralDate,p.month,p.clientName,p.manager,p.codeType,p.unit,p.status,p.rejectReason,p.entryDate,p.odDays,p.overdueType,p.overdueReason,p.caseId];
    tab.appendRow(row);
  } else if(p.action === 'update'){
    var rows = tab.getDataRange().getValues();
    var idCol = headers.length - 1;
    for(var i = 1; i < rows.length; i++){
      if(rows[i][idCol] === p.caseId){
        if(code === 'BA'){ tab.getRange(i+1,13).setValue(p.entryDate); tab.getRange(i+1,14).setValue(p.odDays); tab.getRange(i+1,15).setValue(p.overdueType); tab.getRange(i+1,16).setValue(p.overdueReason); }
        else if(code !== 'DA01'){ tab.getRange(i+1,10).setValue(p.entryDate); tab.getRange(i+1,11).setValue(p.odDays); tab.getRange(i+1,12).setValue(p.overdueType); tab.getRange(i+1,13).setValue(p.overdueReason); }
        break;
      }
    }
  }
  return ContentService.createTextOutput('OK');
}`;

  return (
    <Card style={{ maxWidth: 620 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>📊 Google Sheets 即時同步</h3>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>每次新增派案或填寫進場日，自動寫入 Google Sheets</p>
      <div style={{ background: C.accentL, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: C.accent }}>
        <strong>設定步驟：</strong><br />
        1. Google Sheets → 擴充功能 → Apps Script<br />
        2. 貼上下方程式碼 → Deploy → New deployment → Web app<br />
        3. Execute as: Me / Who has access: Anyone → Deploy<br />
        4. 複製網址貼到下方
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 500 }}>Apps Script 程式碼（點下方全選複製）</label>
        <textarea
          readOnly onClick={e => e.target.select()}
          style={{ width: '100%', height: 200, borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, padding: 12, fontSize: 11, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
          value={appsScript}
        />
      </div>
      <FormField label="Apps Script 網址（部署後取得）">
        <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/xxxxx/exec" />
      </FormField>
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <BtnPrimary onClick={save}>儲存設定</BtnPrimary>
        <BtnSecondary onClick={test}>🧪 測試連線</BtnSecondary>
      </div>
    </Card>
  );
}

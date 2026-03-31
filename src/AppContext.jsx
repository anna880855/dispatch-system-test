import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fbGet, fbSet, fbUpdate, fbRemove, objToArr, arrToObj } from './utils/firebase';
import { genId, today, daysBetween, getMonth, getManagerName, REGIONS } from './utils/helpers';
import { DEFAULT_ROTATING, DEFAULT_NON_ROTATING, DEFAULT_ROTATION_INDEX } from './data/units';

const AppContext = createContext(null);

const DEFAULT_USERS = [
  { id: 'u1', username: 'admin', password: 'admin123', name: '系統管理員', role: 'admin', region: null },
];

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [units, setUnits] = useState({ rotating: DEFAULT_ROTATING, nonRotating: DEFAULT_NON_ROTATING });
  const [cases, setCases] = useState([]);
  const [rotationIndex, setRotationIndex] = useState({ ...DEFAULT_ROTATION_INDEX });
  const [sheetsConfig, setSheetsConfig] = useState({ scriptUrl: '' });
  const [masterCases, setMasterCases] = useState({});
  const [numberConfig, setNumberConfig] = useState({});
  const [fbStatus, setFbStatus] = useState('connecting'); // connecting | connected | offline
  const [ready, setReady] = useState(false);

  // Load Firebase data in background
  useEffect(() => {
    loadFromFirebase();
    const poller = setInterval(() => { pollCases(); pollMasterCases(); }, 15000);
    return () => clearInterval(poller);
  }, []);

  async function loadFromFirebase() {
    try {
      const timeout = (p, ms = 8000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

      const [fbUsers, fbUnits, fbCases, fbRot, fbSheets, fbMaster, fbNumCfg] = await Promise.all([
        timeout(fbGet('users')),
        timeout(fbGet('units')),
        timeout(fbGet('cases')),
        timeout(fbGet('rotationIndex')),
        timeout(fbGet('sheetsConfig')),
        timeout(fbGet('masterCases')),
        timeout(fbGet('numberConfig')),
      ]);

      if (fbUsers && Object.keys(fbUsers).length > 0) {
        const loaded = objToArr(fbUsers);
        const hasAdmin = loaded.some(u => u.id === 'u1');
        setUsers(hasAdmin ? loaded : [...DEFAULT_USERS, ...loaded.filter(u => u.id !== 'u1')]);
      } else {
        await fbSet('users', arrToObj(DEFAULT_USERS));
      }

      if (fbUnits) setUnits(fbUnits);
      else await fbSet('units', { rotating: DEFAULT_ROTATING, nonRotating: DEFAULT_NON_ROTATING });

      if (fbCases) setCases(objToArr(fbCases));

      if (fbRot) setRotationIndex(fbRot);
      else { setRotationIndex({ ...DEFAULT_ROTATION_INDEX }); await fbSet('rotationIndex', DEFAULT_ROTATION_INDEX); }

      if (fbSheets) setSheetsConfig(fbSheets);
      if (fbMaster) setMasterCases(fbMaster);

      if (fbNumCfg) {
        setNumberConfig(fbNumCfg);
      } else {
        const defaultCfg = {};
        REGIONS.forEach(r => { defaultCfg[r] = { prefix: '', start: 1, current: 1 }; });
        setNumberConfig(defaultCfg);
        fbSet('numberConfig', defaultCfg).catch(() => {});
      }

      setFbStatus('connected');
    } catch (e) {
      console.warn('Firebase 離線:', e.message);
      setFbStatus('offline');
    }
    setReady(true);
  }

  async function pollCases() {
    try {
      const fbCases = await fbGet('cases');
      if (fbCases) setCases(objToArr(fbCases));
    } catch (e) { /* silent */ }
  }

  async function pollMasterCases() {
    try {
      const data = await fbGet('masterCases');
      if (data) setMasterCases(data);
    } catch (e) { /* silent */ }
  }

  // ── Auth ──
  function login(username, password) {
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return false;
    setCurrentUser(user);
    return true;
  }
  function logout() { setCurrentUser(null); }

  // ── Cases ──
  async function addCase(caseData) {
    const newCase = { ...caseData, id: genId(), createdAt: new Date().toISOString() };
    setCases(prev => [...prev, newCase]);
    await fbSet(`cases/${newCase.id}`, newCase);
    syncToSheets(newCase, 'add');
    return newCase;
  }

  async function updateCase(id, updates) {
    setCases(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    await fbUpdate(`cases/${id}`, updates);
    const updated = cases.find(c => c.id === id);
    if (updated) syncToSheets({ ...updated, ...updates }, 'update');
  }

  async function deleteCase(id) {
    setCases(prev => prev.filter(c => c.id !== id));
    await fbRemove(`cases/${id}`);
  }

  // ── MasterCases ──
  async function addMasterCase(key, data) {
    const entry = { ...data, key };
    setMasterCases(prev => ({ ...prev, [key]: entry }));
    await fbSet(`masterCases/${key}`, entry);
  }

  async function updateMasterCase(key, updates) {
    setMasterCases(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...updates } }));
    await fbUpdate(`masterCases/${key}`, updates);
  }

  async function deleteMasterCase(key) {
    setMasterCases(prev => { const n = { ...prev }; delete n[key]; return n; });
    await fbRemove(`masterCases/${key}`);
  }

  // ── Users ──
  async function saveUsers(newUsers) {
    setUsers(newUsers);
    await fbSet('users', arrToObj(newUsers));
  }

  // ── Units ──
  async function saveUnits(newUnits) {
    setUnits(newUnits);
    await fbSet('units', newUnits);
  }

  // ── Rotation ──
  function getCurrentRotUnit(region, code) {
    const list = units.rotating?.[region]?.[code] || [];
    if (!list.length) return null;
    const key = `${region}_${code}`;
    const idx = rotationIndex[key] || 0;
    return { unit: list[idx % list.length], index: idx % list.length, total: list.length };
  }

  async function advanceRotation(region, code, count = 1) {
    const list = units.rotating?.[region]?.[code] || [];
    if (!list.length) return;
    const key = `${region}_${code}`;
    const cur = rotationIndex[key] || 0;
    const next = (cur + count) % list.length;
    setRotationIndex(prev => ({ ...prev, [key]: next }));
    await fbSet(`rotationIndex/${key}`, next);
  }

  // ── Number Config ──
  function autoGenerateNumber(region) {
    const cfg = numberConfig?.[region];
    if (!cfg || !cfg.prefix) return '';
    const num = cfg.current || cfg.start || 1;
    return cfg.prefix + String(num).padStart(3, '0');
  }

  async function advanceNumberConfig(region) {
    const cfg = numberConfig?.[region];
    if (!cfg || !cfg.prefix) return;
    const next = (cfg.current || cfg.start || 1) + 1;
    setNumberConfig(prev => ({ ...prev, [region]: { ...prev[region], current: next } }));
    await fbUpdate(`numberConfig/${region}`, { current: next });
  }

  async function saveNumberConfig(cfg) {
    setNumberConfig(cfg);
    await fbSet('numberConfig', cfg);
  }

  async function setRotIndex(key, idx) {
    setRotationIndex(prev => ({ ...prev, [key]: idx }));
    await fbSet(`rotationIndex/${key}`, idx);
  }

  // ── Sheets ──
  async function saveSheetsConfig(cfg) {
    setSheetsConfig(cfg);
    await fbSet('sheetsConfig', cfg);
  }

  function syncToSheets(caseData, action) {
    const url = sheetsConfig?.scriptUrl;
    if (!url) return;
    const entryDays = caseData.entryDate ? daysBetween(caseData.referralDate, caseData.entryDate) : '';
    const odDays = entryDays && entryDays > 5 ? entryDays - 5 : '';
    const params = {
      action, caseId: caseData.id || '',
      region: caseData.region || '', referralDate: caseData.referralDate || '',
      month: getMonth(caseData.referralDate), clientName: caseData.clientName || '',
      manager: getManagerName(users, caseData.managerId), codeType: caseData.codeType || '',
      unit: caseData.unit || '', caseType: caseData.caseType || '',
      isRotating: caseData.isRotating ? '是' : '否', referralReason: caseData.referralReason || '',
      status: caseData.status || '', rejectReason: caseData.rejectReason || '',
      entryDate: caseData.entryDate || '', odDays, overdueType: caseData.overdueType || '',
      overdueReason: caseData.overdueReason || ''
    };
    const qs = Object.keys(params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
    const img = new Image();
    img.src = `${url}?${qs}`;
  }

  // ── Export ──
  function exportCSV(data, filename) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = [headers, ...data.map(r => headers.map(h => r[h] ?? ''))];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const uri = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
    const a = document.createElement('a');
    a.setAttribute('href', uri);
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const value = {
    currentUser, users, units, cases, masterCases, rotationIndex, sheetsConfig, numberConfig, fbStatus, ready,
    login, logout, addCase, updateCase, deleteCase, addMasterCase, updateMasterCase, deleteMasterCase,
    saveUsers, saveUnits, saveSheetsConfig, syncToSheets, exportCSV,
    getCurrentRotUnit, advanceRotation, setRotIndex,
    autoGenerateNumber, advanceNumberConfig, saveNumberConfig,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}

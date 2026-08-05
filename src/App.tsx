import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, Pencil, Trash2, Plus, Check,
  X, AlertCircle, ListPlus, Copy, Settings, Star,
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc, getDocs, query, orderBy,
} from 'firebase/firestore';

// ─── Firebase ────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDPDveN7NF_qcq8iBlGm5B4o_tZN670KW8",
  authDomain: "todo-e6d0a.firebaseapp.com",
  projectId: "todo-e6d0a",
  storageBucket: "todo-e6d0a.firebasestorage.app",
  messagingSenderId: "698521387513",
  appId: "1:698521387513:web:bee5bbfe398f98ad207d28",
  measurementId: "G-Y3W7W5EB1N"
};
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(firebaseApp);

const PIN = '3270';
const MAX_ITEM_LEN   = 500;   // characters per item
const MAX_LIST_NAME  = 60;    // characters for a list name
const ERROR_AUTO_DISMISS_MS = 6000;

// ─── Types ───────────────────────────────────────────────────────────────────
interface ProblemNode { id: string; text: string; completed: boolean; order: number; }
interface ProblemList { id: string; name: string; createdAt: number; isFavorite?: boolean; }

type SheetKind =
  | { kind: 'none' }
  | { kind: 'addItem' }
  | { kind: 'editItem'; node: ProblemNode }
  | { kind: 'manageLists' }
  | { kind: 'bulkImport' }
  | { kind: 'settings' }
  | { kind: 'confirm'; label: string; onConfirm: () => void };

  // Helper to organize lists into sections (Pinned, Today, Yesterday, This Week, etc.)
  const toTitleCase = (str: string): string => {
    const trimmed = str.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  };

const fmt = (raw: string, allowBullets: boolean = true): string =>
  raw.split('\n').map((line, i) => {
    const t = line.trim();
    if (!t) return '';
    const c = t.replace(/^-\s*/, '');
    const titled = toTitleCase(c);
    return i === 0 ? titled : (allowBullets ? `- ${titled}` : titled);
  }).join('\n');

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────
const Sheet: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode }> =
  ({ open, onClose, title, children }) => (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 transition-all duration-300 ${open ? 'bg-black/20 pointer-events-auto' : 'bg-transparent pointer-events-none'}`}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ background: '#ffffff', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-[5px] rounded-full bg-[#d1d1d6]" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #e5e5e5' }}>
          <span className="text-black font-bold text-[18px] tracking-tight">{title}</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors active:opacity-60"
            style={{ background: '#f0f0f0' }}
          >
            <X size={15} strokeWidth={2.5} className="text-[#636366]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>
  );

// ─── App ──────────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const [lists, setLists]             = useState<ProblemList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'home' | 'list'>('home');
  const [nodes, setNodes]             = useState<ProblemNode[]>([]);
  const [sheet, setSheet]             = useState<SheetKind>({ kind: 'none' });
  const [loading, setLoading]         = useState(true);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Settings toggles
  const [showCheckButton, setShowCheckButton] = useState(false);
  const [allowBulletPoints, setAllowBulletPoints] = useState(true);

  // Sheet form state
  const [itemInput, setItemInput]         = useState('');
  const [bulkInput, setBulkInput]         = useState('');
  const [editText, setEditText]           = useState('');
  const [newListName, setNewListName]     = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState('');

  const nodesUnsubRef   = useRef<(() => void) | null>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const itemInputRef    = useRef<HTMLTextAreaElement>(null);
  const isBusy          = useRef(false);
  const errorTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeSheet = () => setSheet({ kind: 'none' });

  const showError = (msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setError(msg);
    errorTimerRef.current = setTimeout(() => setError(null), ERROR_AUTO_DISMISS_MS);
  };

  const submitPin = (value: string) => {
    if (value === PIN) {
      setIsUnlocked(true);
      setPinInput('');
      setPinError(false);
    } else {
      setPinInput('');
      setPinError(true);
      setTimeout(() => setPinError(false), 1000);
    }
  };

  const addPinDigit = (digit: string) => {
    if (pinInput.length >= 4) return;
    const next = pinInput + digit;
    setPinInput(next);
    if (next.length === 4) submitPin(next);
  };

  const removePinDigit = () => {
    setPinInput(v => v.slice(0, -1));
  };

  // ── Firebase: lists ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'lists'), orderBy('createdAt', 'asc')),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProblemList));
        setLists(data);
        setActiveListId(prev => (prev && data.find(l => l.id === prev)) ? prev : (data[0]?.id ?? null));
        setLoading(false);
      },
      err => { showError(err.message); setLoading(false); }
    );
    return () => unsub();
  }, []);

  // ── Firebase: nodes ──────────────────────────────────────────────────
  useEffect(() => {
    nodesUnsubRef.current?.();
    nodesUnsubRef.current = null;
    if (!activeListId) { setNodes([]); return; }
    setNodesLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'lists', activeListId, 'nodes'), orderBy('order', 'asc')),
      snap => { setNodes(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProblemNode))); setNodesLoading(false); },
      err  => { showError(err.message); setNodesLoading(false); }
    );
    nodesUnsubRef.current = unsub;
    return () => unsub();
  }, [activeListId]);

  // Auto-resize textareas
  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  useEffect(() => autoResize(textareaRef.current), [editText]);
  useEffect(() => autoResize(itemInputRef.current), [itemInput]);

  // Auto-focus on sheet open
  useEffect(() => {
    if (sheet.kind === 'addItem')   setTimeout(() => itemInputRef.current?.focus(), 350);
    if (sheet.kind === 'editItem')  { setEditText(sheet.node.text); setTimeout(() => textareaRef.current?.focus(), 350); }
  }, [sheet.kind]);

  useEffect(() => {
    if (isUnlocked) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) addPinDigit(e.key);
      if (e.key === 'Backspace') removePinDigit();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isUnlocked, pinInput]);

  // ── CRUD: lists ──────────────────────────────────────────────────────
  const createList = async () => {
    const name = toTitleCase(newListName.trim().slice(0, MAX_LIST_NAME));
    if (!name || isBusy.current) return;
    isBusy.current = true;
    try {
      const ref = await addDoc(collection(db, 'lists'), { name, createdAt: Date.now() });
      setActiveListId(ref.id);
      setNewListName('');
    } catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  const deleteList = async (id: string) => {
    if (!id || isBusy.current) return;
    isBusy.current = true;
    try {
      const snap = await getDocs(collection(db, 'lists', id, 'nodes'));
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'lists', id));
    } catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  const saveListName = async (id: string) => {
    const name = toTitleCase(editingListName.trim().slice(0, MAX_LIST_NAME));
    if (!name || isBusy.current) return;
    isBusy.current = true;
    try { await updateDoc(doc(db, 'lists', id), { name }); setEditingListId(null); }
    catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  const moveList = async (index: number, dir: 'up' | 'down') => {
    const ti = dir === 'up' ? index - 1 : index + 1;
    if (ti < 0 || ti >= lists.length || isBusy.current) return;
    isBusy.current = true;
    const [a, b] = [lists[index], lists[ti]];
    try {
      await updateDoc(doc(db, 'lists', a.id), { createdAt: b.createdAt });
      await updateDoc(doc(db, 'lists', b.id), { createdAt: a.createdAt });
    } catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  const toggleFavorite = async (id: string) => {
    if (!id || isBusy.current) return;
    isBusy.current = true;
    const list = lists.find(l => l.id === id);
    if (!list) return;
    try {
      await updateDoc(doc(db, 'lists', id), { isFavorite: !list.isFavorite });
    } catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  // ── CRUD: nodes ──────────────────────────────────────────────────────
  const addNode = async () => {
    const text = fmt(itemInput.trim().slice(0, MAX_ITEM_LEN), allowBulletPoints);
    if (!text || !activeListId || isBusy.current) return;
    isBusy.current = true;
    const minOrder = nodes.length > 0 ? Math.min(...nodes.map(n => n.order)) : 0;
    try {
      await addDoc(collection(db, 'lists', activeListId, 'nodes'), {
        text, completed: false, order: minOrder - 1,
      });
      setItemInput(''); closeSheet();
    } catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  const bulkImportNodes = async () => {
    if (!activeListId || isBusy.current || !bulkInput.trim()) return;
    isBusy.current = true;
    
    const lines = bulkInput.split('\n').filter(line => line.trim() !== '');
    
    try {
      let currentMinOrder = nodes.length > 0 ? Math.min(...nodes.map(n => n.order)) : 0;
      
      for (let i = 0; i < lines.length; i++) {
        await addDoc(collection(db, 'lists', activeListId, 'nodes'), {
          text: lines[i].trim(),
          completed: false,
          order: currentMinOrder - 1 - i,
        });
      }
      
      setBulkInput(''); 
      closeSheet();
    } catch (e: any) { 
      showError(e.message); 
    } finally { 
      isBusy.current = false; 
    }
  };

  const saveEdit = async () => {
    if (sheet.kind !== 'editItem' || !activeListId || isBusy.current) return;
    const text = fmt(editText.trim().slice(0, MAX_ITEM_LEN), allowBulletPoints);
    if (!text) return;
    isBusy.current = true;
    try {
      await updateDoc(doc(db, 'lists', activeListId, 'nodes', sheet.node.id), { text });
      closeSheet();
    } catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  const toggleComplete = async (node: ProblemNode) => {
    if (!activeListId || isBusy.current) return;
    isBusy.current = true;
    const nowCompleted = !node.completed;
    let newOrder: number;
    if (nowCompleted) {
      newOrder = nodes.length > 0 ? Math.max(...nodes.map(n => n.order)) + 1 : 0;
    } else {
      const incompleteOrders = nodes.filter(n => !n.completed && n.id !== node.id).map(n => n.order);
      newOrder = incompleteOrders.length > 0 ? Math.max(...incompleteOrders) + 1 : Math.min(...nodes.map(n => n.order)) - 1;
    }
    try {
      await updateDoc(doc(db, 'lists', activeListId, 'nodes', node.id), {
        completed: nowCompleted,
        order: newOrder,
      });
    }
    catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  const deleteNode = async (id: string) => {
    if (!activeListId || !id || isBusy.current) return;
    isBusy.current = true;
    try { await deleteDoc(doc(db, 'lists', activeListId, 'nodes', id)); }
    catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  const moveNode = async (index: number, dir: 'up' | 'down') => {
    if (!activeListId || isBusy.current) return;
    const ti = dir === 'up' ? index - 1 : index + 1;
    if (ti < 0 || ti >= nodes.length) return;
    isBusy.current = true;
    const [a, b] = [nodes[index], nodes[ti]];
    try {
      await updateDoc(doc(db, 'lists', activeListId, 'nodes', a.id), { order: b.order });
      await updateDoc(doc(db, 'lists', activeListId, 'nodes', b.id), { order: a.order });
    } catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  const moveNodeToTop = async (node: ProblemNode) => {
    if (!activeListId || isBusy.current) return;
    isBusy.current = true;
    const minOrder = nodes.length > 0 ? Math.min(...nodes.map(n => n.order)) : 0;
    try {
      await updateDoc(doc(db, 'lists', activeListId, 'nodes', node.id), { order: minOrder - 1 });
    } catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  const moveNodeToBottom = async (node: ProblemNode) => {
    if (!activeListId || isBusy.current) return;
    isBusy.current = true;
    const maxOrder = nodes.length > 0 ? Math.max(...nodes.map(n => n.order)) : 0;
    try {
      await updateDoc(doc(db, 'lists', activeListId, 'nodes', node.id), { order: maxOrder + 1 });
    } catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  const copyItemText = async (text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      showError('✓ Item copied!');
    } else {
      showError('Failed to copy');
    }
  };

  const copyThisList = async () => {
    if (nodes.length === 0) {
      showError('No items to copy');
      return;
    }
    const listText = `${activeList?.name}:\n\n${nodes.map(n => n.text).join('\n')}`;
    const success = await copyToClipboard(listText);
    if (success) {
      showError('✓ List copied!');
    } else {
      showError('Failed to copy');
    }
  };

  const copyAllLists = async () => {
    if (lists.length === 0) {
      showError('No lists to copy');
      return;
    }
    try {
      const allListsText = await Promise.all(
        lists.map(async (list) => {
          const querySnapshot = await getDocs(query(collection(db, 'lists', list.id, 'nodes'), orderBy('order', 'asc')));
          const listItems = querySnapshot.docs.map(d => d.data().text);
          if (listItems.length === 0) return null;
          return `${list.name}:\n${listItems.join('\n')}`;
        })
      ).then(results => results.filter(Boolean).join('\n\n---\n\n'));
      
      if (!allListsText) {
        showError('No items to copy');
        return;
      }
      const success = await copyToClipboard(allListsText);
      if (success) {
        showError('✓ All lists copied!');
      } else {
        showError('Failed to copy');
      }
    } catch (e: any) {
      showError('Error copying lists');
    }
  };

  const clearWorkspace = async () => {
    if (!activeListId || isBusy.current) return;
    isBusy.current = true;
    try { await Promise.all(nodes.map(n => deleteDoc(doc(db, 'lists', activeListId, 'nodes', n.id)))); }
    catch (e: any) { showError(e.message); }
    finally { isBusy.current = false; }
  };

  // Sync active list with view
  useEffect(() => {
    if (!activeListId) {
      setCurrentView('home');
    }
  }, [activeListId]);

  // ── Render node text ─────────────────────────────────────────────────
  const renderText = (text: string) =>
    text.split('\n').map((line, i) => {
      if (i === 0) return <div key={i} className="text-black font-semibold text-[16px] leading-snug text-left">{line}</div>;
      const content = line.trim().startsWith('-') ? line.replace(/^-\s*/, '') : line;
      return (
        <div key={i} className={`flex items-start mt-1.5 ${!allowBulletPoints ? 'ml-0' : ''}`}>
          {allowBulletPoints && <span className="text-[#636366] mr-2 text-[14px] leading-relaxed select-none">–</span>}
          <span className="text-[#636366] text-[14px] leading-relaxed flex-1 text-left">{content}</span>
        </div>
      );
    });

  const activeList = lists.find(l => l.id === activeListId);
  const openCount  = nodes.filter(n => !n.completed).length;

  // ─────────────────────────────────────────────────────────────────────

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <h1 className="text-black text-3xl font-bold mb-8">Enter PIN</h1>

        <div className="flex gap-4 mb-8">
          {[0,1,2,3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full ${i < pinInput.length ? 'bg-[#0a84ff]' : 'bg-[#d1d1d6]'}`} />
          ))}
        </div>

        {pinError && <div className="text-[#ff453a] mb-6 font-semibold">Incorrect PIN</div>}

        <input type="text" autoFocus inputMode="none" readOnly className="absolute opacity-0 pointer-events-none" />

        <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
          {[1,2,3,4,5,6,7,8,9].map(num => (
            <button key={num} onClick={() => addPinDigit(String(num))}
              className="h-16 rounded-2xl bg-[#f0f0f0] text-black text-2xl font-bold">
              {num}
            </button>
          ))}
          <button onClick={() => { setPinInput(''); setPinError(false); }}
            className="h-16 rounded-2xl bg-[#f0f0f0] text-black text-xl font-bold">C</button>
          <button onClick={() => addPinDigit('0')}
            className="h-16 rounded-2xl bg-[#f0f0f0] text-black text-2xl font-bold">0</button>
          <button onClick={removePinDigit}
            className="h-16 rounded-2xl bg-[#f0f0f0] text-[#ff453a] text-xl font-bold">⌫</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white antialiased"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}>

      {/* Error/Success bar */}
      {error && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex items-center gap-2 px-4 py-3"
          style={{ 
            background: error.startsWith('✓') ? '#34C759' : '#ff3b30',
            paddingTop: 'max(env(safe-area-inset-top), 12px)' 
          }}>
          <AlertCircle size={14} className="text-white flex-shrink-0" />
          <span className="text-white text-[13px] font-medium flex-1">{error}</span>
          <button onClick={() => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current); setError(null); }} className="text-white/70 text-[13px] font-semibold">✕</button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-white"
        style={{ paddingTop: 'env(safe-area-inset-top)', borderBottom: '1px solid #e5e5e5' }}>

        {currentView === 'home' ? (
          // Home header
          <div className="px-4 py-3 md:px-5 md:pt-5 md:pb-3">
            <div className="flex items-start justify-between gap-3 mb-1 md:mb-2">
              <div>
                <h1 className="text-black text-[24px] md:text-[32px] font-bold tracking-tight leading-none">
                  All Lists
                </h1>
                <p className="text-[#636366] text-[12px] md:text-[14px] font-medium mt-0.5 md:mt-1">
                  {lists.length} {lists.length === 1 ? 'list' : 'lists'}
                </p>
              </div>
              {lists.length > 0 && (
                <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                  <button
                    onClick={copyAllLists}
                    className="px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[#30d158] text-[12px] md:text-[14px] font-semibold active:opacity-60 transition-opacity flex items-center gap-1"
                    style={{ background: '#30d15820' }}
                  >
                    <Copy size={12} strokeWidth={2.5} />
                    <span className="hidden sm:inline">Copy All</span>
                  </button>
                  <button
                    onClick={() => setSheet({ kind: 'manageLists' })}
                    className="px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[#0a84ff] text-[12px] md:text-[14px] font-semibold active:opacity-60 transition-opacity"
                    style={{ background: '#0a84ff18' }}
                  >
                    + Add
                  </button>
                </div>
              )}
            </div>
            {!lists.length && (
              <button
                onClick={() => setSheet({ kind: 'manageLists' })}
                className="px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[#0a84ff] text-[12px] md:text-[14px] font-semibold active:opacity-60 transition-opacity"
                style={{ background: '#0a84ff18' }}
              >
                + Add List
              </button>
            )}
          </div>
        ) : (
          // List view header
          <>
            <div className="flex flex-col px-4 py-3 md:px-5 md:pt-5 md:pb-3 gap-2 md:gap-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCurrentView('home')}
                  className="text-[#0a84ff] text-[14px] md:text-[16px] font-semibold active:opacity-60"
                >
                  ← Back
                </button>
                <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                  <button
                    onClick={() => setSheet({ kind: 'settings' })}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-[#636366] active:opacity-60 transition-opacity"
                    style={{ background: '#e5e5e5' }}
                  >
                    <Settings size={18} strokeWidth={2} />
                  </button>
                  {activeListId && nodes.length > 0 && (
                    <button
                      onClick={copyThisList}
                      className="px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[#30d158] text-[12px] md:text-[14px] font-semibold active:opacity-60 transition-opacity flex items-center gap-1"
                      style={{ background: '#30d15820' }}
                    >
                      <Copy size={12} strokeWidth={2.5} />
                      <span className="hidden sm:inline">Copy</span>
                    </button>
                  )}
                  <button
                    onClick={() => { setBulkInput(''); setSheet({ kind: 'bulkImport' }); }}
                    className="px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[#30d158] text-[12px] md:text-[14px] font-semibold active:opacity-60 transition-opacity flex items-center gap-1"
                    style={{ background: '#30d15820' }}
                  >
                    <ListPlus size={12} strokeWidth={2.5} />
                    <span className="hidden sm:inline">Import</span>
                  </button>
                  <button
                    onClick={() => { setItemInput(''); setSheet({ kind: 'addItem' }); }}
                    className="px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[#0a84ff] text-[12px] md:text-[14px] font-semibold active:opacity-60 transition-opacity"
                    style={{ background: '#0a84ff18' }}
                  >
                    + Add
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[#636366] text-[11px] md:text-[12px] font-semibold tracking-widest uppercase mb-0.5 md:mb-1">
                  {loading ? '' : `${openCount} open`}
                </p>
                <h1 className="text-black text-[24px] md:text-[32px] font-bold tracking-tight leading-none">
                  {activeList?.name ?? 'Solver'}
                </h1>
              </div>
            </div>
          </>
        )}

        <div className="h-px" style={{ background: '#e5e5e5' }} />
      </div>

      {/* ── Main Content ── */}
      <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 110px)' }}>

        {/* HOME VIEW */}
        {currentView === 'home' && (
          <div>
            {loading && (
              <div className="flex justify-center py-20">
                <div className="w-7 h-7 rounded-full border-2 border-[#e5e5e5] border-t-[#0a84ff] animate-spin" />
              </div>
            )}

            {!loading && lists.length === 0 && (
              <div className="flex flex-col items-center py-24 px-8 text-center">
                <ListPlus size={44} strokeWidth={1} className="text-[#d1d1d6] mb-5" />
                <p className="text-[#636366] text-[16px] mb-4">No lists yet</p>
                <button
                  onClick={() => setSheet({ kind: 'manageLists' })}
                  className="px-6 py-3 rounded-2xl text-[#0a84ff] text-[16px] font-semibold active:opacity-70"
                  style={{ background: '#0a84ff18' }}
                >
                  Create a list
                </button>
              </div>
            )}

            {!loading && lists.length > 0 && (
              <div className="px-5 py-4">
                {[...lists].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0)).map((list) => (
                  <button
                    key={list.id}
                    onClick={() => { setActiveListId(list.id); setCurrentView('list'); }}
                    className="w-full text-left mb-3 p-4 rounded-3xl transition-all active:scale-95 flex items-start justify-between gap-3"
                    style={{ background: '#f0f0f0' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-black text-[18px] flex items-center gap-2">
                        {list.name}
                        {list.isFavorite && <Star size={16} className="text-[#FFD700] fill-[#FFD700] flex-shrink-0" strokeWidth={2} />}
                      </div>
                      <div className="text-[#636366] text-[13px] mt-1">
                        {list.createdAt ? new Date(list.createdAt).toLocaleDateString() : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LIST VIEW */}
        {currentView === 'list' && (
          <>
            {/* Loading */}
            {nodesLoading && (
              <div className="flex justify-center py-20">
                <div className="w-7 h-7 rounded-full border-2 border-[#e5e5e5] border-t-[#0a84ff] animate-spin" />
              </div>
            )}

            {/* Empty states */}
            {!nodesLoading && activeListId && nodes.length === 0 && (
              <div className="flex flex-col items-center py-24 text-center">
                <p className="text-[#636366] text-[16px]">Nothing here</p>
                <p className="text-[#636366] text-[14px] mt-1">Tap Add to create your first item</p>
              </div>
            )}

            {/* Nodes */}
            {!nodesLoading && nodes.map((node, index) => (
          <div key={node.id} className="mx-4 mt-3 rounded-3xl overflow-hidden"
            style={{ background: node.completed ? '#f5f5f5' : '#ffffff', border: '1px solid #e5e5e5' }}>

            {/* Content row */}
            <div className="flex items-start px-4 pt-4 pb-3 gap-3">
              {/* Checkmark - conditional */}
              {showCheckButton && (
                <button
                  onClick={() => toggleComplete(node)}
                  className={`flex-shrink-0 mt-0.5 w-[26px] h-[26px] rounded-full border-2 flex items-center justify-center transition-all active:scale-90 ${
                    node.completed ? 'border-[#30d158] bg-[#30d158]' : 'border-[#d1d1d6] bg-transparent'
                  }`}
                >
                  {node.completed && <Check size={14} strokeWidth={3} className="text-black" />}
                </button>
              )}

              {/* Text */}
              <div className={`flex-1 min-w-0 pt-0.5 text-left ${node.completed ? 'opacity-25' : ''}`}>
                {renderText(node.text)}
              </div>
            </div>

            {/* Action bar */}
            <div className="flex items-stretch" style={{ borderTop: '1px solid #e5e5e5' }}>
              {[
                { icon: <ChevronsUp size={19} strokeWidth={2} />,  action: () => moveNodeToTop(node),     disabled: index === 0,              color: '#636366' },
                { icon: <ChevronUp size={19} strokeWidth={2} />,   action: () => moveNode(index, 'up'),   disabled: index === 0,              color: '#636366' },
                { icon: <ChevronDown size={19} strokeWidth={2} />, action: () => moveNode(index, 'down'), disabled: index === nodes.length - 1, color: '#636366' },
                { icon: <ChevronsDown size={19} strokeWidth={2} />, action: () => moveNodeToBottom(node), disabled: index === nodes.length - 1, color: '#636366' },
                { icon: <Copy size={16} strokeWidth={2} />,        action: () => copyItemText(node.text), disabled: false, color: '#30d158' },
                { icon: <Pencil size={16} strokeWidth={2} />,      action: () => setSheet({ kind: 'editItem', node }), disabled: false, color: '#0a84ff' },
                {
                  icon: <Trash2 size={16} strokeWidth={2} />,
                  action: () => setSheet({ kind: 'confirm', label: 'Delete this item?', onConfirm: () => { deleteNode(node.id); closeSheet(); } }),
                  disabled: false, color: '#ff453a'
                },
              ].map((btn, i, arr) => (
                <React.Fragment key={i}>
                  <button
                    onClick={btn.action}
                    disabled={btn.disabled}
                    className="flex-1 flex items-center justify-center py-3.5 active:opacity-40 disabled:opacity-15 transition-opacity"
                    style={{ color: btn.color }}
                  >
                    {btn.icon}
                  </button>
                  {i < arr.length - 1 && (
                    <div className="w-px self-stretch my-2" style={{ background: '#e5e5e5' }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}

        {/* Clear workspace */}
        {nodes.length > 0 && (
          <div className="flex justify-center mt-8">
            <button
              onClick={() => setSheet({
                kind: 'confirm',
                label: 'Clear all items in this list?',
                onConfirm: () => { clearWorkspace(); closeSheet(); }
              })}
              className="px-5 py-2.5 rounded-2xl text-[#ff453a] text-[14px] font-semibold active:opacity-60"
              style={{ background: '#ff453a18' }}
            >
              Clear workspace
            </button>
          </div>
        )}
          </>
        )}
      </div>

      {/* ════ BOTTOM SHEETS ══════════════════════════════════════════════ */}

      {/* Add Item */}
      <Sheet open={sheet.kind === 'addItem'} onClose={closeSheet} title="New Item">
        <div className="px-5 py-4 flex flex-col gap-4">
          <textarea
            ref={itemInputRef}
            className="w-full text-black placeholder-[#636366] text-[16px] rounded-2xl px-4 py-4 focus:outline-none resize-none leading-relaxed"
            style={{ background: '#f0f0f0', minHeight: 110 }}
            placeholder={allowBulletPoints ? "Title on first line…\n- Sub-point\n- Sub-point" : "Title on first line…\nSub-point\nSub-point"}
            value={itemInput}
            onChange={e => setItemInput(e.target.value.slice(0, MAX_ITEM_LEN))}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const cur = e.currentTarget.selectionStart;
                const bullet = allowBulletPoints ? '- ' : '';
                setItemInput(v => v.substring(0, cur) + '\n' + bullet + v.substring(cur));
              }
            }}
            spellCheck="true"
          />
          <div className="text-right text-[12px] text-[#a3a3a7] -mt-2">
            {itemInput.length}/{MAX_ITEM_LEN}
          </div>
          <button
            onClick={addNode}
            disabled={!itemInput.trim()}
            className="w-full py-4 rounded-2xl text-white text-[17px] font-bold active:opacity-80 disabled:opacity-25 transition-opacity"
            style={{ background: '#0a84ff' }}
          >
            Add Item
          </button>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      </Sheet>

      {/* Bulk Import */}
      <Sheet open={sheet.kind === 'bulkImport'} onClose={closeSheet} title="Bulk Import">
        <div className="px-5 py-4 flex flex-col gap-4">
          <textarea
            className="w-full text-black placeholder-[#636366] text-[16px] rounded-2xl px-4 py-4 focus:outline-none resize-none leading-relaxed"
            style={{ background: '#f0f0f0', minHeight: 200 }}
            placeholder="Paste your CSS or list here..."
            value={bulkInput}
            onChange={e => setBulkInput(e.target.value)}
            spellCheck="false"
          />
          <button
            onClick={bulkImportNodes}
            disabled={!bulkInput.trim()}
            className="w-full py-4 rounded-2xl text-white text-[17px] font-bold active:opacity-80 disabled:opacity-25 transition-opacity"
            style={{ background: '#30d158' }}
          >
            Import Items
          </button>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      </Sheet>

      {/* Edit Item */}
      <Sheet open={sheet.kind === 'editItem'} onClose={closeSheet} title="Edit Item">
        <div className="px-5 py-4 flex flex-col gap-4">
          <textarea
            ref={textareaRef}
            className="w-full text-black placeholder-[#636366] text-[16px] rounded-2xl px-4 py-4 focus:outline-none resize-none leading-relaxed"
            style={{ background: '#f0f0f0', minHeight: 120 }}
            value={editText}
            onChange={e => setEditText(e.target.value.slice(0, MAX_ITEM_LEN))}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const cur = e.currentTarget.selectionStart;
                const bullet = allowBulletPoints ? '- ' : '';
                setEditText(v => v.substring(0, cur) + '\n' + bullet + v.substring(cur));
              }
            }}
            spellCheck="true"
          />
          <div className="text-right text-[12px] text-[#a3a3a7] -mt-2">
            {editText.length}/{MAX_ITEM_LEN}
          </div>
          <button
            onClick={saveEdit}
            disabled={!editText.trim()}
            className="w-full py-4 rounded-2xl text-white text-[17px] font-bold active:opacity-80 disabled:opacity-25 transition-opacity"
            style={{ background: '#0a84ff' }}
          >
            Save Changes
          </button>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      </Sheet>

      {/* Manage Lists */}
      <Sheet
        open={sheet.kind === 'manageLists'}
        onClose={() => { closeSheet(); setEditingListId(null); setNewListName(''); }}
        title="Manage Lists"
      >
        <div className="px-5 py-4">
          {/* Create */}
          <div className="flex gap-2 mb-5">
            <input
              className="flex-1 text-black placeholder-[#636366] text-[16px] rounded-2xl px-4 py-3.5 focus:outline-none"
              style={{ background: '#f0f0f0' }}
              placeholder="New list name…"
              value={newListName}
              onChange={e => setNewListName(e.target.value.slice(0, MAX_LIST_NAME))}
              onKeyDown={e => e.key === 'Enter' && createList()}
              spellCheck="true"
            />
            <button
              onClick={createList}
              disabled={!newListName.trim()}
              className="w-[54px] h-[54px] rounded-2xl flex items-center justify-center active:opacity-70 disabled:opacity-25"
              style={{ background: '#0a84ff' }}
            >
              <Plus size={22} strokeWidth={2.5} className="text-white" />
            </button>
          </div>

          {/* List of lists */}
          {lists.length === 0 && (
            <p className="text-[#636366] text-[15px] text-center py-6">No lists yet.</p>
          )}
          <div className="rounded-2xl overflow-hidden" style={{ background: '#f0f0f0' }}>
            {lists.map((list, i) => (
              <div key={list.id}>
                {i > 0 && <div className="h-px mx-4" style={{ background: '#e5e5e5' }} />}
                <div className="flex items-center px-4 py-3 gap-3">
                  {editingListId === list.id ? (
                    <>
                      <input
                        className="flex-1 text-black text-[15px] rounded-xl px-3 py-2 focus:outline-none"
                        style={{ background: '#ffffff' }}
                        value={editingListName}
                        onChange={e => setEditingListName(e.target.value.slice(0, MAX_LIST_NAME))}
                        onKeyDown={e => { if (e.key === 'Enter') saveListName(list.id); if (e.key === 'Escape') setEditingListId(null); }}
                        autoFocus
                        spellCheck="true"
                      />
                      <button onClick={() => saveListName(list.id)} className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70" style={{ background: '#30d15820' }}>
                        <Check size={16} strokeWidth={2.5} className="text-[#30d158]" />
                      </button>
                      <button onClick={() => setEditingListId(null)} className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70" style={{ background: '#e5e5e5' }}>
                        <X size={15} strokeWidth={2.5} className="text-[#636366]" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setActiveListId(list.id); closeSheet(); setEditingListId(null); }}
                        className="flex-1 flex items-center gap-3 text-left active:opacity-60"
                      >
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${activeListId === list.id ? 'bg-[#0a84ff]' : 'bg-[#d1d1d6]'}`} />
                        <span className="text-black text-[16px] font-medium truncate">{list.name}</span>
                      </button>
                      <button
                        onClick={() => moveList(i, 'up')}
                        disabled={i === 0}
                        className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70 disabled:opacity-15"
                        style={{ background: '#e5e5e5' }}
                      >
                        <ChevronUp size={15} strokeWidth={2.5} className="text-[#636366]" />
                      </button>
                      <button
                        onClick={() => moveList(i, 'down')}
                        disabled={i === lists.length - 1}
                        className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70 disabled:opacity-15"
                        style={{ background: '#e5e5e5' }}
                      >
                        <ChevronDown size={15} strokeWidth={2.5} className="text-[#636366]" />
                      </button>
                      <button
                        onClick={() => toggleFavorite(list.id)}
                        className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70"
                        style={{ background: list.isFavorite ? '#FFD70018' : '#e5e5e5' }}
                      >
                        <Star size={14} strokeWidth={2.5} className={list.isFavorite ? 'text-[#FFD700] fill-[#FFD700]' : 'text-[#636366]'} />
                      </button>
                      <button
                        onClick={() => { setEditingListId(list.id); setEditingListName(list.name); }}
                        className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70"
                        style={{ background: '#e5e5e5' }}
                      >
                        <Pencil size={14} strokeWidth={2.5} className="text-[#636366]" />
                      </button>
                      <button
                        onClick={() => setSheet({
                          kind: 'confirm',
                          label: `Delete "${list.name}" and all its items?`,
                          onConfirm: () => { deleteList(list.id); closeSheet(); },
                        })}
                        className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70"
                        style={{ background: '#e5e5e5' }}
                      >
                        <Trash2 size={14} strokeWidth={2.5} className="text-[#ff453a]" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      </Sheet>

      {/* Settings */}
      <Sheet open={sheet.kind === 'settings'} onClose={closeSheet} title="Settings">
        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="rounded-2xl overflow-hidden" style={{ background: '#f0f0f0' }}>
            {/* Show Check Button Toggle */}
            <div className="flex items-center justify-between px-4 py-4">
              <div>
                <p className="text-black text-[16px] font-semibold">Check Button</p>
                <p className="text-[#636366] text-[13px] mt-1">Mark items complete</p>
              </div>
              <button
                onClick={() => setShowCheckButton(!showCheckButton)}
                className={`w-[52px] h-[32px] rounded-full flex items-center transition-all ${
                  showCheckButton ? 'bg-[#30d158]' : 'bg-[#e5e5e5]'
                }`}
              >
                <div
                  className={`w-[28px] h-[28px] rounded-full bg-white transition-transform ${
                    showCheckButton ? 'translate-x-[20px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>

            <div className="h-px mx-4" style={{ background: '#e5e5e5' }} />

            {/* Allow Bullet Points Toggle */}
            <div className="flex items-center justify-between px-4 py-4">
              <div>
                <p className="text-black text-[16px] font-semibold">Bullet Points</p>
                <p className="text-[#636366] text-[13px] mt-1">Auto add "- " on new line</p>
              </div>
              <button
                onClick={() => setAllowBulletPoints(!allowBulletPoints)}
                className={`w-[52px] h-[32px] rounded-full flex items-center transition-all ${
                  allowBulletPoints ? 'bg-[#30d158]' : 'bg-[#e5e5e5]'
                }`}
              >
                <div
                  className={`w-[28px] h-[28px] rounded-full bg-white transition-transform ${
                    allowBulletPoints ? 'translate-x-[20px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>
          </div>

          <p className="text-[#636366] text-[13px] px-1 leading-relaxed">
            💡 <strong>Check Button:</strong> When enabled, tap the circle to mark items complete. When disabled, use the edit or action buttons instead.
          </p>

          <p className="text-[#636366] text-[13px] px-1 leading-relaxed">
            💡 <strong>Bullet Points:</strong> When enabled, pressing Enter auto-adds "- " for sub-items. When disabled, pressing Enter adds plain text lines.
          </p>

          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      </Sheet>

      {/* Confirm */}
      <Sheet open={sheet.kind === 'confirm'} onClose={closeSheet} title="Confirm">
        {sheet.kind === 'confirm' && (
          <div className="px-5 py-6 flex flex-col gap-3">
            <p className="text-[#636366] text-[16px] text-center pb-2">{sheet.label}</p>
            <button
              onClick={sheet.onConfirm}
              className="w-full py-4 rounded-2xl text-[#ff453a] text-[17px] font-bold active:opacity-70"
              style={{ background: '#ff453a18' }}
            >
              Delete
            </button>
            <button
              onClick={closeSheet}
              className="w-full py-4 rounded-2xl text-white text-[17px] font-semibold active:opacity-70"
              style={{ background: '#2c2c2e' }}
            >
              Cancel
            </button>
            <div style={{ height: 'env(safe-area-inset-bottom)' }} />
          </div>
        )}
      </Sheet>
    </div>
  );
};

export default App;
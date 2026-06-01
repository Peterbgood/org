import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronUp, ChevronDown, Pencil, Trash2, Plus, Check,
  X, AlertCircle, ListPlus,
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

// ─── Types ───────────────────────────────────────────────────────────────────
interface ProblemNode { id: string; text: string; completed: boolean; order: number; }
interface ProblemList { id: string; name: string; createdAt: number; }

type SheetKind =
  | { kind: 'none' }
  | { kind: 'addItem' }
  | { kind: 'editItem'; node: ProblemNode }
  | { kind: 'manageLists' }
  | { kind: 'confirm'; label: string; onConfirm: () => void };

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (raw: string): string =>
  raw.split('\n').map((line, i) => {
    const t = line.trim();
    if (!t) return '';
    const c = t.replace(/^-\s*/, '');
    const cap = c.charAt(0).toUpperCase() + c.slice(1);
    return i === 0 ? cap : `- ${cap}`;
  }).join('\n');

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────
const Sheet: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode }> =
  ({ open, onClose, title, children }) => (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 transition-all duration-300 ${open ? 'bg-black/70 pointer-events-auto' : 'bg-transparent pointer-events-none'}`}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ background: '#1c1c1e', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-[5px] rounded-full bg-[#3a3a3c]" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #2c2c2e' }}>
          <span className="text-white font-bold text-[18px] tracking-tight">{title}</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors active:opacity-60"
            style={{ background: '#2c2c2e' }}
          >
            <X size={15} strokeWidth={2.5} className="text-[#8e8e93]" />
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
  const [nodes, setNodes]             = useState<ProblemNode[]>([]);
  const [sheet, setSheet]             = useState<SheetKind>({ kind: 'none' });
  const [loading, setLoading]         = useState(true);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Sheet form state
  const [itemInput, setItemInput]         = useState('');
  const [editText, setEditText]           = useState('');
  const [newListName, setNewListName]     = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState('');

  const nodesUnsubRef   = useRef<(() => void) | null>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const itemInputRef    = useRef<HTMLTextAreaElement>(null);

  const closeSheet = () => setSheet({ kind: 'none' });

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
      err => { setError(err.message); setLoading(false); }
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
      err  => { setError(err.message); setNodesLoading(false); }
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

  // ── CRUD: lists ──────────────────────────────────────────────────────
  const createList = async () => {
    if (!newListName.trim()) return;
    try {
      const ref = await addDoc(collection(db, 'lists'), { name: newListName.trim(), createdAt: Date.now() });
      setActiveListId(ref.id);
      setNewListName('');
    } catch (e: any) { setError(e.message); }
  };

  const deleteList = async (id: string) => {
    try {
      const snap = await getDocs(collection(db, 'lists', id, 'nodes'));
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'lists', id));
    } catch (e: any) { setError(e.message); }
  };

  const saveListName = async (id: string) => {
    if (!editingListName.trim()) return;
    try { await updateDoc(doc(db, 'lists', id), { name: editingListName.trim() }); setEditingListId(null); }
    catch (e: any) { setError(e.message); }
  };

  // ── CRUD: nodes ──────────────────────────────────────────────────────
  const addNode = async () => {
    if (!itemInput.trim() || !activeListId) return;
    const minOrder = nodes.length > 0 ? Math.min(...nodes.map(n => n.order)) : 0;
    try {
      await addDoc(collection(db, 'lists', activeListId, 'nodes'), {
        text: fmt(itemInput), completed: false, order: minOrder - 1,
      });
      setItemInput(''); closeSheet();
    } catch (e: any) { setError(e.message); }
  };

  const saveEdit = async () => {
    if (sheet.kind !== 'editItem' || !activeListId) return;
    try {
      await updateDoc(doc(db, 'lists', activeListId, 'nodes', sheet.node.id), { text: fmt(editText) });
      closeSheet();
    } catch (e: any) { setError(e.message); }
  };

  const toggleComplete = async (node: ProblemNode) => {
    if (!activeListId) return;
    try { await updateDoc(doc(db, 'lists', activeListId, 'nodes', node.id), { completed: !node.completed }); }
    catch (e: any) { setError(e.message); }
  };

  const deleteNode = async (id: string) => {
    if (!activeListId) return;
    try { await deleteDoc(doc(db, 'lists', activeListId, 'nodes', id)); }
    catch (e: any) { setError(e.message); }
  };

  const moveNode = async (index: number, dir: 'up' | 'down') => {
    if (!activeListId) return;
    const ti = dir === 'up' ? index - 1 : index + 1;
    if (ti < 0 || ti >= nodes.length) return;
    const [a, b] = [nodes[index], nodes[ti]];
    try {
      await updateDoc(doc(db, 'lists', activeListId, 'nodes', a.id), { order: b.order });
      await updateDoc(doc(db, 'lists', activeListId, 'nodes', b.id), { order: a.order });
    } catch (e: any) { setError(e.message); }
  };

  const clearWorkspace = async () => {
    if (!activeListId) return;
    try { await Promise.all(nodes.map(n => deleteDoc(doc(db, 'lists', activeListId, 'nodes', n.id)))); }
    catch (e: any) { setError(e.message); }
  };

  // ── Render node text ─────────────────────────────────────────────────
  const renderText = (text: string) =>
    text.split('\n').map((line, i) => {
      if (i === 0) return <div key={i} className="text-white font-semibold text-[16px] leading-snug">{line}</div>;
      const content = line.trim().startsWith('-') ? line.replace(/^-\s*/, '') : line;
      return (
        <div key={i} className="flex items-start mt-1.5">
          <span className="text-[#48484a] mr-2 text-[14px] leading-relaxed select-none">–</span>
          <span className="text-[#aeaeb2] text-[14px] leading-relaxed flex-1">{content}</span>
        </div>
      );
    });

  const activeList = lists.find(l => l.id === activeListId);
  const openCount  = nodes.filter(n => !n.completed).length;

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#000000] antialiased"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}>

      {/* Error bar */}
      {error && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex items-center gap-2 px-4 py-3 bg-[#ff3b30]"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
          <AlertCircle size={14} className="text-white flex-shrink-0" />
          <span className="text-white text-[13px] font-medium flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-white/70 text-[13px] font-semibold">✕</button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-[#000000]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>

        {/* Title row */}
        <div className="flex items-end justify-between px-5 pt-5 pb-2">
          <div>
            <p className="text-[#636366] text-[12px] font-semibold tracking-widest uppercase mb-1">
              {loading ? '' : `${openCount} open`}
            </p>
            <h1 className="text-white text-[32px] font-bold tracking-tight leading-none">
              {activeList?.name ?? 'Solver'}
            </h1>
          </div>
          <button
            onClick={() => { setNewListName(''); setEditingListId(null); setSheet({ kind: 'manageLists' }); }}
            className="mb-1 px-4 py-2 rounded-xl text-[#0a84ff] text-[14px] font-semibold active:opacity-60 transition-opacity"
            style={{ background: '#0a84ff18' }}
          >
            Lists
          </button>
        </div>

        {/* List pills */}
        {lists.length > 1 && (
          <div className="flex gap-2 px-5 pb-3 overflow-x-auto"
            style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' } as any}>
            {lists.map(list => (
              <button
                key={list.id}
                onClick={() => setActiveListId(list.id)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[14px] font-semibold transition-all active:scale-95 ${
                  activeListId === list.id
                    ? 'bg-white text-black'
                    : 'text-[#8e8e93]'
                }`}
                style={activeListId !== list.id ? { background: '#1c1c1e' } : {}}
              >
                {list.name}
              </button>
            ))}
          </div>
        )}

        <div className="h-px mx-5" style={{ background: '#1c1c1e' }} />
      </div>

      {/* ── Node list ── */}
      <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 110px)' }}>

        {/* Loading */}
        {nodesLoading && (
          <div className="flex justify-center py-20">
            <div className="w-7 h-7 rounded-full border-2 border-[#2c2c2e] border-t-[#636366] animate-spin" />
          </div>
        )}

        {/* Empty states */}
        {!loading && !activeListId && !nodesLoading && (
          <div className="flex flex-col items-center py-24 px-8 text-center">
            <ListPlus size={44} strokeWidth={1} className="text-[#2c2c2e] mb-5" />
            <p className="text-[#48484a] text-[16px] mb-4">No lists yet</p>
            <button
              onClick={() => setSheet({ kind: 'manageLists' })}
              className="px-6 py-3 rounded-2xl text-[#0a84ff] text-[16px] font-semibold active:opacity-70"
              style={{ background: '#0a84ff18' }}
            >
              Create a list
            </button>
          </div>
        )}

        {!nodesLoading && activeListId && nodes.length === 0 && (
          <div className="flex flex-col items-center py-24 text-center">
            <p className="text-[#3a3a3c] text-[16px]">Nothing here</p>
            <p className="text-[#2c2c2e] text-[14px] mt-1">Tap + to add your first item</p>
          </div>
        )}

        {/* Nodes */}
        {!nodesLoading && nodes.map((node, index) => (
          <div key={node.id} className="mx-4 mt-3 rounded-3xl overflow-hidden"
            style={{ background: node.completed ? '#0d0d0d' : '#1c1c1e' }}>

            {/* Content row */}
            <div className="flex items-start px-4 pt-4 pb-3 gap-3">
              {/* Checkmark */}
              <button
                onClick={() => toggleComplete(node)}
                className={`flex-shrink-0 mt-0.5 w-[26px] h-[26px] rounded-full border-2 flex items-center justify-center transition-all active:scale-90 ${
                  node.completed ? 'border-[#30d158] bg-[#30d158]' : 'border-[#3a3a3c] bg-transparent'
                }`}
              >
                {node.completed && <Check size={14} strokeWidth={3} className="text-black" />}
              </button>

              {/* Text */}
              <div className={`flex-1 min-w-0 pt-0.5 ${node.completed ? 'opacity-25' : ''}`}>
                {renderText(node.text)}
              </div>
            </div>

            {/* Action bar */}
            <div className="flex items-stretch" style={{ borderTop: '1px solid #2c2c2e' }}>
              {[
                { icon: <ChevronUp size={19} strokeWidth={2} />,   action: () => moveNode(index, 'up'),   disabled: index === 0,              color: '#636366' },
                { icon: <ChevronDown size={19} strokeWidth={2} />, action: () => moveNode(index, 'down'), disabled: index === nodes.length - 1, color: '#636366' },
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
                    <div className="w-px self-stretch my-2" style={{ background: '#2c2c2e' }} />
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
      </div>

      {/* ── FAB ── */}
      {activeListId && (
        <button
          onClick={() => { setItemInput(''); setSheet({ kind: 'addItem' }); }}
          className="fixed right-5 z-30 w-[58px] h-[58px] rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 28px)', background: '#0a84ff' }}
        >
          <Plus size={28} strokeWidth={2.5} className="text-white" />
        </button>
      )}

      {/* ════ BOTTOM SHEETS ══════════════════════════════════════════════ */}

      {/* Add Item */}
      <Sheet open={sheet.kind === 'addItem'} onClose={closeSheet} title="New Item">
        <div className="px-5 py-4 flex flex-col gap-4">
          <textarea
            ref={itemInputRef}
            className="w-full text-white placeholder-[#48484a] text-[16px] rounded-2xl px-4 py-4 focus:outline-none resize-none leading-relaxed"
            style={{ background: '#2c2c2e', minHeight: 110 }}
            placeholder={"Title on first line…\n- Sub-point\n- Sub-point"}
            value={itemInput}
            onChange={e => setItemInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const cur = e.currentTarget.selectionStart;
                setItemInput(v => v.substring(0, cur) + '\n- ' + v.substring(cur));
              }
            }}
          />
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

      {/* Edit Item */}
      <Sheet open={sheet.kind === 'editItem'} onClose={closeSheet} title="Edit Item">
        <div className="px-5 py-4 flex flex-col gap-4">
          <textarea
            ref={textareaRef}
            className="w-full text-white placeholder-[#48484a] text-[16px] rounded-2xl px-4 py-4 focus:outline-none resize-none leading-relaxed"
            style={{ background: '#2c2c2e', minHeight: 120 }}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const cur = e.currentTarget.selectionStart;
                setEditText(v => v.substring(0, cur) + '\n- ' + v.substring(cur));
              }
            }}
          />
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
              className="flex-1 text-white placeholder-[#48484a] text-[16px] rounded-2xl px-4 py-3.5 focus:outline-none"
              style={{ background: '#2c2c2e' }}
              placeholder="New list name…"
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createList()}
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
            <p className="text-[#48484a] text-[15px] text-center py-6">No lists yet.</p>
          )}
          <div className="rounded-2xl overflow-hidden" style={{ background: '#2c2c2e' }}>
            {lists.map((list, i) => (
              <div key={list.id}>
                {i > 0 && <div className="h-px mx-4" style={{ background: '#3a3a3c' }} />}
                <div className="flex items-center px-4 py-3 gap-3">
                  {editingListId === list.id ? (
                    <>
                      <input
                        className="flex-1 text-white text-[15px] rounded-xl px-3 py-2 focus:outline-none"
                        style={{ background: '#3a3a3c' }}
                        value={editingListName}
                        onChange={e => setEditingListName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveListName(list.id); if (e.key === 'Escape') setEditingListId(null); }}
                        autoFocus
                      />
                      <button onClick={() => saveListName(list.id)} className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70" style={{ background: '#30d15820' }}>
                        <Check size={16} strokeWidth={2.5} className="text-[#30d158]" />
                      </button>
                      <button onClick={() => setEditingListId(null)} className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70" style={{ background: '#3a3a3c' }}>
                        <X size={15} strokeWidth={2.5} className="text-[#8e8e93]" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setActiveListId(list.id); closeSheet(); setEditingListId(null); }}
                        className="flex-1 flex items-center gap-3 text-left active:opacity-60"
                      >
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${activeListId === list.id ? 'bg-[#0a84ff]' : 'bg-[#3a3a3c]'}`} />
                        <span className="text-white text-[16px] font-medium truncate">{list.name}</span>
                      </button>
                      <button
                        onClick={() => { setEditingListId(list.id); setEditingListName(list.name); }}
                        className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70"
                        style={{ background: '#3a3a3c' }}
                      >
                        <Pencil size={14} strokeWidth={2.5} className="text-[#8e8e93]" />
                      </button>
                      <button
                        onClick={() => setSheet({
                          kind: 'confirm',
                          label: `Delete "${list.name}" and all its items?`,
                          onConfirm: () => { deleteList(list.id); closeSheet(); },
                        })}
                        className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70"
                        style={{ background: '#3a3a3c' }}
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

      {/* Confirm */}
      <Sheet open={sheet.kind === 'confirm'} onClose={closeSheet} title="Confirm">
        {sheet.kind === 'confirm' && (
          <div className="px-5 py-6 flex flex-col gap-3">
            <p className="text-[#aeaeb2] text-[16px] text-center pb-2">{sheet.label}</p>
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
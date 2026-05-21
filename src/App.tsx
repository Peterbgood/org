import React, { useState, useEffect } from 'react';

interface ProblemNode {
  id: string;
  text: string;
  completed: boolean;
}

const App: React.FC = () => {
  const [nodes, setNodes] = useState<ProblemNode[]>(() => {
    const saved = localStorage.getItem('apple_problem_solver_nodes');
    return saved ? JSON.parse(saved) : [];
  });

  const [inputValue, setInputValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    localStorage.setItem('apple_problem_solver_nodes', JSON.stringify(nodes));
  }, [nodes]);

  const addNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    setNodes([{ id: crypto.randomUUID(), text: inputValue, completed: false }, ...nodes]);
    setInputValue('');
  };

  const deleteNode = (id: string) => setNodes(nodes.filter(n => n.id !== id));

  const toggleComplete = (id: string) => {
    setNodes(nodes.map(n => n.id === id ? { ...n, completed: !n.completed } : n));
  };

  const startEdit = (node: ProblemNode) => {
    setEditingId(node.id);
    setEditText(node.text);
  };

  const saveEdit = () => {
    setNodes(nodes.map(n => n.id === editingId ? { ...n, text: editText } : n));
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const cursorTarget = e.currentTarget.selectionStart;
      const before = editText.substring(0, cursorTarget);
      const after = editText.substring(cursorTarget);
      setEditText(before + "\n- " + after);
    }
  };

  const moveNode = (index: number, direction: 'up' | 'down') => {
    const newNodes = [...nodes];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= nodes.length) return;
    [newNodes[index], newNodes[targetIndex]] = [newNodes[targetIndex], newNodes[index]];
    setNodes(newNodes);
  };

  const renderSystemText = (text: string) => {
    const lines = text.split('\n');
    
    return lines.map((line, lineIndex) => {
      let processedLine = line;
      
      if (line.trim().startsWith('-')) {
        const bulletMatch = line.match(/^(\s*-\s*)(.*)/);
        if (bulletMatch) {
          const prefix = bulletMatch[1];
          const content = bulletMatch[2];
          const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
          processedLine = prefix + capitalizedContent;
        }
      }

      return (
        <div key={lineIndex} className="min-h-[1.25rem]">
          {processedLine.split(/(\-\s)/g).map((part, i) => 
            part === '- ' 
              ? <span key={i} className="text-neutral-400 font-semibold mr-1">- </span> 
              : <span key={i}>{part}</span>
          )}
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-neutral-900 py-6 px-4 font-sans antialiased selection:bg-neutral-200">
      <div className="max-w-xl mx-auto">
        
        {/* Ultra-Condensed Apple System Header */}
        <header className="mb-3 px-1 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-900">Solver</span>
           
          
          </div>
          <span className="font-normal text-neutral-400">
            {nodes.filter(n => !n.completed).length} items open
          </span>
        </header>

        {/* Minimalist Input Module */}
        <div className="mb-4">
          <form onSubmit={addNode} className="flex bg-white border border-neutral-200 rounded-xl p-1 shadow-[0_1px_2px_rgba(0,0,0,0.02)] focus-within:ring-4 focus-within:ring-neutral-200/50 transition-all">
            <input 
              className="flex-1 bg-transparent py-1.5 px-3 focus:outline-none placeholder:text-neutral-300 text-[13px] font-normal tracking-wide text-neutral-950"
              value={inputValue} 
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="State a problem or node..."
            />
            <button className="bg-neutral-900 hover:bg-neutral-800 text-white text-[11px] font-medium px-4 rounded-lg transition-colors shadow-sm">
              Add
            </button>
          </form>
        </div>

        {/* System Stack List */}
        <div className="bg-white border border-neutral-200 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-neutral-100">
          {nodes.length === 0 && (
            <div className="text-center py-12 bg-white">
              <p className="text-xs text-neutral-300 font-normal tracking-wide">
                No diagnostic variables entered.
              </p>
            </div>
          )}

          {nodes.map((node, index) => (
            <div 
              key={node.id} 
              className="group flex flex-col justify-between p-3 transition-colors bg-white hover:bg-neutral-50/60"
            >
              {editingId === node.id ? (
                <div className="flex flex-1 flex-col gap-2 w-full">
                  <textarea 
                    className="w-full bg-neutral-50 text-neutral-900 p-2.5 rounded-xl border border-neutral-200 focus:outline-none text-[13px] font-normal tracking-wide leading-relaxed"
                    value={editText} 
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                  />
                  <div className="flex justify-end gap-3 items-center">
                    <button 
                      onClick={() => setEditingId(null)} 
                      className="text-xs font-normal text-neutral-400 hover:text-neutral-600"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={saveEdit} 
                      className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors shadow-sm"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Clean Text Grid Canvas */}
                  <div className="flex items-start flex-1 min-w-0 px-0.5">
                    <span 
                      onClick={() => toggleComplete(node.id)}
                      className={`flex-1 text-[13px] font-normal tracking-wide whitespace-pre-wrap break-words text-left leading-relaxed transition-colors cursor-pointer select-none ${
                        node.completed ? 'text-neutral-300 line-through decoration-neutral-200 font-normal' : 'text-neutral-800'
                      }`}
                    >
                      {renderSystemText(node.text)}
                    </span>
                  </div>

                  {/* Aligned Micro Action Dock */}
                  <div className="flex items-center justify-end gap-3.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 h-4 mt-1.5 pr-0.5">
                    
                    {/* Reorder Suite */}
                    <div className="flex items-center gap-1 border-r border-neutral-100 pr-3.5 h-full">
                      <button 
                        onClick={() => moveNode(index, 'up')} 
                        disabled={index === 0}
                        className="text-[11px] font-medium px-1.5 py-0.5 rounded text-neutral-400 hover:text-neutral-900 disabled:opacity-20 transition-all"
                      >
                        Up
                      </button>
                      <button 
                        onClick={() => moveNode(index, 'down')} 
                        disabled={index === nodes.length - 1}
                        className="text-[11px] font-medium px-1.5 py-0.5 rounded text-neutral-400 hover:text-neutral-900 disabled:opacity-20 transition-all"
                      >
                        Down
                      </button>
                    </div>

                    {/* Standard Modifiers */}
                    <button 
                      onClick={() => startEdit(node)}
                      className="text-[11px] font-medium text-neutral-400 hover:text-neutral-900 transition-colors"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => deleteNode(node.id)}
                      className="text-[11px] font-medium text-neutral-300 hover:text-red-500 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Subtle Footer Purge Button */}
        {nodes.length > 0 && (
          <footer className="mt-6 flex justify-center">
            <button 
              onClick={() => {
                if(confirm("Clear this configuration completely?")) setNodes([]);
              }}
              className="text-[11px] text-neutral-400 hover:text-red-500 font-medium tracking-normal py-1 px-3 bg-transparent hover:bg-neutral-100/50 rounded-lg transition-all"
            >
              Clear Workspace
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};

export default App;
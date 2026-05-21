import React, { useState, useEffect } from 'react';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

const App: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>(() => {
    const saved = localStorage.getItem('ultra_todo_list');
    return saved ? JSON.parse(saved) : [];
  });

  const [inputValue, setInputValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    localStorage.setItem('ultra_todo_list', JSON.stringify(todos));
  }, [todos]);

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    setTodos([{ id: crypto.randomUUID(), text: inputValue, completed: false }, ...todos]);
    setInputValue('');
  };

  const deleteTodo = (id: string) => setTodos(todos.filter(t => t.id !== id));

  const toggleComplete = (id: string) => {
    setTodos(todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditText(todo.text);
  };

  const saveEdit = () => {
    setTodos(todos.map(t => t.id === editingId ? { ...t, text: editText } : t));
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const cursorTarget = e.currentTarget.selectionStart;
      const before = editText.substring(0, cursorTarget);
      const after = editText.substring(cursorTarget);
      setEditText(before + "\n• " + after);
    }
  };

  const moveTodo = (index: number, direction: 'up' | 'down') => {
    const newTodos = [...todos];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= todos.length) return;
    [newTodos[index], newTodos[targetIndex]] = [newTodos[targetIndex], newTodos[index]];
    setTodos(newTodos);
  };

  // Capitalizes the first alphabetical letter following a bullet point line break
  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    
    return lines.map((line, lineIndex) => {
      let processedLine = line;
      
      if (line.trim().startsWith('•')) {
        // Find where the bullet point structure finishes and text begins
        const bulletMatch = line.match(/^(\s*•\s*)(.*)/);
        if (bulletMatch) {
          const prefix = bulletMatch[1];
          const content = bulletMatch[2];
          // Capitalize the first true letter of the bullet's internal text
          const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
          processedLine = prefix + capitalizedContent;
        }
      }

      return (
        <div key={lineIndex} className="min-h-[1.25rem]">
          {processedLine.split(/(\•\s)/g).map((part, i) => 
            part === '• ' 
              ? <span key={i} className="text-stone-900 font-black mr-0.5">• </span> 
              : <span key={i}>{part}</span>
          )}
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-[#E6EDE2] text-stone-900 py-10 px-4 font-mono antialiased selection:bg-stone-900 selection:text-[#E6EDE2]">
      <div className="max-w-xl mx-auto bg-white border-2 border-stone-950 shadow-[4px_4px_0px_0px_rgba(12,12,12,1)] p-5">
        
        {/* Funky Studio Header */}
        <header className="border-b-2 border-dashed border-stone-300 pb-4 mb-5 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-stone-900">
              TASK_DECK_
            </h1>
            <p className="text-[10px] text-stone-500 font-sans tracking-wider uppercase mt-0.5">
              Current Session Directives
            </p>
          </div>
          <span className="bg-stone-900 text-white text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider">
            {todos.filter(t => !t.completed).length} Remainder
          </span>
        </header>

        {/* Compressed Input Bar */}
        <div className="mb-6">
          <form onSubmit={addTodo} className="flex border-2 border-stone-950 bg-stone-50 shadow-[2px_2px_0px_0px_rgba(12,12,12,1)]">
            <input 
              className="flex-1 bg-transparent py-2 px-3 focus:outline-none placeholder:text-stone-400 text-xs font-bold tracking-wide"
              value={inputValue} 
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="GENERATE ENTRY..."
            />
            <button className="bg-stone-900 hover:bg-stone-800 text-white border-l-2 border-stone-950 text-xs font-black px-4 transition-colors">
              ADD+
            </button>
          </form>
        </div>

        {/* Ultra-Dense Stacked List Section */}
        <div className="divide-y divide-stone-200">
          {todos.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-stone-200 bg-stone-50/50">
              <p className="text-xs font-bold uppercase text-stone-400 tracking-wider">
                System clear / No entries found
              </p>
            </div>
          )}

          {todos.map((todo, index) => (
            <div 
              key={todo.id} 
              className="group flex flex-col justify-between py-2.5 first:pt-0 last:pb-0 transition-colors duration-150"
            >
              {editingId === todo.id ? (
                <div className="flex flex-1 flex-col gap-2 w-full pt-1">
                  <textarea 
                    className="w-full bg-stone-50 text-stone-900 p-2.5 border-2 border-stone-950 focus:outline-none resize-none min-h-[90px] text-xs font-medium tracking-wide leading-relaxed"
                    value={editText} 
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                  />
                  <div className="flex justify-end gap-3 items-center">
                    <button 
                      onClick={() => setEditingId(null)} 
                      className="text-[10px] font-bold text-stone-400 hover:text-stone-600 uppercase tracking-wider"
                    >
                      [Abort]
                    </button>
                    <button 
                      onClick={saveEdit} 
                      className="bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-black uppercase px-3 py-1 border border-stone-950 transition-colors shadow-[1px_1px_0px_0px_rgba(12,12,12,1)]"
                    >
                      Save_
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Text / Core Content Area */}
                  <div className="flex items-start flex-1 min-w-0 pr-2">
                    <span 
                      onClick={() => toggleComplete(todo.id)}
                      className={`flex-1 text-xs font-medium tracking-wide whitespace-pre-wrap break-words text-left leading-normal cursor-pointer transition-colors select-none ${
                        todo.completed ? 'text-stone-300 line-through decoration-stone-400 decoration-2' : 'text-stone-800 hover:text-stone-950'
                      }`}
                    >
                      {renderFormattedText(todo.text)}
                    </span>
                  </div>

                  {/* Micro Horizontal Toolbar (Flat Aligned Layout) */}
                  <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-100 h-4 mt-1">
                    {/* Reorder Elements */}
                    <div className="flex items-center gap-2 border-r border-stone-200 pr-3 h-full">
                      <button 
                        onClick={() => moveTodo(index, 'up')} 
                        disabled={index === 0}
                        className="text-stone-400 hover:text-stone-900 disabled:opacity-10 text-[9px] font-bold p-0.5 transition-colors"
                        title="Move Up"
                      >
                        ▲
                      </button>
                      <button 
                        onClick={() => moveTodo(index, 'down')} 
                        disabled={index === todos.length - 1}
                        className="text-stone-400 hover:text-stone-900 disabled:opacity-10 text-[9px] font-bold p-0.5 transition-colors"
                        title="Move Down"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Clean Action Tags */}
                    <button 
                      onClick={() => startEdit(todo)}
                      className="text-[10px] font-bold text-stone-400 hover:text-stone-900 transition-colors uppercase tracking-wider"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => deleteTodo(todo.id)}
                      className="text-[10px] font-bold text-stone-300 hover:text-red-600 transition-colors uppercase tracking-wider"
                    >
                      Drop
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Flush Brutalist Footer */}
        {todos.length > 0 && (
          <footer className="mt-6 flex justify-center border-t-2 border-stone-200 pt-4">
            <button 
              onClick={() => {
                if(confirm("Wipe completely?")) setTodos([]);
              }}
              className="text-[9px] text-stone-400 hover:text-red-600 uppercase font-black tracking-widest py-1.5 px-3 hover:bg-stone-50 border border-transparent hover:border-stone-200 transition-all"
            >
              Wipe Core Cache
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};

export default App;
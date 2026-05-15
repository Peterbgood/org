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
      // Inserts a newline and a bullet point
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

  // Helper to style bullet points differently from text
  const renderFormattedText = (text: string) => {
    return text.split(/(\•\s)/g).map((part, i) => 
      part === '• ' 
        ? <span key={i} className="text-slate-500 text-sm font-bold">{part}</span> 
        : <span key={i}>{part}</span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 py-6 px-3 font-sans">
      <div className="max-w-2xl mx-auto">
        
        {/* Compact Header Section */}
        <div className="flex items-center justify-between mb-4 px-1">
          <h1 className="text-xl font-bold text-white tracking-tight">
            Task <span className="text-indigo-400">Flow</span>
          </h1>
          <p className="text-slate-500 text-xs">{todos.length} items</p>
        </div>

        {/* Input Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-1.5 mb-4 border border-white/10 shadow-lg">
          <form onSubmit={addTodo} className="flex gap-2">
            <input 
              className="flex-1 bg-transparent text-white px-4 py-2 rounded-lg focus:outline-none placeholder:text-slate-600 text-sm"
              value={inputValue} 
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Add a task..."
            />
            <button className="bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all active:scale-95">
              +
            </button>
          </form>
        </div>

        {/* List Section */}
        <div className="space-y-1.5">
          {todos.length === 0 && (
            <div className="text-center py-10 bg-white/5 rounded-xl border border-dashed border-white/10">
              <p className="text-slate-600 text-sm">List is empty</p>
            </div>
          )}

          {todos.map((todo, index) => (
            <div 
              key={todo.id} 
              className="group flex items-start justify-between gap-3 py-1.5 px-3 rounded-lg transition-all border bg-white/5 border-white/10"
            >
              {editingId === todo.id ? (
                <div className="flex flex-1 flex-col gap-2 w-full py-1">
                  <textarea 
                    className="flex-1 bg-slate-800 text-white px-3 py-2 rounded-lg border border-indigo-500 focus:outline-none resize-none min-h-[100px] text-sm"
                    value={editText} 
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                  />
                  <button 
                    onClick={saveEdit} 
                    className="bg-indigo-500 hover:bg-indigo-400 px-4 py-1.5 rounded-lg text-white text-xs font-bold self-end"
                  >
                    Save Changes
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-sm text-slate-200 whitespace-pre-wrap break-words text-left pt-1 leading-relaxed">
                    {renderFormattedText(todo.text)}
                  </span>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity mr-1">
                      <button onClick={() => moveTodo(index, 'up')} className="text-slate-600 hover:text-white text-[10px]">▲</button>
                      <button onClick={() => moveTodo(index, 'down')} className="text-slate-600 hover:text-white text-[10px]">▼</button>
                    </div>

                    <button 
                      onClick={() => startEdit(todo)}
                      className="p-2 text-slate-500 hover:text-indigo-400"
                    >
                      ✎
                    </button>
                    <button 
                      onClick={() => deleteTodo(todo.id)}
                      className="p-2 text-slate-500 hover:text-red-400"
                    >
                      🗑
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Inline Footer - No longer sticky */}
        {todos.length > 0 && (
          <div className="mt-6 flex justify-center pb-12">
            <button 
              onClick={() => setTodos([])}
              className="text-xs text-slate-600 hover:text-red-400 uppercase tracking-widest font-semibold py-2 px-4 border border-white/5 rounded-lg hover:bg-white/5 transition-all"
            >
              Clear All Tasks
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
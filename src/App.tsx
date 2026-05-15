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

  const moveTodo = (index: number, direction: 'up' | 'down') => {
    const newTodos = [...todos];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= todos.length) return;
    [newTodos[index], newTodos[targetIndex]] = [newTodos[targetIndex], newTodos[index]];
    setTodos(newTodos);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 py-12 px-4 font-sans">
      <div className="max-w-2xl mx-auto">
        
        {/* Header Section */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2">
            Task <span className="text-indigo-400">Flow</span>
          </h1>
          <p className="text-slate-400">Streamline your productivity</p>
        </div>

        {/* Input Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-2 mb-8 border border-white/10 shadow-2xl">
          <form onSubmit={addTodo} className="flex gap-2">
            <input 
              className="flex-1 bg-transparent text-white px-6 py-3 rounded-xl focus:outline-none placeholder:text-slate-500"
              value={inputValue} 
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="What's on your mind today?"
            />
            <button className="bg-indigo-500 hover:bg-indigo-400 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95">
              Add Task
            </button>
          </form>
        </div>

        {/* List Section - Mobile height restricted to show ~3 items, full height on desktop */}
        <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible">
          {todos.length === 0 && (
            <div className="text-center py-20 bg-white/5 rounded-2xl border border-dashed border-white/10">
              <p className="text-slate-500">Your list is empty. Add a task to get started!</p>
            </div>
          )}

          {todos.map((todo, index) => (
            <div 
              key={todo.id} 
              className="group flex items-center justify-between gap-4 py-2 px-4 rounded-xl transition-all border bg-white/5 border-white/10 hover:border-indigo-500/50 hover:bg-white/10"
            >
              {editingId === todo.id ? (
                /* Edit UI with Textarea to allow line breaks */
                <div className="flex flex-1 flex-col sm:flex-row gap-2 w-full">
                  <textarea 
                    className="flex-1 bg-slate-800 text-white px-3 py-1 rounded-lg border border-indigo-500 focus:outline-none resize-none min-h-[60px]"
                    value={editText} 
                    onChange={(e) => setEditText(e.target.value)}
                    autoFocus
                  />
                  <button 
                    onClick={saveEdit} 
                    className="bg-green-600 hover:bg-green-500 px-4 py-1 rounded-lg text-white font-medium self-end sm:self-center transition-colors"
                  >
                    Save
                  </button>
                </div>
              ) : (
                /* Standard UI - whitespace-pre-wrap ensures line breaks remain */
                <>
                  <span className="flex-1 text-base text-slate-200 whitespace-pre-wrap break-words text-left">
                    {todo.text}
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Reorder Buttons */}
                    <div className="flex flex-col mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        disabled={index === 0}
                        onClick={() => moveTodo(index, 'up')}
                        className="text-slate-500 hover:text-white disabled:opacity-0 text-xs"
                      >
                        ▲
                      </button>
                      <button 
                        disabled={index === todos.length - 1}
                        onClick={() => moveTodo(index, 'down')}
                        className="text-slate-500 hover:text-white disabled:opacity-0 text-xs"
                      >
                        ▼
                      </button>
                    </div>

                    <button 
                      onClick={() => startEdit(todo)}
                      className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-white/5 rounded-lg transition-all"
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button 
                      onClick={() => deleteTodo(todo.id)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-white/5 rounded-lg transition-all"
                      title="Delete"
                    >
                      🗑
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Stats Footer */}
        {todos.length > 0 && (
          <div className="mt-8 flex justify-between items-center text-sm text-slate-500 px-4">
            <span>{todos.length} tasks total</span>
            <button 
              onClick={() => setTodos([])}
              className="hover:text-red-400 transition-colors"
            >
              Clear All
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
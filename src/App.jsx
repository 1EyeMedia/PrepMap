import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Trash2, Edit2, Settings, Check, X, BookOpen, 
  BarChart, Sparkles, LogIn, LogOut, AlertCircle, 
  Download, Upload 
} from 'lucide-react';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase.js';

const generateId = () => Math.random().toString(36).substr(2, 9);

const INITIAL_COLUMNS = [
  { id: 'c1', name: 'Notes' },
  { id: 'c2', name: 'Revision 1' },
  { id: 'c3', name: 'PYQs' },
  { id: 'c4', name: 'Mock Test' }
];

const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [columns, setColumns] = useState(INITIAL_COLUMNS);
  const [subjects, setSubjects] = useState([]);
  const [activeSubjectId, setActiveSubjectId] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showColManager, setShowColManager] = useState(false);
  const [user, setUser] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const [promptConfig, setPromptConfig] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState(null);

  // Auth Handling
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        const saved = localStorage.getItem('prepMapData_local');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setColumns(parsed.columns || INITIAL_COLUMNS);
            setSubjects(parsed.subjects || []);
            if (parsed.subjects?.length > 0) setActiveSubjectId(parsed.subjects[0].id);
          } catch (e) { console.error("Local load failed"); }
        }
        setIsLoaded(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Cloud Sync
  useEffect(() => {
    if (!user) return;
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setColumns(data.columns || INITIAL_COLUMNS);
        setSubjects(data.subjects || []);
        if (data.subjects?.length > 0 && !activeSubjectId) {
          setActiveSubjectId(data.subjects[0].id);
        }
      } else {
        setDoc(userDocRef, { columns, subjects }).catch(err => {
          handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
        });
      }
      setIsLoaded(true);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      setErrorMsg("Cloud Access Denied. Check Firestore Rules.");
      setIsLoaded(true);
    });
    return () => unsubscribe();
  }, [user]);

  const syncData = (newCols, newSubs) => {
    setColumns(newCols);
    setSubjects(newSubs);
    if (user) {
      setDoc(doc(db, 'users', user.uid), { columns: newCols, subjects: newSubs }, { merge: true }).catch(err => {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      });
    } else {
      localStorage.setItem('prepMapData_local', JSON.stringify({ columns: newCols, subjects: newSubs }));
    }
  };

  const handleLogin = async () => {
    setErrorMsg(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') {
        setErrorMsg(`Login Error: ${error.message}`);
      }
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setSubjects([]);
    setActiveSubjectId(null);
  };

  const handleExport = () => {
    const data = JSON.stringify({ columns, subjects }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prepmap_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.columns && parsed.subjects) {
          syncData(parsed.columns, parsed.subjects);
          if (parsed.subjects.length > 0) setActiveSubjectId(parsed.subjects[0].id);
        }
      } catch (err) { setErrorMsg("Invalid backup file."); }
    };
    reader.readAsText(file);
  };

  const requestPrompt = (title, defaultValue, onComplete) => setPromptConfig({ title, value: defaultValue, onComplete });
  const requestConfirm = (title, message, onConfirm) => setConfirmConfig({ title, message, onConfirm });

  const addSubject = () => {
    requestPrompt('Enter subject name:', '', (name) => {
      if (!name) return;
      const newSub = { id: generateId(), name, chapters: [] };
      syncData(columns, [...subjects, newSub]);
      setActiveSubjectId(newSub.id);
    });
  };

  const addChapter = (subId) => {
    requestPrompt('Enter chapter name:', '', (name) => {
      if (!name) return;
      syncData(columns, subjects.map(s => s.id === subId ? { ...s, chapters: [...s.chapters, { id: generateId(), name, progress: {} }] } : s));
    });
  };

  const toggleProgress = (subId, chId, colId) => {
    syncData(columns, subjects.map(s => s.id === subId ? { ...s, chapters: s.chapters.map(c => c.id === chId ? { ...c, progress: { ...c.progress, [colId]: !c.progress[colId] } } : c) } : s));
  };

  if (!isLoaded) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div></div>;

  const activeSub = subjects.find(s => s.id === activeSubjectId);
  const overallProg = (() => {
    let t = 0, c = 0;
    subjects.forEach(s => s.chapters.forEach(ch => columns.forEach(col => { t++; if (ch.progress[col.id]) c++; })));
    return t === 0 ? 0 : Math.round((c/t)*100);
  })();

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200 font-sans relative overflow-hidden selection:bg-indigo-500/30">
      {/* Deep Texture & Animated Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-900/20 rounded-full mix-blend-screen filter blur-[100px] animate-pulse" style={{ animationDuration: '10s' }}></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-violet-900/20 rounded-full mix-blend-screen filter blur-[100px] animate-pulse" style={{ animationDuration: '15s', animationDelay: '2s' }}></div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 relative z-10">
        
        <AnimatePresence>
          {errorMsg && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center justify-between text-red-400 shadow-lg backdrop-blur-md">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} />
                <span className="text-sm font-bold tracking-wide">{errorMsg}</span>
              </div>
              <button onClick={() => setErrorMsg(null)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><X size={18}/></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <motion.header initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6 md:p-8 rounded-[2rem] flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border border-white/5 bg-white/[0.02] shadow-2xl backdrop-blur-3xl">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-2xl border border-white/10 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
              <BookOpen size={32} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter flex items-center gap-3 font-display text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-violet-300">
                PrepMap
              </h1>
              <p className="text-zinc-400 mt-1 font-medium text-sm md:text-base tracking-wide">Master your curriculum. Own your progress.</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            <div className="flex-1 md:flex-none flex items-center gap-4 px-6 py-4 bg-black/40 rounded-2xl border border-white/5 mr-2 shadow-inner">
              <BarChart size={24} className="text-indigo-400" />
              <div className="flex flex-col w-32 md:w-48">
                <div className="flex justify-between text-xs font-bold mb-2 uppercase tracking-wider">
                  <span className="text-zinc-400">Overall</span>
                  <span className="text-indigo-400">{overallProg}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }} animate={{ width: `${overallProg}%` }} transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 shadow-[0_0_15px_rgba(99,102,241,0.6)]"
                  />
                </div>
              </div>
            </div>

            <label className="group flex items-center gap-2 px-5 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 active:scale-95 cursor-pointer shadow-lg" title="Import JSON">
              <Upload size={20} className="text-zinc-400 group-hover:text-indigo-400 transition-colors" />
              <span className="font-bold text-sm hidden md:inline tracking-wide">Import</span>
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>

            <button onClick={handleExport} className="group flex items-center gap-2 px-5 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 active:scale-95 shadow-lg" title="Export JSON">
              <Download size={20} className="text-zinc-400 group-hover:text-emerald-400 transition-colors" />
              <span className="font-bold text-sm hidden md:inline tracking-wide">Export</span>
            </button>

            {user ? (
              <button onClick={handleLogout} className="group flex items-center gap-2 px-5 py-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-2xl transition-all duration-300 active:scale-95 shadow-lg">
                <LogOut size={20} className="text-red-400" />
                <span className="font-bold text-sm hidden md:inline text-red-400 tracking-wide">Sign Out</span>
              </button>
            ) : (
              <button onClick={handleLogin} className="group flex items-center gap-2 px-5 py-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-2xl transition-all duration-300 active:scale-95 shadow-lg">
                <LogIn size={20} className="text-indigo-400" />
                <span className="font-bold text-sm hidden md:inline text-indigo-400 tracking-wide">Sign In</span>
              </button>
            )}
            
            <button onClick={() => setShowColManager(true)} className="group flex items-center gap-2 px-5 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 active:scale-95 shadow-lg">
              <Settings size={20} className="text-zinc-400 group-hover:text-white transition-colors" />
              <span className="font-bold text-sm hidden md:inline tracking-wide">Columns</span>
            </button>
          </div>
        </motion.header>

        {/* Subjects Navigation */}
        <motion.div layout className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-4 pt-2">
          <AnimatePresence mode="popLayout">
            {subjects.map(subject => (
              <motion.button
                layout
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                key={subject.id}
                onClick={() => setActiveSubjectId(subject.id)}
                className={`relative px-7 py-4 rounded-2xl font-bold whitespace-nowrap transition-colors duration-300 flex-shrink-0 text-sm tracking-wide
                  ${activeSubjectId === subject.id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent'}`}
              >
                {activeSubjectId === subject.id && (
                  <motion.div layoutId="activeTab" className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 rounded-2xl shadow-[0_0_20px_rgba(99,102,241,0.15)]" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                )}
                <span className="relative z-10">{subject.name}</span>
              </motion.button>
            ))}
          </AnimatePresence>
          <motion.button layout onClick={addSubject} className="group flex items-center gap-2 px-7 py-4 bg-white/[0.02] hover:bg-white/10 border border-white/10 border-dashed rounded-2xl text-zinc-400 hover:text-white transition-all font-bold text-sm tracking-wide flex-shrink-0">
            <Plus size={18} /> <span>New Subject</span>
          </motion.button>
        </motion.div>

        {/* Main Content Area */}
        <motion.div layout className="transition-all duration-500">
          <AnimatePresence mode="wait">
            {activeSub ? (
              <motion.div key={activeSub.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4, ease: "easeOut" }} className="bg-black/40 border border-white/5 rounded-[2rem] overflow-hidden backdrop-blur-xl shadow-2xl">
                <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-4">
                    <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight font-display">{activeSub.name}</h2>
                    <button onClick={() => requestPrompt('Rename subject:', activeSub.name, (newName) => syncData(columns, subjects.map(s => s.id === activeSub.id ? { ...s, name: newName } : s)))} className="p-2.5 text-zinc-500 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                      <Edit2 size={18} />
                    </button>
                  </div>
                  <button onClick={() => requestConfirm('Delete Subject', 'Are you sure you want to delete this subject and all its modules?', () => syncData(columns, subjects.filter(s => s.id !== activeSub.id)))} className="group flex items-center gap-2 px-5 py-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-xl transition-all font-bold text-sm">
                    <Trash2 size={18} />
                    <span>Delete Subject</span>
                  </button>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.01]">
                        <th className="p-6 font-bold text-zinc-500 w-80 uppercase tracking-widest text-xs">Chapter Module</th>
                        {columns.map(col => (
                          <th key={col.id} className="p-6 font-bold text-zinc-500 text-center w-32 uppercase tracking-widest text-xs">{col.name}</th>
                        ))}
                        <th className="p-6 w-24 text-right uppercase tracking-widest text-xs text-zinc-500">System</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.02]">
                      <AnimatePresence>
                        {activeSub.chapters.map((chapter, i) => (
                          <motion.tr layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3, delay: i * 0.05 }} key={chapter.id} className="group hover:bg-white/[0.03] transition-colors duration-300">
                            <td className="p-6 font-semibold text-zinc-200 flex items-center gap-4">
                              <span className="text-zinc-600 font-mono text-sm w-6">{String(i + 1).padStart(2, '0')}</span>
                              <span className="truncate text-lg">{chapter.name}</span>
                              <button onClick={() => requestPrompt('Rename chapter:', chapter.name, (newName) => syncData(columns, subjects.map(s => s.id === activeSub.id ? { ...s, chapters: s.chapters.map(c => c.id === chapter.id ? { ...c, name: newName } : c) } : s)))} className="text-zinc-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-white/10 rounded-xl">
                                <Edit2 size={16} />
                              </button>
                            </td>
                            {columns.map(col => {
                              const isChecked = !!chapter.progress[col.id];
                              return (
                                <td key={col.id} className="p-4 text-center">
                                  <motion.button whileTap={{ scale: 0.8 }} onClick={() => toggleProgress(activeSub.id, chapter.id, col.id)} className={`relative w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-all duration-300 ${isChecked ? 'bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)]' : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'}`}>
                                    <AnimatePresence>
                                      {isChecked && (
                                        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                                          <Check size={20} strokeWidth={4} />
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </motion.button>
                                </td>
                              );
                            })}
                            <td className="p-6 text-right">
                              <button onClick={() => syncData(columns, subjects.map(s => s.id === activeSub.id ? {...s, chapters: s.chapters.filter(x => x.id !== chapter.id)} : s))} className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-2.5 hover:bg-red-500/10 rounded-xl">
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-white/[0.01] border-t border-white/5">
                  <button onClick={() => addChapter(activeSub.id)} className="w-full py-5 flex items-center justify-center gap-3 rounded-2xl text-sm font-bold text-zinc-500 hover:text-white hover:bg-white/5 border border-dashed border-white/10 transition-all tracking-widest uppercase">
                    <Plus size={20} /> Initialize New Module
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-black/40 border border-white/5 text-center py-32 rounded-[2rem] flex flex-col items-center backdrop-blur-xl shadow-2xl">
                <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
                  <Sparkles size={64} className="text-indigo-500/40 mb-8" />
                </motion.div>
                <h3 className="text-3xl font-black text-white mb-3 font-display tracking-tight">Initialize Subject</h3>
                <p className="text-zinc-400 text-lg font-medium">Ready to start tracking? Add your first subject above.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Column Manager Modal */}
        <AnimatePresence>
          {showColManager && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-2xl flex items-center justify-center p-4 z-40">
              <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="bg-zinc-950 border border-white/10 rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-6 md:p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                  <h3 className="font-black text-2xl text-white flex items-center gap-3 font-display"><Settings size={24} className="text-indigo-400" /> Matrix Columns</h3>
                  <button onClick={() => setShowColManager(false)} className="text-zinc-500 hover:text-white p-2 hover:bg-white/10 rounded-xl transition-all"><X size={20}/></button>
                </div>
                <div className="p-6 md:p-8 space-y-6">
                  <ul className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                    <AnimatePresence>
                      {columns.map(col => (
                        <motion.li layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} key={col.id} className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                          <span className="font-bold text-zinc-200 tracking-wide">{col.name}</span>
                          <button onClick={() => syncData(columns.filter(x => x.id !== col.id), subjects)} className="text-zinc-500 hover:text-red-400 p-2 hover:bg-red-500/10 rounded-xl transition-colors"><Trash2 size={18}/></button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                  <form onSubmit={(e) => { e.preventDefault(); const n = e.target.elements[0].value; if(n) { syncData([...columns, {id: generateId(), name: n}], subjects); e.target.reset(); } }} className="flex gap-3 pt-6 border-t border-white/5">
                    <input type="text" placeholder="New column name..." className="flex-1 px-5 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 text-white font-medium transition-all"/>
                    <button type="submit" className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 rounded-2xl font-bold transition-colors shadow-lg shadow-indigo-500/25">Add</button>
                  </form>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Overlays */}
        <AnimatePresence>
          {promptConfig && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-2xl flex items-center justify-center p-4 z-50">
              <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="bg-zinc-950 border border-white/10 rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="p-6 md:p-8">
                  <h3 className="font-black text-2xl text-white mb-6 font-display">{promptConfig.title}</h3>
                  <input autoFocus className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 text-white font-medium transition-all" defaultValue={promptConfig.value} onKeyDown={(e) => { if(e.key === 'Enter') { promptConfig.onComplete(e.target.value); setPromptConfig(null); }}} />
                </div>
                <div className="p-4 md:p-6 border-t border-white/5 flex justify-end gap-3 bg-white/[0.02]">
                  <button onClick={() => setPromptConfig(null)} className="px-6 py-3 text-zinc-400 hover:text-white font-bold transition-colors">Cancel</button>
                  <button onClick={() => { promptConfig.onComplete(document.querySelector('input').value); setPromptConfig(null); }} className="px-8 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl font-bold transition-colors shadow-lg shadow-indigo-500/25">Save</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {confirmConfig && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-2xl flex items-center justify-center p-4 z-50">
              <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="bg-zinc-950 border border-white/10 rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="p-6 md:p-8">
                  <h3 className="font-black text-2xl text-white mb-3 font-display">{confirmConfig.title}</h3>
                  <p className="text-zinc-400 font-medium leading-relaxed">{confirmConfig.message}</p>
                </div>
                <div className="p-4 md:p-6 border-t border-white/5 flex justify-end gap-3 bg-white/[0.02]">
                  <button onClick={() => setConfirmConfig(null)} className="px-6 py-3 text-zinc-400 hover:text-white font-bold transition-colors">Cancel</button>
                  <button onClick={() => { confirmConfig.onConfirm(); setConfirmConfig(null); }} className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold transition-colors shadow-lg shadow-red-500/25">Delete</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

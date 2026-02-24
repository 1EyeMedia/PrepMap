import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Edit2, Settings, Check, X, BookOpen, 
  BarChart, Sparkles, LogIn, LogOut, AlertCircle, 
  Download, Upload 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithRedirect, 
  getRedirectResult,
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- Firebase Configuration (Verified from your screenshots) ---
const firebaseConfig = {
  apiKey: "AIzaSyD5oe40YjM_nQfYq_kkKgcXiI_cJ9Dti6A",
  authDomain: "prepmap-4df1f.firebaseapp.com",
  projectId: "prepmap-4df1f",
  storageBucket: "prepmap-4df1f.firebasestorage.app",
  messagingSenderId: "512816661626",
  appId: "1:512816661626:web:45f1df91db043c7ddb4fc3",
  measurementId: "G-GEH1MEQMME"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const generateId = () => Math.random().toString(36).substr(2, 9);

const INITIAL_COLUMNS = [
  { id: 'c1', name: 'Notes' },
  { id: 'c2', name: 'Revision 1' },
  { id: 'c3', name: 'PYQs' },
  { id: 'c4', name: 'Mock Test' }
];

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
    getRedirectResult(auth).catch((error) => {
      if (error.code === 'auth/api-key-not-valid') {
        setErrorMsg("API Key Restricted: Go to Google Cloud Console > Credentials and remove restrictions for this key.");
      } else if (error.code !== 'auth/popup-closed-by-user') {
        setErrorMsg(`Login Error: ${error.message}`);
      }
    });

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
        setDoc(userDocRef, { columns, subjects });
      }
      setIsLoaded(true);
    }, (err) => {
      setErrorMsg("Cloud Access Denied. Check Firestore Rules.");
      setIsLoaded(true);
    });
    return () => unsubscribe();
  }, [user]);

  const syncData = (newCols, newSubs) => {
    setColumns(newCols);
    setSubjects(newSubs);
    if (user) {
      setDoc(doc(db, 'users', user.uid), { columns: newCols, subjects: newSubs }, { merge: true });
    } else {
      localStorage.setItem('prepMapData_local', JSON.stringify({ columns: newCols, subjects: newSubs }));
    }
  };

  const handleLogin = () => {
    setErrorMsg(null);
    signInWithRedirect(auth, googleProvider);
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
    <>
      {/* ORIGINAL PREMIUM UI STYLES RESTORED */}
      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob { animation: blob 10s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
        .glass-panel {
          background: rgba(20, 20, 25, 0.4);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
        }
        .text-gradient {
          background: linear-gradient(to right, #60a5fa, #c084fc, #f472b6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 8px; }
      `}</style>

      <div className="min-h-screen bg-[#0a0a0f] text-gray-200 p-4 md:p-8 font-sans relative overflow-hidden selection:bg-purple-500/30">
        
        {/* ORIGINAL ANIMATED BACKGROUND BLOBS RESTORED */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600/30 rounded-full mix-blend-screen filter blur-[120px] animate-blob"></div>
          <div className="absolute top-[20%] right-[-10%] w-96 h-96 bg-blue-600/30 rounded-full mix-blend-screen filter blur-[120px] animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-[-20%] left-[20%] w-[30rem] h-[30rem] bg-pink-600/20 rounded-full mix-blend-screen filter blur-[120px] animate-blob animation-delay-4000"></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        </div>

        <div className="max-w-7xl mx-auto space-y-8 relative z-10">
          
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center justify-between text-red-400 animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} />
                <span className="text-sm font-medium">{errorMsg}</span>
              </div>
              <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-white/5 rounded-lg"><X size={18}/></button>
            </div>
          )}

          {/* Header with ORIGINAL BIG LOGO and proper sizing */}
          <header className="glass-panel p-6 md:p-8 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 transition-all duration-500 hover:border-white/10">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 shadow-[0_0_20px_rgba(192,132,252,0.15)]">
                <BookOpen size={32} className="text-purple-400" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight flex items-center gap-3">
                  <span className="text-gradient">PrepMap</span>
                  <Sparkles size={24} className="text-pink-400 animate-pulse" />
                </h1>
                <p className="text-gray-400 mt-1 font-medium text-sm md:text-base">Master your curriculum. Own your progress.</p>
                <div className="mt-3 flex items-center gap-3 opacity-80 hover:opacity-100 transition-opacity">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Powered by</span>
                  <img src="https://i.ibb.co/rfs2sDK5/Whats-App-Image-2026-02-12-at-11-40-19-PM-removebg-preview.png" alt="Brand Logo" className="h-12 md:h-16 object-contain filter grayscale hover:grayscale-0 transition-all duration-300" />
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
              <div className="flex-1 md:flex-none flex items-center gap-4 px-5 py-3 glass-panel rounded-2xl border-white/5 mr-2">
                <BarChart size={20} className="text-blue-400" />
                <div className="flex flex-col w-32 md:w-40">
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-gray-300">Overall</span>
                    <span className="text-blue-400">{overallProg}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)] transition-all duration-1000 ease-out"
                      style={{ width: `${overallProg}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Exact Icons Matched: Import = Arrow Up, Export = Arrow Down */}
              <label className="group flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 active:scale-95 cursor-pointer" title="Import JSON">
                <Upload size={18} className="text-gray-400 group-hover:text-blue-400" />
                <span className="font-semibold text-sm hidden md:inline">Import</span>
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>

              <button 
                onClick={handleExport}
                className="group flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 active:scale-95"
                title="Export JSON"
              >
                <Download size={18} className="text-gray-400 group-hover:text-green-400" />
                <span className="font-semibold text-sm hidden md:inline">Export</span>
              </button>

              {user ? (
                <button 
                  onClick={handleLogout}
                  className="group flex items-center gap-2 px-4 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-2xl transition-all duration-300 active:scale-95"
                >
                  <LogOut size={18} className="text-red-400" />
                  <span className="font-semibold text-sm hidden md:inline text-red-400">Sign Out</span>
                </button>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="group flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 active:scale-95"
                >
                  <LogIn size={18} className="text-blue-400" />
                  <span className="font-semibold text-sm hidden md:inline">Sign In</span>
                </button>
              )}
              
              <button 
                onClick={() => setShowColManager(true)}
                className="group flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 active:scale-95"
              >
                <Settings size={18} className="text-gray-400 group-hover:text-white" />
                <span className="font-semibold text-sm hidden md:inline">Columns</span>
              </button>
            </div>
          </header>

          {/* Original Tab Navigation */}
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2">
            {subjects.map(subject => (
              <button
                key={subject.id}
                onClick={() => setActiveSubjectId(subject.id)}
                className={`relative px-6 py-3 rounded-2xl font-semibold whitespace-nowrap transition-all duration-300 flex-shrink-0
                  ${activeSubjectId === subject.id 
                    ? 'bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-white border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.15)]' 
                    : 'bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10 border border-transparent'
                  }`}
              >
                {subject.name}
              </button>
            ))}
            <button onClick={addSubject} className="group flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 border-dashed rounded-2xl text-gray-400 transition-all">
              <Plus size={18} /> <span className="font-medium">New Subject</span>
            </button>
          </div>

          {/* Original Matrix Table */}
          <div className="transition-all duration-500">
            {activeSub ? (
              <div className="glass-panel rounded-3xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-4">
                    <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight drop-shadow-md">{activeSub.name}</h2>
                    <button onClick={() => requestPrompt('Rename subject:', activeSub.name, (newName) => syncData(columns, subjects.map(s => s.id === activeSub.id ? { ...s, name: newName } : s)))} className="p-2 text-gray-400 hover:text-white rounded-lg transition-all">
                      <Edit2 size={16} />
                    </button>
                  </div>
                  <button onClick={() => requestConfirm('Delete Subject', 'Are you sure?', () => syncData(columns, subjects.filter(s => s.id !== activeSub.id)))} className="group flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-xl transition-all active:scale-95">
                    <Trash2 size={16} />
                    <span className="text-sm font-semibold">Delete Subject</span>
                  </button>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="border-b border-white/5 bg-black/20">
                        <th className="p-6 font-semibold text-gray-400 w-80 uppercase tracking-wider text-xs">Chapter Module</th>
                        {columns.map(col => (
                          <th key={col.id} className="p-6 font-semibold text-gray-400 text-center w-32 uppercase tracking-wider text-xs">{col.name}</th>
                        ))}
                        <th className="p-6 w-24 text-right uppercase tracking-wider text-xs text-gray-400">System</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.02]">
                      {activeSub.chapters.map((chapter, i) => (
                        <tr key={chapter.id} className="group hover:bg-white/[0.03] transition-colors duration-300">
                          <td className="p-6 font-medium text-gray-200 flex items-center gap-3">
                            <span className="text-gray-600 font-mono text-xs w-6">{String(i + 1).padStart(2, '0')}</span>
                            <span className="truncate">{chapter.name}</span>
                            <button onClick={() => requestPrompt('Rename chapter:', chapter.name, (newName) => syncData(columns, subjects.map(s => s.id === activeSub.id ? { ...s, chapters: s.chapters.map(c => c.id === chapter.id ? { ...c, name: newName } : c) } : s)))} className="text-gray-500 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all p-1 bg-white/5 rounded-md">
                              <Edit2 size={14} />
                            </button>
                          </td>
                          {columns.map(col => {
                            const isChecked = !!chapter.progress[col.id];
                            return (
                              <td key={col.id} className="p-4 text-center">
                                <button onClick={() => toggleProgress(activeSub.id, chapter.id, col.id)} className={`relative w-8 h-8 mx-auto rounded-lg flex items-center justify-center transition-all duration-300 active:scale-75 ${isChecked ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'bg-white/5 border border-white/10'}`}>
                                  {isChecked && <Check size={16} strokeWidth={4} />}
                                </button>
                              </td>
                            );
                          })}
                          <td className="p-6 text-right">
                            <button onClick={() => syncData(columns, subjects.map(s => s.id === activeSub.id ? {...s, chapters: s.chapters.filter(x => x.id !== chapter.id)} : s))} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-2 rounded-lg">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-black/20 border-t border-white/5">
                  <button onClick={() => addChapter(activeSub.id)} className="w-full py-4 flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-gray-400 hover:text-white hover:bg-white/5 border border-dashed border-white/10 transition-all">
                    <Plus size={18} /> INITIALIZE NEW MODULE
                  </button>
                </div>
              </div>
            ) : (
              <div className="glass-panel text-center py-24 rounded-3xl flex flex-col items-center">
                <Sparkles size={48} className="text-purple-500/30 mb-6" />
                <h3 className="text-2xl font-bold text-white mb-2">Initialize Subject</h3>
                <p className="text-gray-400 mb-8">Ready to start tracking? Add your first subject above.</p>
              </div>
            )}
          </div>
        </div>

        {/* Column Manager Modal */}
        {showColManager && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 z-40 animate-in fade-in duration-200">
            <div className="glass-panel border-white/10 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden scale-in duration-300">
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <h3 className="font-bold text-xl text-white flex items-center gap-2"><Settings size={20} className="text-blue-400" /> Matrix Columns</h3>
                <button onClick={() => setShowColManager(false)} className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-all"><X size={20}/></button>
              </div>
              <div className="p-6 space-y-4">
                <ul className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                  {columns.map(col => (
                    <li key={col.id} className="flex justify-between items-center bg-white/5 p-3 px-4 rounded-xl border border-white/5">
                      <span className="font-semibold text-gray-200">{col.name}</span>
                      <button onClick={() => syncData(columns.filter(x => x.id !== col.id), subjects)} className="text-gray-400 hover:text-red-400 p-2 hover:bg-red-500/10 rounded-lg"><Trash2 size={14}/></button>
                    </li>
                  ))}
                </ul>
                <form onSubmit={(e) => { e.preventDefault(); const n = e.target.elements[0].value; if(n) { syncData([...columns, {id: generateId(), name: n}], subjects); e.target.reset(); } }} className="flex gap-2 pt-4 border-t border-white/5">
                  <input type="text" placeholder="New column name..." className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none text-white"/>
                  <button type="submit" className="bg-white/10 px-5 rounded-xl font-bold">Add</button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Global Overlays */}
        {promptConfig && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="glass-panel border-white/10 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6">
                <h3 className="font-bold text-xl text-white mb-4">{promptConfig.title}</h3>
                <input autoFocus className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:outline-none text-white" defaultValue={promptConfig.value} onKeyDown={(e) => { if(e.key === 'Enter') { promptConfig.onComplete(e.target.value); setPromptConfig(null); }}} />
              </div>
              <div className="p-4 border-t border-white/5 flex justify-end gap-3">
                <button onClick={() => setPromptConfig(null)} className="px-5 py-2.5 text-gray-400">Cancel</button>
                <button onClick={() => { promptConfig.onComplete(document.querySelector('input').value); setPromptConfig(null); }} className="px-6 py-2.5 bg-purple-600 text-white rounded-xl font-bold">Save</button>
              </div>
            </div>
          </div>
        )}

        {confirmConfig && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="glass-panel border-white/10 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6">
                <h3 className="font-bold text-xl text-white mb-2">{confirmConfig.title}</h3>
                <p className="text-gray-400">{confirmConfig.message}</p>
              </div>
              <div className="p-4 border-t border-white/5 flex justify-end gap-3">
                <button onClick={() => setConfirmConfig(null)} className="px-5 py-2.5 text-gray-400">Cancel</button>
                <button onClick={() => { confirmConfig.onConfirm(); setConfirmConfig(null); }} className="px-6 py-2.5 bg-red-500/20 text-red-400 rounded-xl font-bold">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

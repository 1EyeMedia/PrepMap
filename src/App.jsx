import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Settings, Check, X, BookOpen, BarChart, Sparkles, LogIn, LogOut } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- Firebase Configuration ---
// Uses your custom config, with a fallback for the Canvas preview environment
const customFirebaseConfig = {
  apiKey: "AIzaSyD5oe40YjM_nQfYq_kkKgcXiI_cJ9Dti6A",
  authDomain: "prepmap-4df1f.firebaseapp.com",
  projectId: "prepmap-4df1f",
  storageBucket: "prepmap-4df1f.firebasestorage.app",
  messagingSenderId: "512816661626",
  appId: "1:512816661626:web:45f1df91db043c7ddb4fc3"
};

const isCanvasEnv = typeof __firebase_config !== 'undefined';
const firebaseConfig = isCanvasEnv ? JSON.parse(__firebase_config) : customFirebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const canvasAppId = typeof __app_id !== 'undefined' ? __app_id : 'prepmap';
const googleProvider = new GoogleAuthProvider();

const generateId = () => Math.random().toString(36).substr(2, 9);

const INITIAL_COLUMNS = [
  { id: 'c1', name: 'Notes' },
  { id: 'c2', name: 'Revision 1' },
  { id: 'c3', name: 'PYQs' },
  { id: 'c4', name: 'Mock Test' }
];

const INITIAL_SUBJECTS = [
  { id: 's1', name: 'Physics', chapters: [{ id: 'ch1', name: 'Kinematics', progress: {} }, { id: 'ch2', name: 'Laws of Motion', progress: {} }] },
  { id: 's2', name: 'Chemistry', chapters: [{ id: 'ch3', name: 'Atomic Structure', progress: {} }] }
];

export default function App() {
  const [columns, setColumns] = useState(INITIAL_COLUMNS);
  const [subjects, setSubjects] = useState(INITIAL_SUBJECTS);
  const [activeSubjectId, setActiveSubjectId] = useState(INITIAL_SUBJECTS[0].id);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showColManager, setShowColManager] = useState(false);
  const [user, setUser] = useState(null);

  const [promptConfig, setPromptConfig] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState(null);

  // 1. Initialize Authentication
  useEffect(() => {
    const initAuth = async () => {
      if (isCanvasEnv) {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        // Fallback to local storage if logged out
        const saved = localStorage.getItem('prepMapData_anon');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setColumns(parsed.columns || INITIAL_COLUMNS);
            setSubjects(parsed.subjects || INITIAL_SUBJECTS);
            if (parsed.subjects?.length > 0) setActiveSubjectId(parsed.subjects[0].id);
          } catch (e) { console.error("Failed to load local data"); }
        }
        setIsLoaded(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Sync Data from Firestore when logged in
  useEffect(() => {
    if (!user) return;

    const userDocRef = isCanvasEnv
      ? doc(db, 'artifacts', canvasAppId, 'users', user.uid, 'userdata', 'prepmap')
      : doc(db, 'users', user.uid);

    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setColumns(data.columns || INITIAL_COLUMNS);
        setSubjects(data.subjects || []);
        if (data.subjects && data.subjects.length > 0) {
          setActiveSubjectId(prev => data.subjects.find(s => s.id === prev) ? prev : data.subjects[0].id);
        } else {
          setActiveSubjectId(null);
        }
      } else {
        // First time login - upload local data to cloud
        setDoc(userDocRef, { columns, subjects });
      }
      setIsLoaded(true);
    }, (err) => {
      console.error("Firestore sync error:", err);
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, [user]);

  // Master Sync Function: Updates state AND pushes to Firestore/Local Storage
  const syncData = (newCols, newSubs) => {
    setColumns(newCols);
    setSubjects(newSubs);

    if (user && (!isCanvasEnv || !user.isAnonymous)) {
      const userDocRef = isCanvasEnv
        ? doc(db, 'artifacts', canvasAppId, 'users', user.uid, 'userdata', 'prepmap')
        : doc(db, 'users', user.uid);
      setDoc(userDocRef, { columns: newCols, subjects: newSubs }, { merge: true });
    } else {
      localStorage.setItem('prepMapData_anon', JSON.stringify({ columns: newCols, subjects: newSubs }));
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setSubjects(INITIAL_SUBJECTS);
    setColumns(INITIAL_COLUMNS);
  };

  const requestPrompt = (title, defaultValue, onComplete) => setPromptConfig({ title, value: defaultValue, onComplete });
  const requestConfirm = (title, message, onConfirm) => setConfirmConfig({ title, message, onConfirm });

  // --- Action Handlers (All use syncData) ---
  const addSubject = () => {
    requestPrompt('Enter subject name:', '', (name) => {
      if (!name) return;
      const newSubject = { id: generateId(), name, chapters: [] };
      const newSubs = [...subjects, newSubject];
      setActiveSubjectId(newSubject.id);
      syncData(columns, newSubs);
    });
  };

  const deleteSubject = (id) => {
    requestConfirm('Delete Subject', 'Are you sure you want to delete this subject and all its chapters?', () => {
      const filtered = subjects.filter(s => s.id !== id);
      if (activeSubjectId === id) setActiveSubjectId(filtered.length > 0 ? filtered[0].id : null);
      syncData(columns, filtered);
    });
  };

  const renameSubject = (id, currentName) => {
    requestPrompt('Rename subject:', currentName, (newName) => {
      if (newName && newName !== currentName) {
        syncData(columns, subjects.map(s => s.id === id ? { ...s, name: newName } : s));
      }
    });
  };

  const addChapter = (subjectId) => {
    requestPrompt('Enter chapter name:', '', (name) => {
      if (!name) return;
      syncData(columns, subjects.map(s => {
        if (s.id !== subjectId) return s;
        return { ...s, chapters: [...s.chapters, { id: generateId(), name, progress: {} }] };
      }));
    });
  };

  const deleteChapter = (subjectId, chapterId) => {
    syncData(columns, subjects.map(s => {
      if (s.id !== subjectId) return s;
      return { ...s, chapters: s.chapters.filter(c => c.id !== chapterId) };
    }));
  };

  const renameChapter = (subjectId, chapterId, currentName) => {
    requestPrompt('Rename chapter:', currentName, (newName) => {
      if (newName && newName !== currentName) {
        syncData(columns, subjects.map(s => {
          if (s.id !== subjectId) return s;
          return { ...s, chapters: s.chapters.map(c => c.id === chapterId ? { ...c, name: newName } : c) };
        }));
      }
    });
  };

  const toggleProgress = (subjectId, chapterId, colId) => {
    syncData(columns, subjects.map(s => {
      if (s.id !== subjectId) return s;
      return {
        ...s,
        chapters: s.chapters.map(c => {
          if (c.id !== chapterId) return c;
          return { ...c, progress: { ...c.progress, [colId]: !c.progress[colId] } };
        })
      };
    }));
  };

  const calculateOverallProgress = () => {
    if (subjects.length === 0 || columns.length === 0) return 0;
    let totalTasks = 0, completedTasks = 0;
    subjects.forEach(s => s.chapters.forEach(c => columns.forEach(col => {
      totalTasks++;
      if (c.progress[col.id]) completedTasks++;
    })));
    return totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
  };

  if (!isLoaded) return null;

  const activeSubject = subjects.find(s => s.id === activeSubjectId);
  const overallProgress = calculateOverallProgress();
  const isLoggedIn = user && (!isCanvasEnv || !user.isAnonymous);

  return (
    <>
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
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>

      <div className="min-h-screen bg-[#0a0a0f] text-gray-200 p-4 md:p-8 font-sans relative overflow-hidden selection:bg-purple-500/30">
        
        {/* Animated Background Textures */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600/30 rounded-full mix-blend-screen filter blur-[120px] animate-blob"></div>
          <div className="absolute top-[20%] right-[-10%] w-96 h-96 bg-blue-600/30 rounded-full mix-blend-screen filter blur-[120px] animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-[-20%] left-[20%] w-[30rem] h-[30rem] bg-pink-600/20 rounded-full mix-blend-screen filter blur-[120px] animate-blob animation-delay-4000"></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        </div>

        <div className="max-w-7xl mx-auto space-y-8 relative z-10">
          
          {/* Header */}
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
                    <span className="text-blue-400">{overallProgress}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)] transition-all duration-1000 ease-out"
                      style={{ width: `${overallProgress}%` }}
                    />
                  </div>
                </div>
              </div>

              {isLoggedIn ? (
                <button 
                  onClick={handleLogout}
                  className="group flex items-center gap-2 px-4 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-2xl transition-all duration-300 active:scale-95"
                  title="Sign Out"
                >
                  <LogOut size={18} className="text-red-400" />
                  <span className="font-semibold text-sm hidden md:inline text-red-400">Sign Out</span>
                </button>
              ) : (
                <button 
                  onClick={handleGoogleLogin}
                  className="group flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 active:scale-95"
                  title="Sign In with Google"
                >
                  <LogIn size={18} className="text-blue-400" />
                  <span className="font-semibold text-sm hidden md:inline">Sign In</span>
                </button>
              )}
              
              <button 
                onClick={() => setShowColManager(true)}
                className="group flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 active:scale-95"
                title="Manage Columns"
              >
                <Settings size={18} className="text-gray-400 group-hover:text-white transition-colors group-hover:rotate-90 duration-500" />
                <span className="font-semibold text-sm hidden md:inline">Columns</span>
              </button>
            </div>
          </header>

          {/* Tab Navigation */}
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
                {activeSubjectId === subject.id && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-gradient-to-r from-purple-400 to-blue-400 rounded-t-full shadow-[0_0_10px_rgba(168,85,247,0.8)]"></span>
                )}
              </button>
            ))}
            <button 
              onClick={addSubject}
              className="group flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 border-dashed rounded-2xl text-gray-400 hover:text-white transition-all duration-300 flex-shrink-0 active:scale-95"
            >
              <Plus size={18} className="group-hover:scale-125 transition-transform" /> 
              <span className="font-medium">New Subject</span>
            </button>
          </div>

          {/* Active Subject Content */}
          <div className="transition-all duration-500 ease-in-out">
            {activeSubject ? (
              <SubjectCard 
                subject={activeSubject}
                columns={columns}
                onRename={(newName) => renameSubject(activeSubject.id, newName)}
                onDelete={() => deleteSubject(activeSubject.id)}
                onAddChapter={() => addChapter(activeSubject.id)}
                onDeleteChapter={(chId) => deleteChapter(activeSubject.id, chId)}
                onRenameChapter={(chId, currentName) => renameChapter(activeSubject.id, chId, currentName)}
                onToggle={(chId, colId) => toggleProgress(activeSubject.id, chId, colId)}
              />
            ) : (
              <div className="glass-panel text-center py-20 rounded-3xl border border-white/5 flex flex-col items-center justify-center">
                <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-tr from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-white/10 shadow-[0_0_30px_rgba(168,85,247,0.1)]">
                  <Sparkles size={40} className="text-purple-400" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Blank Canvas</h3>
                <p className="text-gray-400 mb-8 max-w-sm">No subjects exist in your PrepMap. Initialize a new subject to begin tracking.</p>
                <button 
                  onClick={addSubject} 
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-8 py-3 rounded-xl font-bold transition-all duration-300 active:scale-95 shadow-[0_0_20px_rgba(168,85,247,0.4)] flex items-center gap-2"
                >
                  <Plus size={20} /> Initialize Subject
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modals */}
        {showColManager && (
          <ColumnManager 
            columns={columns} 
            onUpdateColumns={(newCols) => syncData(newCols, subjects)} 
            onClose={() => setShowColManager(false)}
            requestPrompt={requestPrompt}
            requestConfirm={requestConfirm}
          />
        )}
        
        {promptConfig && <PromptModal {...promptConfig} onClose={() => setPromptConfig(null)} />}
        {confirmConfig && <ConfirmModal {...confirmConfig} onClose={() => setConfirmConfig(null)} />}
      </div>
    </>
  );
}

// --- Sub-Components ---

function SubjectCard({ subject, columns, onRename, onDelete, onAddChapter, onDeleteChapter, onRenameChapter, onToggle }) {
  const totalTasks = subject.chapters.length * columns.length;
  const completedTasks = subject.chapters.reduce((acc, ch) => {
    return acc + columns.filter(col => ch.progress[col.id]).length;
  }, 0);
  const progressPercent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  return (
    <div className="glass-panel rounded-3xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Subject Header */}
      <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight drop-shadow-md">{subject.name}</h2>
          <button 
            onClick={() => onRename(subject.name)} 
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all" 
            title="Rename Subject"
          >
            <Edit2 size={16} />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 shadow-inner">
            <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"></div>
            <span className="text-xs font-bold text-gray-300 font-mono">{progressPercent}%</span>
          </div>
        </div>
        <button 
          onClick={onDelete} 
          className="group flex items-center gap-2 px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20 active:scale-95" 
          title="Delete Subject"
        >
          <Trash2 size={16} className="group-hover:scale-110 transition-transform" />
          <span className="text-sm font-semibold">Wipe Data</span>
        </button>
      </div>

      {/* Chapters Table */}
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
            {subject.chapters.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="p-12 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Sparkles size={24} className="opacity-50" />
                    <p>No modules detected. Initialize a chapter below.</p>
                  </div>
                </td>
              </tr>
            ) : (
              subject.chapters.map((chapter, i) => (
                <tr key={chapter.id} className="group hover:bg-white/[0.03] transition-colors duration-300">
                  <td className="p-6 font-medium text-gray-200 flex items-center gap-3">
                    <span className="text-gray-600 font-mono text-xs w-6">{String(i + 1).padStart(2, '0')}</span>
                    <span className="truncate">{chapter.name}</span>
                    <button 
                      onClick={() => onRenameChapter(chapter.id, chapter.name)}
                      className="text-gray-500 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all ml-auto p-1 bg-white/5 rounded-md"
                      title="Edit Chapter"
                    >
                      <Edit2 size={14} />
                    </button>
                  </td>
                  {columns.map(col => {
                    const isChecked = !!chapter.progress[col.id];
                    return (
                      <td key={col.id} className="p-4 text-center">
                        <button 
                          onClick={() => onToggle(chapter.id, col.id)}
                          className={`relative w-8 h-8 mx-auto rounded-lg flex items-center justify-center transition-all duration-300 active:scale-75
                            ${isChecked 
                              ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.6)] border border-cyan-400' 
                              : 'bg-white/5 text-transparent hover:bg-white/10 border border-white/10 hover:border-white/20'
                            }`}
                        >
                          {isChecked && <Check size={16} strokeWidth={4} className="animate-in zoom-in duration-200" />}
                        </button>
                      </td>
                    );
                  })}
                  <td className="p-6 text-right">
                    <button 
                      onClick={() => onDeleteChapter(chapter.id)}
                      className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-red-500/10 rounded-lg inline-flex"
                      title="Delete Chapter"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Add Button */}
      <div className="p-4 bg-black/20 border-t border-white/5">
        <button 
          onClick={onAddChapter}
          className="w-full py-4 flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-gray-400 hover:text-white hover:bg-white/5 border border-dashed border-white/10 hover:border-white/20 transition-all active:scale-[0.98]"
        >
          <Plus size={18} /> INITIALIZE NEW MODULE
        </button>
      </div>
    </div>
  );
}

function ColumnManager({ columns, onUpdateColumns, onClose, requestPrompt, requestConfirm }) {
  const [newColName, setNewColName] = useState('');

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    onUpdateColumns([...columns, { id: generateId(), name: newColName.trim() }]);
    setNewColName('');
  };

  const handleRemove = (id) => {
    requestConfirm('Remove Column', 'Progress data for it will be hidden but kept. Proceed?', () => {
      onUpdateColumns(columns.filter(c => c.id !== id));
    });
  };

  const handleRename = (id, currentName) => {
    requestPrompt('Rename column:', currentName, (newName) => {
      if (newName && newName.trim() !== '') {
        onUpdateColumns(columns.map(c => c.id === id ? { ...c, name: newName.trim() } : c));
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 z-40 animate-in fade-in duration-200">
      <div className="glass-panel border-white/10 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden scale-in duration-300">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <h3 className="font-bold text-xl text-white flex items-center gap-2">
            <Settings size={20} className="text-blue-400" /> Matrix Columns
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-all"><X size={20}/></button>
        </div>
        
        <div className="p-6 space-y-4">
          <ul className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
            {columns.map(col => (
              <li key={col.id} className="flex justify-between items-center bg-white/5 p-3 px-4 rounded-xl border border-white/5 hover:border-white/10 transition-colors group">
                <span className="font-semibold text-gray-200">{col.name}</span>
                <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleRename(col.id, col.name)} className="text-gray-400 hover:text-blue-400 p-2 hover:bg-white/10 rounded-lg"><Edit2 size={14}/></button>
                  <button onClick={() => handleRemove(col.id)} className="text-gray-400 hover:text-red-400 p-2 hover:bg-red-500/10 rounded-lg"><Trash2 size={14}/></button>
                </div>
              </li>
            ))}
            {columns.length === 0 && <li className="text-gray-500 text-sm text-center py-4">No columns defined.</li>}
          </ul>

          <form onSubmit={handleAdd} className="flex gap-2 mt-4 pt-6 border-t border-white/5">
            <input 
              type="text" 
              placeholder="E.g. Final Revision..." 
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-blue-500/50 focus:bg-white/10 text-white placeholder-gray-500 transition-all"
            />
            <button type="submit" className="bg-white/10 text-white border border-white/10 px-5 py-3 rounded-xl font-bold hover:bg-white/20 hover:border-white/30 transition-all active:scale-95">
              Add
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// --- Custom Overlays ---

function PromptModal({ title, value, onComplete, onClose }) {
  const [input, setInput] = useState(value || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    onComplete(input);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <form onSubmit={handleSubmit} className="glass-panel border-white/10 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <h3 className="font-bold text-xl text-white mb-4">{title}</h3>
          <input 
            autoFocus
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:outline-none focus:border-purple-500/50 text-white shadow-inner transition-colors"
          />
        </div>
        <div className="p-4 border-t border-white/5 bg-white/[0.02] flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl font-semibold transition-all">Cancel</button>
          <button type="submit" className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all active:scale-95">Save</button>
        </div>
      </form>
    </div>
  );
}

function ConfirmModal({ title, message, onConfirm, onClose }) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="glass-panel border-white/10 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <h3 className="font-bold text-xl text-white mb-2">{title}</h3>
          <p className="text-gray-400">{message}</p>
        </div>
        <div className="p-4 border-t border-white/5 bg-white/[0.02] flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl font-semibold transition-all">Cancel</button>
          <button onClick={handleConfirm} className="px-5 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20 hover:border-red-500/40 rounded-xl font-bold transition-all active:scale-95">Confirm</button>
        </div>
      </div>
    </div>
  );
}

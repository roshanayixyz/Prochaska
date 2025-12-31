
import React, { useState, useEffect } from 'react';
import { QUESTIONS } from './constants';
import { AppState, QuizProgress, EvaluationResult, Attempt } from './types';
import { evaluateAnswer } from './services/geminiService';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.HOME);
  const [customKey, setCustomKey] = useState<string>(localStorage.getItem('USER_CUSTOM_API_KEY') || '');
  const [isKeySetupOpen, setIsKeySetupOpen] = useState(false);
  const [progress, setProgress] = useState<QuizProgress>({
    currentIndex: 0,
    correctCount: 0,
    incorrectCount: 0,
    queue: QUESTIONS.map(q => q.id),
  });
  
  const [userAnswer, setUserAnswer] = useState('');
  const [lastSubmittedAnswer, setLastSubmittedAnswer] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [lastResult, setLastResult] = useState<EvaluationResult | null>(null);
  const [history, setHistory] = useState<Record<number, Attempt[]>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  // Load history from local storage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('quiz_history_v2');
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error(e); }
    }
  }, []);

  // Save history whenever it changes
  useEffect(() => {
    if (Object.keys(history).length > 0) {
      localStorage.setItem('quiz_history_v2', JSON.stringify(history));
    }
  }, [history]);

  const saveApiKey = (key: string) => {
    const trimmedKey = key.trim();
    setCustomKey(trimmedKey);
    localStorage.setItem('USER_CUSTOM_API_KEY', trimmedKey);
    setIsKeySetupOpen(false);
    setApiError(null);
  };

  const handleApiError = (error: any) => {
    const msg = error.message?.toLowerCase() || "";
    if (msg.includes("requested entity was not found")) {
      setApiError("مدل مورد نظر یافت نشد یا کلید معتبر نیست.");
      setIsKeySetupOpen(true);
    } else if (msg.includes("429") || msg.includes("quota") || msg.includes("limit")) {
      setApiError("محدودیت تعداد درخواست اکانت رایگان. کمی صبر کنید.");
    } else {
      setApiError("خطای هوش مصنوعی. کلید API را بررسی کنید.");
    }
  };

  const startQuiz = () => {
    const apiKey = customKey || process.env.API_KEY;
    if (!apiKey) {
      setIsKeySetupOpen(true);
      return;
    }
    const shuffledIds = [...QUESTIONS.map(q => q.id)].sort(() => Math.random() - 0.5);
    setProgress({ currentIndex: 0, correctCount: 0, incorrectCount: 0, queue: shuffledIds });
    setAppState(AppState.QUIZ);
    setUserAnswer('');
    setLastResult(null);
  };

  const handleNext = (shouldRepeat: boolean) => {
    const currentQuestionId = progress.queue[progress.currentIndex];
    
    if (shouldRepeat) {
      setProgress(prev => {
        const newQueue = [...prev.queue];
        // Insert the question again 4 positions later (Spaced Repetition)
        const targetIndex = prev.currentIndex + 4;
        if (targetIndex >= newQueue.length) {
          newQueue.push(currentQuestionId);
        } else {
          newQueue.splice(targetIndex, 0, currentQuestionId);
        }
        return { ...prev, queue: newQueue };
      });
    }

    if (progress.currentIndex >= progress.queue.length - 1) {
      setAppState(AppState.FINISHED);
    } else {
      setProgress(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
      setAppState(AppState.QUIZ);
      setUserAnswer('');
      setLastResult(null);
    }
  };

  const handleSubmit = async () => {
    const currentId = progress.queue[progress.currentIndex];
    const currentQ = QUESTIONS.find(q => q.id === currentId);
    const apiKey = customKey || process.env.API_KEY;
    
    if (!userAnswer.trim() || !currentQ || !apiKey) return;
    
    setIsEvaluating(true);
    setLastSubmittedAnswer(userAnswer);
    setApiError(null);
    
    try {
      const result = await evaluateAnswer(currentQ.question, currentQ.answer, userAnswer, apiKey);
      const newAttempt: Attempt = { text: userAnswer, timestamp: Date.now(), result };
      
      setHistory(prev => ({
        ...prev,
        [currentId]: [...(prev[currentId] || []), newAttempt]
      }));

      setLastResult(result);
      setAppState(AppState.RESULT);
      
      if (result.isCorrect) setProgress(prev => ({ ...prev, correctCount: prev.correctCount + 1 }));
      else setProgress(prev => ({ ...prev, incorrectCount: prev.incorrectCount + 1 }));
    } catch (error: any) {
      handleApiError(error);
    } finally {
      setIsEvaluating(false);
    }
  };

  if (isKeySetupOpen || (!customKey && !process.env.API_KEY && appState === AppState.HOME)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 font-['Vazirmatn'] text-right" dir="rtl">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-8 border border-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
          <h2 className="text-2xl font-black text-slate-800 mb-6 text-center">تنظیم کلید هوش مصنوعی</h2>
          <div className="space-y-4">
            <input 
              type="password"
              placeholder="Gemini API Key..."
              className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all outline-none font-mono text-sm"
              onBlur={(e) => setCustomKey(e.target.value)}
              defaultValue={customKey}
            />
            <button 
              onClick={() => saveApiKey(customKey)}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg active:scale-95"
            >
              ذخیره و ورود به اپ
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentId = progress.queue[progress.currentIndex];
  const currentQ = QUESTIONS.find(q => q.id === currentId);
  const currentHistory = history[currentId || 0] || [];

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4 max-w-5xl mx-auto text-slate-900 bg-slate-50 font-['Vazirmatn']" dir="rtl">
      <header className="w-full mb-8 flex items-center justify-between bg-white p-4 rounded-3xl shadow-sm">
        <div className="flex items-center">
          <div className="bg-indigo-600 text-white p-2 rounded-xl ml-3">
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          </div>
          <div>
            <h1 className="text-xl font-black text-indigo-900">نظام‌های روان‌درمانی</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Psychotherapy Systems Quiz</p>
          </div>
        </div>
        <button onClick={() => setIsKeySetupOpen(true)} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
      </header>

      <main className="w-full">
        {appState === AppState.HOME && (
          <div className="bg-white rounded-[2.5rem] shadow-xl p-8 md:p-12 text-center border border-white">
            <div className="max-w-2xl mx-auto space-y-8">
              <div className="bg-indigo-50 p-6 rounded-3xl inline-block mb-4">
                 <span className="text-5xl">🧠</span>
              </div>
              <h2 className="text-3xl font-black text-slate-800">آماده به چالش کشیدن دانسته‌های خود هستید؟</h2>
              <p className="text-slate-600 leading-loose text-lg">۱۰۰ سوال استخراج شده از کتاب پروچاسکا منتظر شماست. هوش مصنوعی پاسخ‌های تشریحی شما را تحلیل کرده و نمره می‌دهد.</p>
              <button onClick={startQuiz} className="w-full sm:w-auto px-12 py-5 bg-indigo-600 text-white rounded-2xl font-black text-xl hover:bg-indigo-700 transition-all shadow-xl active:scale-95">شروع آزمون ۱۰۰ سواله</button>
            </div>
          </div>
        )}

        {appState === AppState.QUIZ && currentQ && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-[2.5rem] shadow-xl p-8 border border-white animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center mb-6">
                  <span className="bg-indigo-100 text-indigo-700 px-4 py-1 rounded-full text-xs font-black">{currentQ.chapter}</span>
                  <div className="mr-auto text-xs font-bold text-slate-400">سوال شماره {currentId}</div>
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-800 mb-8 leading-tight">{currentQ.question}</h2>
                <textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="پاسخ خود را اینجا بنویسید..."
                  className="w-full h-64 p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-indigo-500 focus:bg-white transition-all outline-none text-slate-900 text-xl font-medium"
                  disabled={isEvaluating}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!userAnswer.trim() || isEvaluating}
                  className={`w-full mt-6 py-6 rounded-3xl font-black text-xl text-white transition-all shadow-lg flex items-center justify-center ${!userAnswer.trim() || isEvaluating ? 'bg-slate-300' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  {isEvaluating ? 'در حال تحلیل...' : 'ثبت و تصحیح پاسخ'}
                </button>
              </div>
            </div>

            <aside className="space-y-6">
              <div className="bg-white rounded-[2rem] shadow-lg p-6 border border-white">
                <h3 className="text-sm font-black text-slate-400 mb-4 border-b pb-2">تاریخچه شما برای این سوال</h3>
                {currentHistory.length > 0 ? (
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                    {currentHistory.map((h, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-xs font-bold text-slate-500">{new Date(h.timestamp).toLocaleDateString('fa-IR')}</span>
                        <span className={`text-sm font-black ${h.result.isCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>نمره: {h.result.score}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4 italic">تلاشی ثبت نشده است.</p>
                )}
              </div>
              
              <div className="bg-indigo-900 rounded-[2rem] shadow-lg p-6 text-white overflow-hidden relative">
                <div className="relative z-10">
                  <h3 className="text-xs font-bold opacity-60 mb-1">پیشرفت کلی</h3>
                  <div className="text-3xl font-black mb-4">{Math.round((progress.currentIndex / progress.queue.length) * 100)}%</div>
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-400 transition-all duration-500" style={{ width: `${(progress.currentIndex / progress.queue.length) * 100}%` }}></div>
                  </div>
                </div>
                <svg className="absolute -bottom-4 -left-4 w-24 h-24 text-white/5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
              </div>
            </aside>
          </div>
        )}

        {appState === AppState.RESULT && lastResult && (
          <div className="animate-in zoom-in-95 duration-300 space-y-8">
            <div className={`p-8 rounded-[3rem] shadow-xl border-4 text-center ${lastResult.isCorrect ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 'bg-rose-50 border-rose-100 text-rose-900'}`}>
              <div className="text-6xl font-black mb-2">{lastResult.score}<span className="text-xl opacity-40">/۱۰</span></div>
              <p className="text-2xl font-bold mb-4">{lastResult.feedback}</p>
              <div className="inline-block px-6 py-2 rounded-full font-black text-sm uppercase tracking-wider bg-white/50 border border-current opacity-60">
                {lastResult.isCorrect ? 'پذیرفته شده' : 'نیاز به مرور'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-slate-100 relative">
                <span className="absolute -top-3 right-8 bg-slate-800 text-white px-4 py-1 rounded-full text-xs font-black">آنچه شما نوشتید</span>
                <p className="text-slate-700 leading-relaxed text-lg pt-4 italic">«{lastSubmittedAnswer}»</p>
              </div>
              <div className="bg-indigo-900 p-8 rounded-[2.5rem] shadow-lg border border-indigo-800 relative text-white">
                <span className="absolute -top-3 right-8 bg-indigo-500 text-white px-4 py-1 rounded-full text-xs font-black">پاسخ مرجع کتاب</span>
                <p className="leading-relaxed text-lg pt-4 opacity-95">{currentQ?.answer}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button onClick={() => handleNext(true)} className="flex-1 py-6 bg-amber-500 text-white rounded-3xl font-black text-xl shadow-lg hover:bg-amber-600 transition-all flex items-center justify-center">
                <svg className="ml-2 w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                مرور مجدد (تکرار هوشمند)
              </button>
              <button onClick={() => handleNext(false)} className="flex-1 py-6 bg-indigo-600 text-white rounded-3xl font-black text-xl shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center">
                سوال بعدی
                <svg className="mr-2 w-6 h-6 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
          </div>
        )}

        {appState === AppState.FINISHED && (
          <div className="text-center bg-white p-12 rounded-[3rem] shadow-2xl border border-white">
            <h2 className="text-5xl font-black text-indigo-900 mb-6">پایان درخشان!</h2>
            <p className="text-xl text-slate-500 mb-10">شما تمام مسیر را با موفقیت طی کردید. نمرات شما در حافظه مرورگر ذخیره شده است.</p>
            <button onClick={startQuiz} className="px-16 py-6 bg-indigo-600 text-white rounded-2xl font-black text-2xl shadow-xl hover:bg-indigo-700 transition-all">شروع دوباره چالش</button>
          </div>
        )}
      </main>

      {apiError && (
        <div className="fixed bottom-6 right-6 left-6 md:right-auto md:w-96 bg-rose-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between z-50 animate-in slide-in-from-bottom-10">
          <div className="flex items-center">
            <svg className="w-6 h-6 ml-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span className="text-sm font-bold">{apiError}</span>
          </div>
          <button onClick={() => setApiError(null)} className="p-1 hover:bg-white/20 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default App;

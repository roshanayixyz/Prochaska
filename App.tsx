
import React, { useState, useEffect } from 'react';
import { QUESTIONS } from './constants';
import { AppState, QuizProgress, Question, EvaluationResult, Attempt } from './types';
import { evaluateAnswer } from './services/geminiService';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.HOME);
  const [progress, setProgress] = useState<QuizProgress>({
    currentIndex: 0,
    correctCount: 0,
    incorrectCount: 0,
    queue: QUESTIONS.map(q => q.id),
  });
  
  const [userAnswer, setUserAnswer] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [lastResult, setLastResult] = useState<EvaluationResult | null>(null);
  const [history, setHistory] = useState<Record<number, Attempt[]>>({});
  const [frozenPreviousAttempt, setFrozenPreviousAttempt] = useState<Attempt | null>(null);
  const [apiError, setApiError] = useState<'quota' | 'general' | null>(null);

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('quiz_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    if (Object.keys(history).length > 0) {
      localStorage.setItem('quiz_history', JSON.stringify(history));
    }
  }, [history]);

  const currentQuestionId = progress.queue[progress.currentIndex];
  const currentQuestion = QUESTIONS.find(q => q.id === currentQuestionId);
  
  const getMostRecentAttempt = (qId: number) => {
    const attempts = history[qId] || [];
    return attempts.length > 0 ? attempts[attempts.length - 1] : null;
  };

  const handleOpenKeyDialog = async () => {
    if (window.aistudio?.openSelectKey) {
      try {
        await window.aistudio.openSelectKey();
        setApiError(null);
      } catch (e) {
        console.error("Failed to open key dialog", e);
      }
    } else {
      alert("سیستم انتخاب کلید در این محیط در دسترس نیست.");
    }
  };

  const startQuiz = () => {
    const shuffledIds = [...QUESTIONS.map(q => q.id)].sort(() => Math.random() - 0.5);
    setProgress({
      currentIndex: 0,
      correctCount: 0,
      incorrectCount: 0,
      queue: shuffledIds,
    });
    setAppState(AppState.QUIZ);
    setUserAnswer('');
    setLastResult(null);
    setFrozenPreviousAttempt(null);
    setApiError(null);
  };

  const handleNext = (shouldRepeat: boolean) => {
    if (shouldRepeat && currentQuestion) {
      setProgress(prev => {
        const newQueue = [...prev.queue];
        const nextTime = Math.floor(Math.random() * 5) + 3;
        const targetIndex = prev.currentIndex + nextTime;
        if (targetIndex >= newQueue.length) newQueue.push(currentQuestion.id);
        else newQueue.splice(targetIndex, 0, currentQuestion.id);
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
      setFrozenPreviousAttempt(null);
      setApiError(null);
    }
  };

  const handleSubmit = async () => {
    if (!userAnswer.trim() || !currentQuestion) return;

    const lastOne = getMostRecentAttempt(currentQuestion.id);
    setFrozenPreviousAttempt(lastOne);

    setIsEvaluating(true);
    setApiError(null);
    
    try {
      const result = await evaluateAnswer(currentQuestion.question, currentQuestion.answer, userAnswer);
      
      const newAttempt: Attempt = {
        text: userAnswer,
        timestamp: Date.now(),
        result: result
      };
      
      setHistory(prev => ({
        ...prev,
        [currentQuestion.id]: [...(prev[currentQuestion.id] || []), newAttempt]
      }));

      setLastResult(result);
      setAppState(AppState.RESULT);

      if (result.isCorrect) {
        setProgress(prev => ({ ...prev, correctCount: prev.correctCount + 1 }));
      } else {
        setProgress(prev => ({ ...prev, incorrectCount: prev.incorrectCount + 1 }));
      }
    } catch (error: any) {
      console.error("Submission Error:", error);
      const errorMessage = error.message?.toLowerCase() || "";
      
      if (errorMessage.includes("quota") || errorMessage.includes("429") || errorMessage.includes("resource_exhausted")) {
        setApiError("quota");
      } else if (errorMessage.includes("not found")) {
        // According to instructions: if "Requested entity was not found", reset and prompt
        setApiError("quota");
        handleOpenKeyDialog();
      } else {
        setApiError("general");
      }
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4 max-w-4xl mx-auto text-slate-900 bg-slate-50 font-['Vazirmatn']">
      <header className="w-full mb-8 flex items-center justify-between">
        <div className="w-10 h-10"></div> 
        <div className="text-center">
          <h1 className="text-3xl font-black text-indigo-800 mb-2">یادگیری عمیق روان‌درمانی</h1>
          <div className="h-1.5 w-20 bg-indigo-500 mx-auto rounded-full"></div>
        </div>
        <button 
          onClick={handleOpenKeyDialog}
          className="group relative w-12 h-12 bg-white shadow-lg rounded-2xl flex items-center justify-center text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all border border-indigo-100"
          title="تنظیم کلید API اختصاصی"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <span className="absolute -bottom-10 right-0 bg-slate-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-bold">تغییر کلید API</span>
        </button>
      </header>

      <main className="w-full bg-white shadow-2xl shadow-indigo-100 rounded-[2.5rem] p-6 md:p-12 border border-white">
        {appState === AppState.HOME && (
          <div className="text-center space-y-8 py-4">
            <div className="bg-indigo-50/50 p-8 rounded-3xl text-indigo-900 text-right space-y-4 border border-indigo-100">
              <h3 className="font-black text-2xl flex items-center">
                <span className="bg-indigo-600 text-white w-8 h-8 rounded-lg flex items-center justify-center ml-3 text-base">۱</span>
                استفاده از کلید شخصی (خارجی)
              </h3>
              <p className="leading-loose text-lg opacity-90">
                اگر کلید API اختصاصی دارید، می‌توانید با کلیک روی آیکون <span className="inline-block p-1 bg-white border rounded mx-1">🔑</span> در بالا، آن را متصل کنید. این کار به شما اجازه می‌دهد بدون محدودیت سهمیه (Quota) مطالعه کنید.
              </p>
              <div className="bg-indigo-600 text-white p-4 rounded-2xl text-sm font-bold flex items-center shadow-lg shadow-indigo-100">
                <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                پیشنهاد: برای پایداری بیشتر، از کلید اختصاصی خود استفاده کنید.
              </div>
            </div>
            <button
              onClick={startQuiz}
              className="px-16 py-6 bg-indigo-600 text-white rounded-3xl font-black text-2xl hover:bg-indigo-700 transition-all shadow-xl active:scale-95"
            >
              شروع مطالعه هوشمند
            </button>
          </div>
        )}

        {appState === AppState.QUIZ && currentQuestion && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <span className="text-sm font-black text-indigo-700">{currentQuestion.chapter}</span>
              <span className="text-sm font-bold text-slate-400">سوال {progress.currentIndex + 1} از {progress.queue.length}</span>
            </div>

            <h2 className="text-2xl md:text-3xl font-black text-slate-800 leading-tight">
              {currentQuestion.question}
            </h2>

            <div className="relative">
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="پاسخ خود را اینجا بنویسید..."
                className="w-full h-64 p-6 bg-slate-50 border-2 border-slate-200 rounded-[1.5rem] focus:border-indigo-500 focus:bg-white focus:ring-8 focus:ring-indigo-500/5 transition-all outline-none text-slate-900 text-xl leading-relaxed font-medium"
                disabled={isEvaluating}
              />
            </div>

            {apiError && (
              <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-2xl text-amber-900 space-y-4 animate-in slide-in-from-top-4">
                <div className="flex items-center font-black text-lg">
                  <svg className="w-6 h-6 ml-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  {apiError === 'quota' ? 'محدودیت سهمیه (Quota) یا کلید نامعتبر' : 'خطای غیرمنتظره'}
                </div>
                <p className="text-sm leading-relaxed opacity-90">
                  برای ادامه بدون وقفه، روی دکمه زیر کلیک کنید و پروژه‌ای را انتخاب کنید که دارای اعتبار است. این کار به شما اجازه می‌دهد از سهمیه شخصی خود استفاده کنید.
                </p>
                <button 
                  onClick={handleOpenKeyDialog}
                  className="w-full py-4 bg-amber-600 text-white rounded-xl font-black hover:bg-amber-700 transition-all shadow-lg flex items-center justify-center"
                >
                  <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                  اتصال کلید اختصاصی (از اکانت دیگر)
                </button>
                <div className="text-center">
                  <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-[10px] underline opacity-50">درباره فعال‌سازی Billing و دریافت کلید بیشتر بخوانید</a>
                </div>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!userAnswer.trim() || isEvaluating}
              className={`w-full py-6 rounded-3xl font-black text-xl text-white transition-all shadow-lg flex items-center justify-center space-x-2 space-x-reverse ${
                !userAnswer.trim() || isEvaluating
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'
              }`}
            >
              {isEvaluating ? (
                <>
                  <svg className="animate-spin h-7 w-7 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>تحلیل با هوش مصنوعی...</span>
                </>
              ) : (
                'بررسی و ثبت پاسخ'
              )}
            </button>
          </div>
        )}

        {appState === AppState.RESULT && lastResult && (
          <div className="space-y-8 animate-in zoom-in-95 duration-300">
            <div className={`p-8 rounded-[2rem] flex flex-col items-center text-center space-y-4 border-2 ${
              lastResult.isCorrect ? 'bg-emerald-50 text-emerald-900 border-emerald-100' : 'bg-rose-50 text-rose-900 border-rose-100'
            }`}>
              <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-xl mb-2 ${
                lastResult.isCorrect ? 'bg-emerald-500' : 'bg-rose-500'
              }`}>
                <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {lastResult.isCorrect ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} d="M5 13l4 4L19 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} d="M6 18L18 6M6 6l12 12" />
                  )}
                </svg>
              </div>
              <h3 className="text-4xl font-black">نمره: {lastResult.score}/۱۰</h3>
              <p className="text-2xl font-bold leading-relaxed">{lastResult.feedback}</p>
            </div>

            <div className="space-y-4">
              <h4 className="font-black text-slate-500 text-lg mr-2">مقایسه عملکرد:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-indigo-50/40 border-2 border-indigo-100 p-6 rounded-3xl relative">
                   <div className="absolute -top-3 right-6 bg-indigo-600 text-white text-[10px] px-3 py-1 rounded-full font-black uppercase">این بار</div>
                   <p className="text-slate-800 text-lg leading-relaxed mt-2">{userAnswer}</p>
                </div>
                
                {frozenPreviousAttempt ? (
                  <div className="bg-slate-100/50 border-2 border-slate-200 p-6 rounded-3xl relative">
                    <div className="absolute -top-3 right-6 bg-slate-500 text-white text-[10px] px-3 py-1 rounded-full font-black uppercase">بار قبل</div>
                    <p className="text-slate-500 text-lg leading-relaxed mt-2 italic">{frozenPreviousAttempt.text}</p>
                    <div className="mt-4 flex items-center justify-between text-[10px] font-black text-slate-400">
                      <span>{new Date(frozenPreviousAttempt.timestamp).toLocaleDateString('fa-IR')}</span>
                      <span>نمره قبلی: {frozenPreviousAttempt.result.score}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-6 rounded-3xl flex items-center justify-center text-slate-400 font-bold italic">
                    اولین تلاش شما برای این سوال
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-2xl relative">
              <div className="absolute -top-3 right-8 bg-indigo-500 px-4 py-1 rounded-full text-xs font-black">پاسخ مرجع کتاب</div>
              <p className="leading-loose text-xl opacity-95">{currentQuestion?.answer}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button
                onClick={() => handleNext(true)}
                className="flex-1 py-6 bg-amber-500 text-white rounded-3xl font-black text-xl hover:bg-amber-600 transition-all shadow-lg active:scale-95"
              >
                تکرار رندوم (مرور)
              </button>
              <button
                onClick={() => handleNext(false)}
                className="flex-1 py-6 bg-indigo-600 text-white rounded-3xl font-black text-xl hover:bg-indigo-700 transition-all shadow-lg active:scale-95"
              >
                سوال بعدی
              </button>
            </div>
          </div>
        )}

        {appState === AppState.FINISHED && (
          <div className="text-center space-y-10 py-12">
            <h2 className="text-6xl font-black text-indigo-800">خسته نباشید!</h2>
            <p className="text-slate-500 text-2xl font-bold">تمام سوالات این راند را با موفقیت پشت سر گذاشتید.</p>
            <button
              onClick={startQuiz}
              className="px-20 py-7 bg-indigo-600 text-white rounded-[2rem] font-black text-3xl hover:bg-indigo-700 transition-all shadow-2xl"
            >
              شروع دوباره
            </button>
          </div>
        )}
      </main>

      {/* Progress Footer */}
      {(appState === AppState.QUIZ || appState === AppState.RESULT) && (
        <div className="w-full mt-10 bg-white shadow-xl p-6 rounded-[2.5rem] border border-slate-100 flex items-center">
           <div className="flex-1 ml-8">
            <div className="flex justify-between mb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span>پیشرفت آزمون فعلی</span>
              <span>{Math.round((progress.currentIndex / progress.queue.length) * 100)}%</span>
            </div>
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden p-1 shadow-inner">
              <div 
                className="h-full bg-gradient-to-l from-indigo-600 to-indigo-400 rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${(progress.currentIndex / progress.queue.length) * 100}%` }}
              ></div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center bg-indigo-600 text-white w-20 h-20 rounded-[1.5rem] shadow-lg shadow-indigo-100">
             <span className="text-2xl font-black">{progress.currentIndex + 1}</span>
             <span className="text-[10px] font-bold opacity-60 mt-1 uppercase">سوال</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

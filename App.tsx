
import React, { useState, useEffect, useRef } from 'react';
import { QUESTIONS } from './constants';
import { AppState, QuizProgress, Question, EvaluationResult, Attempt } from './types';
import { evaluateAnswer } from './services/geminiService';
import { generateQuestionAudio } from './services/ttsService';

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
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [lastResult, setLastResult] = useState<EvaluationResult | null>(null);
  const [history, setHistory] = useState<Record<number, Attempt[]>>({});
  const [apiError, setApiError] = useState<'quota' | 'key_missing' | 'general' | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);

  // Sync custom key with process.env for services
  useEffect(() => {
    if (customKey) {
      process.env.API_KEY = customKey;
      localStorage.setItem('USER_CUSTOM_API_KEY', customKey);
    }
  }, [customKey]);

  useEffect(() => {
    const savedHistory = localStorage.getItem('quiz_history');
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    if (Object.keys(history).length > 0) {
      localStorage.setItem('quiz_history', JSON.stringify(history));
    }
  }, [history]);

  const handleConnectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      try {
        await window.aistudio.openSelectKey();
        setApiError(null);
      } catch (e) {
        setIsKeySetupOpen(true);
      }
    } else {
      setIsKeySetupOpen(true);
    }
  };

  const playQuestionAudio = async () => {
    const currentQuestionId = progress.queue[progress.currentIndex];
    const currentQuestion = QUESTIONS.find(q => q.id === currentQuestionId);
    
    if (!currentQuestion || isPlayingAudio) return;
    if (!process.env.API_KEY && !customKey) {
      setIsKeySetupOpen(true);
      return;
    }

    setIsPlayingAudio(true);
    setApiError(null);
    try {
      const buffer = await generateQuestionAudio(currentQuestion.question);
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsPlayingAudio(false);
      source.start();
    } catch (error: any) {
      console.error("TTS Error:", error);
      setIsPlayingAudio(false);
      handleApiError(error);
    }
  };

  const handleApiError = (error: any) => {
    const msg = error.message?.toLowerCase() || "";
    if (msg.includes("api_key") || msg.includes("key") || msg.includes("401") || msg.includes("403")) {
      setApiError("key_missing");
      setIsKeySetupOpen(true);
    } else if (msg.includes("429") || msg.includes("quota")) {
      setApiError("quota");
    } else {
      setApiError("general");
    }
  };

  const startQuiz = () => {
    if (!process.env.API_KEY && !customKey) {
      setIsKeySetupOpen(true);
      return;
    }
    const shuffledIds = [...QUESTIONS.map(q => q.id)].sort(() => Math.random() - 0.5);
    setProgress({ currentIndex: 0, correctCount: 0, incorrectCount: 0, queue: shuffledIds });
    setAppState(AppState.QUIZ);
    setUserAnswer('');
    setLastResult(null);
    setApiError(null);
  };

  const handleNext = (shouldRepeat: boolean) => {
    const currentQuestionId = progress.queue[progress.currentIndex];
    const currentQuestion = QUESTIONS.find(q => q.id === currentQuestionId);

    if (shouldRepeat && currentQuestion) {
      setProgress(prev => {
        const newQueue = [...prev.queue];
        const targetIndex = prev.currentIndex + 4;
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
      setApiError(null);
    }
  };

  const handleSubmit = async () => {
    const currentQuestionId = progress.queue[progress.currentIndex];
    const currentQuestion = QUESTIONS.find(q => q.id === currentQuestionId);
    
    if (!userAnswer.trim() || !currentQuestion) return;
    setIsEvaluating(true);
    setApiError(null);
    
    try {
      const result = await evaluateAnswer(currentQuestion.question, currentQuestion.answer, userAnswer);
      const newAttempt: Attempt = { text: userAnswer, timestamp: Date.now(), result };
      setHistory(prev => ({ ...prev, [currentQuestion.id]: [...(prev[currentQuestion.id] || []), newAttempt] }));
      setLastResult(result);
      setAppState(AppState.RESULT);
      if (result.isCorrect) setProgress(prev => ({ ...prev, correctCount: prev.correctCount + 1 }));
      else setProgress(prev => ({ ...prev, incorrectCount: prev.incorrectCount + 1 }));
    } catch (error: any) {
      console.error("Evaluation Error:", error);
      handleApiError(error);
    } finally {
      setIsEvaluating(false);
    }
  };

  // UI for Key Setup
  if (isKeySetupOpen || (!customKey && !process.env.API_KEY && appState === AppState.HOME)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 font-['Vazirmatn'] text-right" dir="rtl">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-8 border border-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2 text-center">تنظیم کلید هوش مصنوعی</h2>
          <p className="text-slate-500 text-sm mb-8 text-center leading-relaxed">برای استفاده از سیستم تحلیل پاسخ‌ها و صوت، لطفاً کلید API خود را وارد کنید. این کلید فقط در مرورگر شما ذخیره می‌شود.</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-400 mb-2 mr-2 uppercase tracking-wider">Gemini API Key</label>
              <input 
                type="password"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all outline-none font-mono text-sm"
              />
            </div>
            
            <button 
              onClick={() => { if(customKey) setIsKeySetupOpen(false); }}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg active:scale-95 disabled:opacity-50"
              disabled={!customKey}
            >
              ذخیره و ادامه
            </button>
            
            <div className="pt-2 text-center">
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-indigo-500 font-bold hover:underline">دریافت کلید رایگان از Google AI Studio</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestionId = progress.queue[progress.currentIndex];
  const currentQuestion = QUESTIONS.find(q => q.id === currentQuestionId);

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4 max-w-4xl mx-auto text-slate-900 bg-slate-50 font-['Vazirmatn']" dir="rtl">
      <header className="w-full mb-8 flex items-center justify-between">
        <div className="w-10"></div> 
        <div className="text-center">
          <h1 className="text-3xl font-black text-indigo-900 mb-1">نظام‌های روان‌درمانی</h1>
          <p className="text-sm text-slate-500 font-medium">آزمون جامع بر اساس پروچاسکا</p>
        </div>
        <button onClick={handleConnectKey} className="w-12 h-12 bg-white shadow-md rounded-2xl flex items-center justify-center text-indigo-600 border border-indigo-50 transition-all hover:bg-indigo-600 hover:text-white group relative">
          <svg className="w-6 h-6 transition-transform group-hover:rotate-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
          {customKey && <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></span>}
        </button>
      </header>

      <main className="w-full bg-white shadow-xl rounded-[2.5rem] p-6 md:p-12 border border-white relative overflow-hidden">
        {apiError && (
          <div className="mb-6 bg-red-50 border-2 border-red-100 p-4 rounded-2xl text-red-800 text-sm flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-5 h-5 ml-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              <span>{apiError === 'quota' ? 'سهمیه استفاده شما تمام شده است.' : 'خطایی در ارتباط با هوش مصنوعی رخ داد.'}</span>
            </div>
            <button onClick={() => setIsKeySetupOpen(true)} className="bg-white px-3 py-1 rounded-lg border border-red-200 text-xs font-black hover:bg-red-100 transition-colors">بررسی کلید</button>
          </div>
        )}

        {appState === AppState.HOME && (
          <div className="text-center space-y-8 py-4">
            <div className="bg-indigo-50/50 p-8 rounded-3xl text-indigo-900 text-right border border-indigo-100">
              <h3 className="font-black text-2xl flex items-center mb-4">
                <span className="bg-indigo-600 text-white w-8 h-8 rounded-lg flex items-center justify-center ml-3 text-base">⭐</span>
                خوش آمدید
              </h3>
              <p className="leading-loose text-lg opacity-90">
                این اپلیکیشن شامل ۱۰۰ سوال تخصصی از کتاب «نظریه‌های روان‌درمانی» پروچاسکا است. پاسخ‌های شما توسط هوش مصنوعی تحلیل شده و فیدبک آموزشی دریافت می‌کنید.
              </p>
            </div>
            <button onClick={startQuiz} className="px-16 py-6 bg-indigo-600 text-white rounded-3xl font-black text-2xl hover:bg-indigo-700 transition-all shadow-xl active:scale-95">
              شروع چالش ۱۰۰ سوال
            </button>
          </div>
        )}

        {appState === AppState.QUIZ && currentQuestion && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <span className="text-sm font-black text-indigo-700">{currentQuestion.chapter}</span>
              <button onClick={playQuestionAudio} disabled={isPlayingAudio} className={`flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl transition-all ${isPlayingAudio ? 'bg-indigo-100 text-indigo-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md'}`}>
                <svg className={`w-5 h-5 ${isPlayingAudio ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                <span className="text-xs font-bold">{isPlayingAudio ? 'در حال پخش...' : 'شنیدن سوال'}</span>
              </button>
            </div>

            <h2 className="text-2xl md:text-3xl font-black text-slate-800 leading-tight">{currentQuestion.question}</h2>

            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="پاسخ خود را کامل بنویسید..."
              className="w-full h-64 p-6 bg-slate-50 border-2 border-slate-200 rounded-[1.5rem] focus:border-indigo-500 focus:bg-white transition-all outline-none text-slate-900 text-xl font-medium"
              disabled={isEvaluating}
            />

            <button
              onClick={handleSubmit}
              disabled={!userAnswer.trim() || isEvaluating}
              className={`w-full py-6 rounded-3xl font-black text-xl text-white transition-all shadow-lg flex items-center justify-center ${!userAnswer.trim() || isEvaluating ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'}`}
            >
              {isEvaluating ? (
                <div className="flex items-center space-x-2 space-x-reverse">
                  <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span>در حال تحلیل توسط هوش مصنوعی...</span>
                </div>
              ) : 'ارسال برای تصحیح'}
            </button>
          </div>
        )}

        {appState === AppState.RESULT && lastResult && (
          <div className="space-y-8 animate-in zoom-in-95 duration-300">
            <div className={`p-8 rounded-[2rem] text-center border-2 ${lastResult.isCorrect ? 'bg-emerald-50 text-emerald-900 border-emerald-100' : 'bg-rose-50 text-rose-900 border-rose-100'}`}>
              <div className="text-5xl font-black mb-2">{lastResult.score}/۱۰</div>
              <p className="text-xl font-bold">{lastResult.feedback}</p>
            </div>

            <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-2xl relative">
              <div className="absolute -top-3 right-8 bg-indigo-500 px-4 py-1 rounded-full text-xs font-black">پاسخ صحیح (کتاب)</div>
              <p className="leading-loose text-xl opacity-95">{currentQuestion?.answer}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button onClick={() => handleNext(true)} className="flex-1 py-6 bg-amber-500 text-white rounded-3xl font-black text-xl shadow-lg hover:bg-amber-600 transition-all">مرور مجدد این سوال</button>
              <button onClick={() => handleNext(false)} className="flex-1 py-6 bg-indigo-600 text-white rounded-3xl font-black text-xl shadow-lg hover:bg-indigo-700 transition-all">سوال بعدی</button>
            </div>
          </div>
        )}

        {appState === AppState.FINISHED && (
          <div className="text-center py-12 space-y-8">
            <div className="inline-block p-6 bg-indigo-50 rounded-full mb-4">
               <svg className="w-20 h-20 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            </div>
            <h2 className="text-5xl font-black text-indigo-900">تبریک! دوره تمام شد</h2>
            <p className="text-xl text-slate-600">شما تمام ۱۰۰ سوال را با موفقیت پشت سر گذاشتید.</p>
            <button onClick={startQuiz} className="px-20 py-7 bg-indigo-600 text-white rounded-[2rem] font-black text-2xl shadow-2xl hover:bg-indigo-700 transition-all">شروع مجدد آزمون</button>
          </div>
        )}
      </main>

      {(appState === AppState.QUIZ || appState === AppState.RESULT) && (
        <div className="w-full mt-10 bg-white shadow-lg p-6 rounded-[2.5rem] flex items-center">
           <div className="flex-1 ml-8">
            <div className="flex justify-between text-xs font-black text-indigo-900 mb-2 px-1">
              <span>پیشرفت آزمون</span>
              <span>{Math.round(((progress.currentIndex) / progress.queue.length) * 100)}%</span>
            </div>
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden p-1">
              <div className="h-full bg-indigo-600 rounded-full transition-all duration-700" style={{ width: `${(progress.currentIndex / progress.queue.length) * 100}%` }}></div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center bg-indigo-600 text-white w-20 h-20 rounded-[1.5rem] shadow-lg">
             <span className="text-2xl font-black">{progress.currentIndex + 1}</span>
             <span className="text-[10px] font-bold opacity-60">از {progress.queue.length}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

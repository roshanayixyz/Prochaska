
import React, { useState, useEffect, useRef } from 'react';
import { QUESTIONS } from './constants';
import { AppState, QuizProgress, Question, EvaluationResult, Attempt } from './types';
import { evaluateAnswer } from './services/geminiService';
import { generateQuestionAudio } from './services/ttsService';

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
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [lastResult, setLastResult] = useState<EvaluationResult | null>(null);
  const [history, setHistory] = useState<Record<number, Attempt[]>>({});
  const [frozenPreviousAttempt, setFrozenPreviousAttempt] = useState<Attempt | null>(null);
  const [apiError, setApiError] = useState<'quota' | 'general' | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);

  // Persistence logic
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

  const currentQuestionId = progress.queue[progress.currentIndex];
  const currentQuestion = QUESTIONS.find(q => q.id === currentQuestionId);

  const handleSelectKey = async () => {
    // Only works if window.aistudio is present (AI Studio Environment)
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setApiError(null);
    } else {
      alert("شما در محیط Cloudflare هستید. برای رفع محدودیت سهمیه، باید مقدار API_KEY را در تنظیمات (Environment Variables) داشبورد Cloudflare خود وارد کنید.");
    }
  };

  const playQuestionAudio = async () => {
    if (!currentQuestion || isPlayingAudio) return;
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
      if (error.message?.includes("429") || error.message?.includes("quota")) setApiError("quota");
    }
  };

  const startQuiz = () => {
    const shuffledIds = [...QUESTIONS.map(q => q.id)].sort(() => Math.random() - 0.5);
    setProgress({ currentIndex: 0, correctCount: 0, incorrectCount: 0, queue: shuffledIds });
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
      setFrozenPreviousAttempt(null);
      setApiError(null);
    }
  };

  const handleSubmit = async () => {
    if (!userAnswer.trim() || !currentQuestion) return;
    const lastOne = (history[currentQuestion.id] || []).slice(-1)[0] || null;
    setFrozenPreviousAttempt(lastOne);
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
      if (error.message?.includes("429") || error.message?.includes("quota")) setApiError("quota");
      else setApiError("general");
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4 max-w-4xl mx-auto text-slate-900 bg-slate-50 font-['Vazirmatn']" dir="rtl">
      <header className="w-full mb-8 flex items-center justify-between">
        <div className="w-10 h-10"></div> 
        <div className="text-center">
          <h1 className="text-3xl font-black text-indigo-800 mb-2">یادگیری عمیق روان‌درمانی</h1>
          <div className="h-1.5 w-20 bg-indigo-500 mx-auto rounded-full"></div>
        </div>
        {window.aistudio && (
          <button onClick={handleSelectKey} className="w-12 h-12 bg-white shadow-lg rounded-2xl flex items-center justify-center text-indigo-600 border border-indigo-100 transition-all hover:bg-indigo-600 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
          </button>
        )}
      </header>

      <main className="w-full bg-white shadow-2xl shadow-indigo-100 rounded-[2.5rem] p-6 md:p-12 border border-white">
        {appState === AppState.HOME && (
          <div className="text-center space-y-8 py-4">
            <div className="bg-indigo-50/50 p-8 rounded-3xl text-indigo-900 text-right border border-indigo-100">
              <h3 className="font-black text-2xl flex items-center mb-4">
                <span className="bg-indigo-600 text-white w-8 h-8 rounded-lg flex items-center justify-center ml-3 text-base">🔊</span>
                بخش صوتی فعال است
              </h3>
              <p className="leading-loose text-lg opacity-90">
                در این نسخه می‌توانید سوالات را با صدای هوش مصنوعی گوش دهید. همچنین پاسخ‌های شما با دقت تحلیل می‌شوند.
              </p>
            </div>
            <button onClick={startQuiz} className="px-16 py-6 bg-indigo-600 text-white rounded-3xl font-black text-2xl hover:bg-indigo-700 transition-all shadow-xl active:scale-95">
              شروع آزمون
            </button>
          </div>
        )}

        {appState === AppState.QUIZ && currentQuestion && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <span className="text-sm font-black text-indigo-700">{currentQuestion.chapter}</span>
              <button onClick={playQuestionAudio} disabled={isPlayingAudio} className={`flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl transition-all ${isPlayingAudio ? 'bg-indigo-100 text-indigo-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md'}`}>
                <svg className={`w-5 h-5 ${isPlayingAudio ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                <span className="text-xs font-bold">{isPlayingAudio ? 'در حال قرائت...' : 'بخوان'}</span>
              </button>
            </div>

            <h2 className="text-2xl md:text-3xl font-black text-slate-800 leading-tight">{currentQuestion.question}</h2>

            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="پاسخ تشریحی خود را اینجا بنویسید..."
              className="w-full h-64 p-6 bg-slate-50 border-2 border-slate-200 rounded-[1.5rem] focus:border-indigo-500 focus:bg-white transition-all outline-none text-slate-900 text-xl font-medium"
              disabled={isEvaluating}
            />

            {apiError === 'quota' && (
              <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-2xl text-amber-900 space-y-3">
                <div className="flex items-center font-black">
                  <svg className="w-6 h-6 ml-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  سهمیه رایگان تمام شد
                </div>
                <p className="text-sm opacity-80 leading-relaxed">
                  هوش مصنوعی به دلیل سهمیه رایگان دیگر پاسخگو نیست. لطفاً در پنل Cloudflare خود، کلید API شخصی را در متغیرهای محیطی با نام <code className="bg-amber-200 px-1 rounded">API_KEY</code> تنظیم کنید.
                </p>
                <button onClick={handleSelectKey} className="w-full py-3 bg-amber-600 text-white rounded-xl font-black shadow-lg">راهنمای کلید</button>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!userAnswer.trim() || isEvaluating}
              className={`w-full py-6 rounded-3xl font-black text-xl text-white transition-all shadow-lg flex items-center justify-center space-x-2 space-x-reverse ${!userAnswer.trim() || isEvaluating ? 'bg-slate-300' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {isEvaluating ? <span>در حال تحلیل هوشمند...</span> : 'ثبت و بررسی پاسخ'}
            </button>
          </div>
        )}

        {appState === AppState.RESULT && lastResult && (
          <div className="space-y-8 animate-in zoom-in-95 duration-300">
            <div className={`p-8 rounded-[2rem] text-center border-2 ${lastResult.isCorrect ? 'bg-emerald-50 text-emerald-900 border-emerald-100' : 'bg-rose-50 text-rose-900 border-rose-100'}`}>
              <h3 className="text-4xl font-black">نمره: {lastResult.score}/۱۰</h3>
              <p className="text-xl font-bold mt-4">{lastResult.feedback}</p>
            </div>

            <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-2xl relative">
              <div className="absolute -top-3 right-8 bg-indigo-500 px-4 py-1 rounded-full text-xs font-black">پاسخ مرجع کتاب</div>
              <p className="leading-loose text-xl opacity-95">{currentQuestion?.answer}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button onClick={() => handleNext(true)} className="flex-1 py-6 bg-amber-500 text-white rounded-3xl font-black text-xl shadow-lg">مرور رندوم</button>
              <button onClick={() => handleNext(false)} className="flex-1 py-6 bg-indigo-600 text-white rounded-3xl font-black text-xl shadow-lg">سوال بعدی</button>
            </div>
          </div>
        )}

        {appState === AppState.FINISHED && (
          <div className="text-center py-12">
            <h2 className="text-6xl font-black text-indigo-800 mb-6">پایان دوره</h2>
            <button onClick={startQuiz} className="px-20 py-7 bg-indigo-600 text-white rounded-[2rem] font-black text-3xl shadow-2xl">شروع دوباره</button>
          </div>
        )}
      </main>

      {(appState === AppState.QUIZ || appState === AppState.RESULT) && (
        <div className="w-full mt-10 bg-white shadow-xl p-6 rounded-[2.5rem] flex items-center">
           <div className="flex-1 ml-8">
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden p-1">
              <div className="h-full bg-indigo-600 rounded-full transition-all duration-1000" style={{ width: `${(progress.currentIndex / progress.queue.length) * 100}%` }}></div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center bg-indigo-600 text-white w-20 h-20 rounded-[1.5rem] shadow-lg">
             <span className="text-2xl font-black">{progress.currentIndex + 1}</span>
             <span className="text-[10px] font-bold opacity-60">سوال</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

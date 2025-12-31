
export interface Question {
  id: number;
  chapter: string;
  question: string;
  answer: string;
}

export interface EvaluationResult {
  isCorrect: boolean;
  score: number;
  feedback: string;
}

export interface Attempt {
  text: string;
  timestamp: number;
  result: EvaluationResult;
}

export enum AppState {
  HOME = 'HOME',
  QUIZ = 'QUIZ',
  RESULT = 'RESULT',
  FINISHED = 'FINISHED'
}

export interface QuizProgress {
  currentIndex: number;
  correctCount: number;
  incorrectCount: number;
  queue: number[]; // IDs of questions to ask
}

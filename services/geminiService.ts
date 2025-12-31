
import { GoogleGenAI, Type } from "@google/genai";
import { EvaluationResult } from "../types";

export const evaluateAnswer = async (
  question: string,
  correctAnswer: string,
  userAnswer: string,
  apiKey: string
): Promise<EvaluationResult> => {
  // استفاده از مدل قدرتمند gemini-3-pro-preview برای تحلیل متون پیچیده
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `
        Analyze the student's answer for this psychology question.
        
        Question: ${question}
        Official Answer Key: ${correctAnswer}
        Student's Answer: ${userAnswer}

        Task:
        1. Compare the student's answer with the official answer.
        2. Assign a score from 0 to 10.
        3. If the score is 7 or higher, set isCorrect to true.
        4. Provide brief, encouraging feedback in Persian.
        
        Note: The student doesn't need to use exact words, but they must capture the main concepts.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCorrect: { type: Type.BOOLEAN },
            score: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
          },
          required: ["isCorrect", "score", "feedback"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("مدل پاسخی ارسال نکرد.");
    
    return JSON.parse(text) as EvaluationResult;
  } catch (error: any) {
    console.error("AI Evaluation Error:", error);
    throw new Error(error.message || "خطا در ارتباط با هوش مصنوعی");
  }
};


import { GoogleGenAI, Type } from "@google/genai";
import { EvaluationResult } from "../types";

export const evaluateAnswer = async (
  question: string,
  correctAnswer: string,
  userAnswer: string,
  apiKey: string
): Promise<EvaluationResult> => {
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemma-3-27b",
      contents: `
        Compare the user's answer to the reference answer for the psychology question below.
        Question: ${question}
        Reference Answer: ${correctAnswer}
        User Answer: ${userAnswer}

        Assess if the user's answer is semantically correct and captures the core concepts of the reference answer.
        Provide a score from 0 to 10 (where 7 or above is considered correct).
        Give a brief constructive feedback in Persian.
        
        IMPORTANT: Your output MUST be a valid JSON object.
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
    console.error("AI Detailed Error:", error);
    // بازگرداندن متن خطا برای نمایش در UI
    throw new Error(error.message || "خطای ناشناخته در مدل Gemma");
  }
};

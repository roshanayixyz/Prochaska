
import { GoogleGenAI, Type } from "@google/genai";
import { EvaluationResult } from "../types";

export const evaluateAnswer = async (
  question: string,
  correctAnswer: string,
  userAnswer: string
): Promise<EvaluationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        Compare the user's answer to the reference answer for the psychology question below.
        Question: ${question}
        Reference Answer: ${correctAnswer}
        User Answer: ${userAnswer}

        Assess if the user's answer is semantically correct and captures the core concepts of the reference answer.
        Provide a score from 0 to 10 (where 7 or above is considered correct).
        Give a brief constructive feedback in Persian.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCorrect: { type: Type.BOOLEAN, description: "True if the score is 7 or above." },
            score: { type: Type.NUMBER, description: "Score from 0 to 10." },
            feedback: { type: Type.STRING, description: "Constructive feedback in Persian." },
          },
          required: ["isCorrect", "score", "feedback"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    return JSON.parse(text) as EvaluationResult;
  } catch (error: any) {
    console.error("AI Evaluation Error:", error);
    // Propagate quota or auth errors specifically
    if (error.message?.includes("quota") || error.message?.includes("429") || error.message?.includes("API_KEY")) {
      throw error; 
    }
    return {
      isCorrect: false,
      score: 0,
      feedback: "خطایی در پردازش رخ داد. لطفاً دوباره تلاش کنید."
    };
  }
};

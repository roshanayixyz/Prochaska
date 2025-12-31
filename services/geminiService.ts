
import { GoogleGenAI, Type } from "@google/genai";
import { EvaluationResult } from "../types";

export const evaluateAnswer = async (
  question: string,
  correctAnswer: string,
  userAnswer: string,
  apiKey: string
): Promise<EvaluationResult> => {
  // Create a fresh instance with the provided key
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
    throw error;
  }
};

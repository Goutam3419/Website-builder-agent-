import { GoogleGenAI } from '@google/genai';
import { getVectorEmbeddings, saveVectorEmbedding, VectorEmbedding, getLessons, saveLesson, Lesson } from '../db';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function generateTextEmbedding(text: string): Promise<number[]> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return [];
    }
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents: text.substring(0, 2000),
    });
    const resAny = response as any;
    return resAny.embedding?.values || resAny.embeddings?.[0]?.values || [];
  } catch (err) {
    console.warn('Embedding generation error, using zero vector:', err);
    return [];
  }
}

export async function storeMemoryChunk(
  projectId: string,
  userId: string,
  docType: 'chat' | 'code' | 'decision',
  title: string,
  content: string
) {
  try {
    const embedding = await generateTextEmbedding(`${title}\n${content}`);
    await saveVectorEmbedding(projectId, userId, docType, title, content, embedding);
  } catch (err) {
    console.warn('Failed to store memory chunk:', err);
  }
}

export async function searchRelevantMemories(
  projectId: string,
  userId: string,
  query: string,
  topK = 4
): Promise<VectorEmbedding[]> {
  try {
    const allEmbeddings = await getVectorEmbeddings(projectId, userId);
    if (allEmbeddings.length === 0) return [];

    const queryVec = await generateTextEmbedding(query);
    if (queryVec.length === 0) {
      // Fallback to recent items
      return allEmbeddings.slice(0, topK);
    }

    const scored = allEmbeddings.map((item) => ({
      item,
      score: cosineSimilarity(queryVec, item.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map((s) => s.item);
  } catch (err) {
    console.warn('Error querying vector embeddings:', err);
    return [];
  }
}

export async function storeLessonMemory(
  projectId: string | null | undefined,
  userId: string,
  lessonType: Lesson['lesson_type'],
  triggerSummary: string,
  fixOrRule: string,
  occurrenceCount = 1
): Promise<Lesson> {
  let embedding: number[] = [];
  try {
    embedding = await generateTextEmbedding(`${triggerSummary}\n${fixOrRule}`);
  } catch (err) {
    console.warn('Embedding for lesson failed, continuing without embedding:', err);
  }

  return saveLesson({
    project_id: projectId,
    user_id: userId,
    lesson_type: lessonType,
    trigger_summary: triggerSummary,
    fix_or_rule: fixOrRule,
    occurrence_count: occurrenceCount,
    embedding,
  });
}

export async function getRelevantLessons(
  projectId: string | null | undefined,
  userId: string,
  query?: string,
  topK = 5
): Promise<Lesson[]> {
  try {
    const allLessons = await getLessons(projectId, userId, true);
    if (allLessons.length === 0) return [];

    let queryVec: number[] = [];
    if (query && query.trim()) {
      queryVec = await generateTextEmbedding(query);
    }

    const scored = allLessons.map((lesson) => {
      let sim = 0;
      if (queryVec.length > 0 && lesson.embedding && lesson.embedding.length > 0) {
        sim = cosineSimilarity(queryVec, lesson.embedding);
      } else {
        sim = 0.2;
      }

      let typeBoost = 0.1;
      if (lesson.lesson_type === 'repeated_failure') typeBoost = 0.5;
      else if (lesson.lesson_type === 'user_correction') typeBoost = 0.4;
      else if (lesson.lesson_type === 'style_preference') typeBoost = 0.3;
      else if (lesson.lesson_type === 'validation_error' || lesson.lesson_type === 'deployment_failure') typeBoost = 0.1;

      const projectBoost = lesson.project_id === projectId ? 0.2 : 0;
      const countBoost = Math.min((lesson.occurrence_count || 1) * 0.1, 0.3);

      const totalScore = sim + typeBoost + projectBoost + countBoost;
      return { lesson, score: totalScore };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map((s) => s.lesson);
  } catch (err) {
    console.warn('Error querying relevant lessons:', err);
    return [];
  }
}

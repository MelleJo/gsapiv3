// src/lib/tokenCounter.ts

export function countTokens(text: string): number {
    if (!text) return 0;
    
    // Simple approximation: ~4 characters per token for English text
    // This is not precise but gives a reasonable estimate
    return Math.ceil(text.length / 4);
  }
  
  export function estimateAudioDuration(fileSize: number): number {
    // Rough estimation: Assuming MP3 audio at decent quality
    // Average MP3 is about 1MB per minute
    return fileSize / (1024 * 1024); // Convert bytes to minutes
  }
  
  export function calculateTranscriptionCost(durationMinutes: number, costPerMinute: number): number {
    return durationMinutes * costPerMinute;
  }
  
  export function calculateTextCost(
    inputTokens: number, 
    outputTokens: number, 
    inputCostPer1MTok: number,
    outputCostPer1MTok: number
  ): number {
    const inputCost = (inputTokens / 1000000) * inputCostPer1MTok;
    const outputCost = (outputTokens / 1000000) * outputCostPer1MTok;
    return inputCost + outputCost;
  }
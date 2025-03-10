// src/app/api/transcribe/route.ts

import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { whisperModels } from '@/lib/config';
import { estimateAudioDuration, calculateTranscriptionCost } from '@/lib/tokenCounter';

// Helper function to add retry logic
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      console.log(`Poging ${attempt} mislukt. ${attempt < maxRetries ? 'Opnieuw proberen...' : 'Opgegeven.'}`);
      
      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt)); // Exponential backoff
      }
    }
  }
  
  throw lastError;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Nieuwe parameters voor Blob URL verwerking
    const blobUrl = body.blobUrl;
    const originalFileName = body.originalFileName || 'audio.mp3';
    // Remove unused fileType variable
    const fileSize = body.fileSize || 0;
    const modelId = body.model || 'whisper-1';
    
    if (!blobUrl) {
      return NextResponse.json(
        { error: 'Geen audio URL aangeleverd' },
        { status: 400 }
      );
    }

    // Get the file extension from the original filename
    const fileExt = originalFileName.split('.').pop()?.toLowerCase();
    const validExtensions = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
    
    if (!fileExt || !validExtensions.includes(fileExt)) {
      return NextResponse.json(
        { error: `Ongeldig bestandsformaat. Ondersteunde formaten: ${validExtensions.join(', ')}` },
        { status: 400 }
      );
    }

    // Estimate duration and cost
    const fileSizeMB = fileSize / (1024 * 1024);
    const estimatedDurationMinutes = estimateAudioDuration(fileSize);
    const selectedModel = whisperModels.find(m => m.id === modelId) || whisperModels[0];
    const estimatedCost = calculateTranscriptionCost(
      estimatedDurationMinutes, 
      selectedModel.costPerMinute
    );

    console.log(`Verwerken van bestand via Blob URL. Grootte: ${fileSizeMB.toFixed(2)}MB, Geschatte duur: ${estimatedDurationMinutes.toFixed(2)} minuten`);

    // OpenAI ondersteunt het verwerken van bestanden via URL
    try {
      const transcription = await withRetry(async () => {
        return await openai.audio.transcriptions.create({
          file_url: blobUrl,  // Gebruik de Blob URL in plaats van een bestand
          model: modelId,
          language: 'nl',
          response_format: 'text',
          timeout: 300000, // 5 minuten timeout voor grote bestanden
        });
      }, 3, 2000);

      return NextResponse.json({ 
        transcription: transcription,
        usage: {
          model: selectedModel.name,
          estimatedDurationMinutes,
          estimatedCost
        }
      });
    } catch (openaiError: any) {
      console.error('OpenAI API fout bij het verwerken van Blob URL:', openaiError);
      
      let errorMessage = 'OpenAI API fout';
      let statusCode = 500;
      
      // Error handling voor specifieke foutscenario's
      if (openaiError.message?.includes('file_url')) {
        errorMessage = 'Probleem met de audio URL. Controleer of de URL toegankelijk is voor OpenAI.';
      } else if (openaiError.status === 413 || (openaiError.message && openaiError.message.includes('too large'))) {
        errorMessage = 'Audio bestand te groot voor verwerking door OpenAI. De maximale grootte voor OpenAI is ongeveer 25MB.';
        statusCode = 413;
      } else if (openaiError.status === 429) {
        errorMessage = 'API limiet bereikt. Probeer het over enkele ogenblikken opnieuw.';
        statusCode = 429;
      } else if (openaiError.status === 401) {
        errorMessage = 'Authenticatiefout. Controleer uw OpenAI API-sleutel.';
        statusCode = 401;
      } else if (openaiError.message) {
        errorMessage = `OpenAI Transcriptie fout: ${openaiError.message}`;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: statusCode }
      );
    }
  } catch (error: any) {
    console.error('Transcriptie fout:', error);
    
    const errorMessage = error.error?.message || error.message || 'Audio transcriptie mislukt';
    const statusCode = error.status || 500;
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
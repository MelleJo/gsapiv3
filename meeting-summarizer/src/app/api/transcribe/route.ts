import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { whisperModels } from '@/lib/config';
import { estimateAudioDuration, calculateTranscriptionCost } from '@/lib/tokenCounter';
import { MAX_CHUNK_SIZE, splitAudioBlob, joinTranscriptions, processChunks } from '@/lib/audioChunker';

export const config = {
  runtime: 'nodejs',
  maxDuration: 900, // 15 minutes max execution time (increased for chunking)
  api: {
    bodyParser: {
      sizeLimit: '500mb', // Increased from default for large files
    },
    responseLimit: false, // No size limit for responses
  }
};

// Configure timeout for fetch operations
const FETCH_TIMEOUT = 120000; // 2 minutes

// Add a timeout wrapper for any promise
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timeoutHandle);
  }) as Promise<T>;
};

// Helper function to add retry logic
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delay = 1000, timeoutMs = FETCH_TIMEOUT): Promise<T> {
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
    const contentType = request.headers.get("content-type") || "";
    let body: any;
    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch (err) {
        body = { file: await request.clone().blob(), originalFileName: 'audio.wav' };
      }
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const fileField = formData.get("file");
      if (!fileField) {
        return NextResponse.json({ error: "Geen audio bestand aangeleverd" }, { status: 400 });
      }
      body = {
        file: fileField,
        originalFileName: fileField instanceof File ? fileField.name : "audio.mp3"
      };
    } else if (contentType.startsWith("audio/") || contentType.startsWith("video/")) {
      const blob = await request.blob();
      body = { file: blob, originalFileName: contentType.startsWith("video/") ? 'video.mp4' : 'audio.wav' };
    } else {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
    }

    const blobUrl = body.blobUrl || body.file;
    const originalFileName = body.originalFileName || 'audio.mp3';
    const fileSize = body.file && body.file instanceof File ? body.file.size : (body.fileSize || 0);
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

    // File size and chunking notification
    const fileSizeMB = fileSize / (1024 * 1024);
    const needsChunking = fileSize > MAX_CHUNK_SIZE;
    
    // Calculate chunks for cost estimation
    const numChunks = needsChunking ? Math.ceil(fileSize / MAX_CHUNK_SIZE) : 1;
    
    // Estimate duration and cost
    const estimatedDurationMinutes = estimateAudioDuration(fileSize);
    const selectedModel = whisperModels.find(m => m.id === modelId) || whisperModels[0];
    const estimatedCost = calculateTranscriptionCost(
      estimatedDurationMinutes, 
      selectedModel.costPerMinute
    );

    console.log(`Verwerken van bestand: ${originalFileName}, Grootte: ${fileSizeMB.toFixed(2)}MB, Geschatte duur: ${estimatedDurationMinutes.toFixed(2)} minuten`);
    if (needsChunking) {
      console.log(`Bestand wordt opgesplitst in ${numChunks} delen vanwege grootte > 25MB`);
    }

    // Process the audio file
    try {
      // Define mappings for correct MIME types
      const isVideo = contentType.startsWith("video/");
      const mimeTypes = {
        flac: 'audio/flac',
        m4a: 'audio/x-m4a',
        mp3: 'audio/mpeg',
        mp4: isVideo ? 'video/mp4' : 'audio/mp4',
        mpeg: 'audio/mpeg',
        mpga: 'audio/mpeg',
        oga: 'audio/ogg',
        ogg: 'audio/ogg',
        wav: 'audio/wav',
        webm: 'audio/webm'
      };
      const mimeType = mimeTypes[fileExt as keyof typeof mimeTypes] || 'application/octet-stream';
      
      // Get the audio blob from the URL if needed
      let audioBlob: Blob;
      if (typeof blobUrl === "string") {
        const fetchWithTimeout = () => withTimeout(
          fetch(blobUrl), 
          FETCH_TIMEOUT, 
          'Tijdslimiet overschreden bij ophalen van audiobestand. Probeer het opnieuw.'
        );
        
        const resp = await fetchWithTimeout();
        if (!resp.ok) {
          throw new Error(`Fout bij ophalen van audiobestand: ${resp.status} ${resp.statusText}`);
        }
        
        audioBlob = await resp.blob();
      } else {
        audioBlob = blobUrl;
      }
      
      // Split audio into chunks if necessary
      const audioChunks = await splitAudioBlob(audioBlob);
      
      // Process each chunk and combine results
      const transcription = await processChunks<string>(
        audioChunks,
        async (chunk, index) => {
          console.log(`Verwerken van deel ${index + 1}/${audioChunks.length}, grootte: ${(chunk.size / (1024 * 1024)).toFixed(2)}MB`);
          
          // Create a File object for OpenAI API
          const chunkFileName = `chunk_${index + 1}_${originalFileName}`;
          const fileToUpload = new File([chunk], chunkFileName, { 
            type: mimeType, 
            lastModified: Date.now() 
          });
          
          // Process with OpenAI Whisper
          return await withTimeout(
            openai.audio.transcriptions.create({
              file: fileToUpload as any,
              model: modelId,
              language: 'nl',
              response_format: 'text',
            }),
            300000, // 5 minute timeout per chunk
            `Tijdslimiet overschreden bij het transcriberen van deel ${index + 1}/${audioChunks.length}.`
          );
        },
        // Combine function
        joinTranscriptions
      );

      return NextResponse.json({ 
        transcription: transcription,
        usage: {
          model: selectedModel.name,
          estimatedDurationMinutes,
          estimatedCost,
          chunked: needsChunking,
          chunks: audioChunks.length
        }
      });
    } catch (openaiError: any) {
      console.error('OpenAI API fout bij het verwerken van audio:', openaiError);
      
      let errorMessage = 'OpenAI API fout';
      let statusCode = 500;
      
      // Improved error handling
      if (openaiError.status === 413 || 
          (openaiError.message && (openaiError.message.includes('413') || openaiError.message.includes('too large')))) {
        errorMessage = `Fout bij verwerken van audiobestand. Mogelijk is een van de delen nog te groot.`;
        statusCode = 413;
      } else if (openaiError.message?.includes('file_url')) {
        errorMessage = 'Probleem met de audio URL. Controleer of de URL toegankelijk is voor OpenAI.';
      } else if (openaiError.status === 429) {
        errorMessage = 'API limiet bereikt. Probeer het over enkele ogenblikken opnieuw.';
        statusCode = 429;
      } else if (openaiError.status === 401) {
        errorMessage = 'Authenticatiefout. Controleer uw OpenAI API-sleutel.';
        statusCode = 401;
      } else if (openaiError.message && openaiError.message.includes('Tijdslimiet')) {
        errorMessage = openaiError.message;
        statusCode = 408; // Request Timeout
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
    
    // More specific error handling
    let errorMessage = error.error?.message || error.message || 'Audio transcriptie mislukt';
    let statusCode = error.status || 500;
    
    // Handle specific errors
    if (statusCode === 413 || errorMessage.includes('413') || errorMessage.includes('too large')) {
      errorMessage = 'Fout bij verwerken van audiobestand. Mogelijk is een van de delen nog te groot.';
      statusCode = 413;
    } else if (errorMessage.includes('Tijdslimiet')) {
      statusCode = 408; // Request Timeout
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { whisperModels } from '@/lib/config';
import { Readable } from 'stream';
import { estimateAudioDuration, calculateTranscriptionCost } from '@/lib/tokenCounter';

export const config = {
  runtime: 'nodejs'
};

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
        let fileToUpload;
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

        if (typeof blobUrl === "string") {
          const resp = await fetch(blobUrl);
          const arrayBuffer = await resp.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          fileToUpload = new File([buffer], originalFileName, { type: mimeType, lastModified: Date.now() });
        } else {
          const arrayBuffer = await blobUrl.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          fileToUpload = new File([buffer], originalFileName, { type: mimeType, lastModified: Date.now() });
        }
        return await openai.audio.transcriptions.create({
          file: fileToUpload as any,
          model: modelId,
          language: 'nl',
          response_format: 'text',
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

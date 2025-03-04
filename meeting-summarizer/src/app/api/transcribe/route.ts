// src/app/api/transcribe/route.ts

import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { whisperModels } from '@/lib/config';
import { estimateAudioDuration, calculateTranscriptionCost } from '@/lib/tokenCounter';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const modelId = formData.get('model') as string || 'whisper-1';
    
    if (!file) {
      return NextResponse.json(
        { error: 'Geen audiobestand aangeleverd' },
        { status: 400 }
      );
    }

    // Get the file extension to validate format
    const fileName = file.name;
    const fileExt = fileName.split('.').pop()?.toLowerCase();
    const validExtensions = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
    
    if (!fileExt || !validExtensions.includes(fileExt)) {
      return NextResponse.json(
        { error: `Ongeldig bestandsformaat. Ondersteunde formaten: ${validExtensions.join(', ')}` },
        { status: 400 }
      );
    }

    // Estimate duration and cost
    const fileSize = file.size;
    const estimatedDurationMinutes = estimateAudioDuration(fileSize);
    const selectedModel = whisperModels.find(m => m.id === modelId) || whisperModels[0];
    const estimatedCost = calculateTranscriptionCost(
      estimatedDurationMinutes, 
      selectedModel.costPerMinute
    );

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Create a proper file with the correct MIME type
    const mimeTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      mp4: 'audio/mp4',
      mpeg: 'audio/mpeg',
      mpga: 'audio/mpeg',
      m4a: 'audio/mp4',
      wav: 'audio/wav',
      webm: 'audio/webm',
      flac: 'audio/flac',
      oga: 'audio/ogg',
      ogg: 'audio/ogg',
    };
    
    const mimeType = mimeTypes[fileExt] || `audio/${fileExt}`;
    const audioFile = new File([buffer], file.name, { type: mimeType });

    // Send to OpenAI Whisper API with Dutch language specification
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: modelId,
      language: 'nl', // Specify Dutch language
      response_format: 'text',
    });

    // Return results with cost information
    return NextResponse.json({ 
      transcription: transcription,
      usage: {
        model: selectedModel.name,
        estimatedDurationMinutes,
        estimatedCost
      }
    });
  } catch (error: any) {
    console.error('Transcriptie fout:', error);
    
    // Provide more detailed error information in Dutch
    const errorMessage = error.error?.message || error.message || 'Audio transcriptie mislukt';
    const statusCode = error.status || 500;
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
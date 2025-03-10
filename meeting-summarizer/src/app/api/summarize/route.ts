// src/app/api/summarize/route.ts

import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { chatModels } from '@/lib/config';
import { countTokens, calculateTextCost } from '@/lib/tokenCounter';

// Als een type niet wordt gebruikt, hou het privé om ESLint warnings te vermijden
type SummarizeRequestType = {
  text: string;
  model?: string;
  temperature?: number;
};

// Models that don't support temperature parameter
const NON_TEMPERATURE_MODELS = ['o1', 'o1-mini', 'o3-mini'];

export async function POST(request: Request) {
  try {
    // Parse request body
    const body: SummarizeRequestType = await request.json();
    
    // Extract parameters with defaults
    const text = body.text;
    const model = body.model || 'gpt-4o-mini';
    const temperature = body.temperature !== undefined ? body.temperature : 0.3;
    
    // Validate text input
    if (!text) {
      return NextResponse.json(
        { error: 'Geen tekst aangeleverd voor samenvatting' },
        { status: 400 }
      );
    }

    console.log(`Samenvatten van tekst met lengte ${text.length} met model ${model}`);

    // Count input tokens for cost estimation
    const inputTokens = countTokens(text);
    
    // Get selected model config
    const selectedModel = chatModels.find(m => m.id === model) || 
                         chatModels.find(m => m.id === 'gpt-4o-mini') || 
                         chatModels[0];

    // Create API request options with Dutch meeting notes system prompt
    const requestOptions: {
      model: string;
      messages: {role: string, content: string}[];
      temperature?: number;
    } = {
      model: selectedModel.id,
      messages: [
        {
          role: 'system',
          content: `Je bent een expert in het samenvatten van vergaderingen. Maak een beknopte maar volledige samenvatting van de volgende vergaderingstranscriptie in het Nederlands.

Structureer je samenvatting in de volgende secties:
1. Overzicht: Een korte introductie van het doel en de context van de vergadering
2. Belangrijkste discussiepunten: De hoofdonderwerpen die zijn besproken
3. Genomen beslissingen: Duidelijke beslissingen die tijdens de vergadering zijn genomen
4. Actiepunten: Specifieke taken die zijn toegewezen, inclusief wie verantwoordelijk is en deadlines indien vermeld
5. Vervolgstappen: Geplande volgende stappen of vergaderingen

Houd het professioneel, beknopt en actiegericht. Begin elke sectie met de sectienaam gevolgd door een dubbele punt, bijvoorbeeld "Overzicht: " of "Actiepunten: ".`
        },
        {
          role: 'user',
          content: text
        }
      ]
    };
    
    // Only add temperature for models that support it
    if (!NON_TEMPERATURE_MODELS.includes(selectedModel.id)) {
      requestOptions.temperature = temperature;
    }

    try {
      const response = await openai.chat.completions.create(requestOptions);

      // Get completion tokens from API response if available
      let outputTokens = 0;
      if (response.usage?.completion_tokens) {
        outputTokens = response.usage.completion_tokens;
      } else {
        // Fallback to estimation
        outputTokens = countTokens(response.choices[0].message.content || '');
      }

      // Calculate costs
      const cost = calculateTextCost(
        inputTokens,
        outputTokens,
        selectedModel.inputCost,
        selectedModel.outputCost
      );

      return NextResponse.json({ 
        summary: response.choices[0].message.content,
        usage: {
          model: selectedModel.name,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cost
        }
      });
    } catch (error) {
      console.error("OpenAI API fout:", error);
      
      let errorMessage = "Fout in communicatie met OpenAI";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      return NextResponse.json(
        { error: `OpenAI fout: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Samenvatting fout:', error);
    const errorMessage = error instanceof Error ? error.message : 'Samenvatten van tekst mislukt';
    const statusCode = typeof error === 'object' && error !== null && 'status' in error ? 
      Number(error.status) : 500;
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
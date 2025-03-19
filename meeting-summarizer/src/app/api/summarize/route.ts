// src/app/api/summarize/route.ts

import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { countTokens, calculateTextCost } from '@/lib/tokenCounter';
import { chatModels } from '@/lib/config';

export const maxDuration = 60; // 60 seconds timeout
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();
    
    // Extract parameters
    const { text, model = 'o3-mini', temperature = 0.3 } = body;
    
    // Validate request
    if (!text) {
      return NextResponse.json(
        { error: 'Geen tekst aangeleverd voor samenvatting' },
        { status: 400 }
      );
    }

    // Find the model details in the config
    const selectedModel = chatModels.find(m => m.id === model) || 
                          chatModels.find(m => m.id === 'o3-mini') || 
                          chatModels[0];

    // Create an enhanced, detailed system prompt for meeting summaries
    const instructions = `Je bent een expert in het maken van gedetailleerde vergadersamenvattingen voor professionele omgevingen. Maak een uitgebreide, feitelijke samenvatting van de transcriptie die ik je ga geven, met de volgende vereisten:

1. Gebruik actieve taal in plaats van passieve taal (bijv. "Jan legde uit dat..." in plaats van "Er werd uitgelegd dat...").
2. Identificeer deelnemers en hun standpunten wanneer deze duidelijk zijn uit de transcriptie.
3. Vermeld concrete beslissingen, actiepunten, en verantwoordelijken met deadlines indien genoemd.
4. Structureer de samenvatting met duidelijke secties en gebruik waar nodig opsommingstekens voor betere leesbaarheid.
5. Wees gedetailleerd en volledig - hoe langer de transcriptie, hoe uitgebreider de samenvatting moet zijn.
6. Vermijd hallucinations - neem alleen informatie op die daadwerkelijk in de transcriptie staat.
7. Geef belangrijke cijfers, metrics en specifieke voorbeelden die in de vergadering werden genoemd.
8. Als er tegenstrijdige standpunten waren, vermeld deze objectief.
9. Organiseer de belangrijkste onderwerpen chronologisch zoals ze in de vergadering aan bod kwamen.
10. Sluit af met een korte sectie "Genomen beslissingen" en indien van toepassing "Actiepunten" met verantwoordelijken.

Dit is een belangrijk zakelijk document dat gebruikt zal worden door mensen die niet bij de vergadering aanwezig waren, dus zorg ervoor dat het een volledige en nauwkeurige weergave is van wat er besproken is. Gebruik professionele, zakelijke taal.`;

    const userInput = `Hier is de transcriptie van een vergadering. Maak een gedetailleerde en complete samenvatting volgens de criteria in je instructies:\n\n${text}`;

    // Estimate token count 
    const combinedText = instructions + userInput;
    const inputTokenCount = countTokens(combinedText);

    let summary = '';
    let outputTokenCount = 0;

    // Handle o3-mini's special format
    if (model === 'o3-mini') {
      const response = await openai.responses.create({
        model: "o3-mini",
        input: [{
          role: "user",
          content: userInput
        }],
        instructions,
        temperature,
        text: {
          format: {
            type: "text"
          }
        },
        reasoning: {
          effort: "medium"
        },
        tools: [],
        store: true
      });

      summary = response.output_text || '';
    } 
    // Standard response API format for other models
    else if (model.startsWith('gpt-')) {
      const response = await openai.responses.create({
        model,
        instructions,
        input: userInput,
        temperature
      });

      summary = response.output_text || '';
    }
    // Fallback to chat completion API for any other models
    else {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: userInput }
        ],
        temperature
      });

      summary = response.choices[0].message.content || '';
    }

    outputTokenCount = countTokens(summary);

    // Calculate costs
    const cost = calculateTextCost(
      inputTokenCount,
      outputTokenCount,
      selectedModel.inputCost,
      selectedModel.outputCost
    );

    // Return the summary and usage info
    return NextResponse.json({
      summary,
      usage: {
        model: selectedModel.name,
        inputTokens: inputTokenCount,
        outputTokens: outputTokenCount,
        totalTokens: inputTokenCount + outputTokenCount,
        cost
      }
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    
    let errorMessage = 'Er is een fout opgetreden bij het genereren van de samenvatting';
    let statusCode = 500;
    
    if (error instanceof Error) {
      console.error('Full error:', error);
      errorMessage = error.message;
      
      // Check for specific error types
      if (error.message.includes('timeout')) {
        errorMessage = 'De aanvraag duurde te lang. Probeer een kleinere transcriptie of een ander model.';
        statusCode = 504;
      } else if (error.message.includes('Unsupported parameter')) {
        errorMessage = 'Er is een probleem met de API parameters. Probeer een ander model.';
        statusCode = 400;
      }
    }
    
    // Return error response
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: statusCode,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
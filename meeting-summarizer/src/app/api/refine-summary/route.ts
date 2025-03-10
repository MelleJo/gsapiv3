// src/app/api/refine-summary/route.ts

import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { chatModels } from '@/lib/config';
import { countTokens, calculateTextCost } from '@/lib/tokenCounter';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Models that don't support temperature parameter
const NON_TEMPERATURE_MODELS = ['o1', 'o1-mini', 'o3-mini'];

interface RefineSummaryRequest {
  summary: string;
  transcript?: string; // Make transcript optional
  action: 'make-detailed' | 'elaborate-topic' | 'email-format' | 'custom';
  topic?: string; // For topic-specific elaboration
  customPrompt?: string; // For custom refinements
  model?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      summary, 
      transcript = '', // Default to empty string
      action, 
      topic, 
      customPrompt,
      model = 'o3-mini' 
    } = body as RefineSummaryRequest;
    
    // Validate required fields
    if (!summary) {
      return NextResponse.json(
        { error: 'Samenvatting is vereist' },
        { status: 400 }
      );
    }
    
    // For actions other than email-format, we require transcript
    if (!transcript && action !== 'email-format') {
      return NextResponse.json(
        { error: 'Transcript is vereist' },
        { status: 400 }
      );
    }
    
    if (!action) {
      return NextResponse.json(
        { error: 'Actie is vereist' },
        { status: 400 }
      );
    }

    // Count input tokens for cost estimation
    const summaryTokens = countTokens(summary);
    const transcriptTokens = transcript ? countTokens(transcript) : 0;
    const inputTokens = summaryTokens + transcriptTokens;
    
    console.log(`Verwerken van verfijningsactie: ${action}`);
    console.log(`Samenvatting lengte: ${summary.length} tekens, Transcript lengte: ${transcript ? transcript.length : 0} tekens`);
    
    // Get selected model config, default to o3-mini or fallback to first available model
    const selectedModel = chatModels.find(m => m.id === model) || 
                        chatModels.find(m => m.id === 'o3-mini') || 
                        chatModels.find(m => m.id === 'gpt-4o-mini') ||
                        chatModels[0];

    // Determine the system message based on the requested action
    let systemMessage = '';
    let userMessage = '';
    
    switch (action) {
      case 'make-detailed':
        systemMessage = `Je bent een expert in het verbeteren van vergaderverslagen. Je taak is om een bestaande samenvatting uit te breiden en gedetailleerder te maken met behulp van het oorspronkelijke transcript. Voeg belangrijke details toe die in de samenvatting ontbreken, maar bewaar de oorspronkelijke structuur en secties. Zorg ervoor dat je factueel blijft en alleen informatie toevoegt die daadwerkelijk in het transcript staat.`;
        userMessage = `Hier is een samenvatting van een vergadering:\n\n${summary}\n\nHier is het volledige transcript van de vergadering:\n\n${transcript}\n\nMaak de samenvatting gedetailleerder en uitgebreider, maar behoud de structuur. Voeg belangrijke details toe die in de huidige samenvatting ontbreken.`;
        break;
        
      case 'elaborate-topic':
        if (!topic) {
          return NextResponse.json(
            { error: 'Topic is vereist voor topic-elaboratie' },
            { status: 400 }
          );
        }
        systemMessage = `Je bent een expert in het uitbreiden van specifieke onderdelen van vergaderverslagen. Je taak is om meer informatie toe te voegen over een specifiek onderwerp uit een vergadersamenvatting, gebruikmakend van het oorspronkelijke transcript als bron. Focus alleen op het gevraagde onderwerp en behoud de stijl van de oorspronkelijke samenvatting.`;
        userMessage = `Hier is een samenvatting van een vergadering:\n\n${summary}\n\nHier is het volledige transcript van de vergadering:\n\n${transcript}\n\nBreid de informatie over het volgende onderwerp uit: "${topic}". Gebruik alleen feiten die in het transcript staan.`;
        break;
        
      case 'email-format':
        systemMessage = `Je bent een expert in professionele communicatie. Je taak is om een vergadersamenvatting om te zetten in een formele, professionele e-mail die naar collega's of klanten kan worden gestuurd. Behoud alle belangrijke informatie uit de samenvatting, maar presenteer het in een e-mailformaat met een passende introductie, hoofdtekst en afsluiting. Houd de toon professioneel en zakelijk.`;
        
        // For email formatting, transcript is optional
        userMessage = transcript 
          ? `Hier is een samenvatting van een vergadering:\n\n${summary}\n\nHier is het volledige transcript van de vergadering:\n\n${transcript}\n\nZet deze samenvatting om in een professionele e-mail die naar collega's of klanten kan worden gestuurd. Zorg voor een passende introductie en afsluiting.`
          : `Hier is een samenvatting van een vergadering:\n\n${summary}\n\nZet deze samenvatting om in een professionele e-mail die naar collega's of klanten kan worden gestuurd. Zorg voor een passende introductie en afsluiting.`;
        break;
        
      case 'custom':
        if (!customPrompt) {
          return NextResponse.json(
            { error: 'Aangepaste instructie is vereist voor een custom actie' },
            { status: 400 }
          );
        }
        systemMessage = `Je bent een expert in het aanpassen van vergaderverslagen volgens specifieke wensen. Je gebruikt het oorspronkelijke transcript als feitelijke basis en past de samenvatting aan volgens de instructies. Zorg ervoor dat je alleen informatie gebruikt die in het transcript aanwezig is.`;
        userMessage = `Hier is een samenvatting van een vergadering:\n\n${summary}\n\nHier is het volledige transcript van de vergadering:\n\n${transcript}\n\nPas de samenvatting aan volgens deze instructie: "${customPrompt}". Gebruik alleen informatie uit het transcript.`;
        break;
        
      default:
        return NextResponse.json(
          { error: `Ongeldige actie gespecificeerd: ${action}` },
          { status: 400 }
        );
    }

    // Use GPT-4o-mini as fallback if o3-mini is not available
    const actualModel = selectedModel.id === 'o3-mini' && !chatModels.find(m => m.id === 'o3-mini') 
      ? 'gpt-4o-mini' 
      : selectedModel.id;

    console.log(`Gebruik model: ${actualModel}`);

    // Create properly typed messages for OpenAI API
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemMessage
      },
      {
        role: 'user',
        content: userMessage
      }
    ];

    // Create API request
    const requestOptions = {
      model: actualModel,
      messages: messages
    };
    
    // Only add temperature for models that support it
    if (!NON_TEMPERATURE_MODELS.includes(actualModel)) {
      Object.assign(requestOptions, { temperature: 0.7 });
    }

    try {
      const response = await openai.chat.completions.create(requestOptions);

      // Get completion tokens from API response or estimate
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
        refinedSummary: response.choices[0].message.content,
        usage: {
          model: selectedModel.name,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cost
        }
      });
    } catch (openaiError: any) {
      console.error("OpenAI API fout:", openaiError);
      
      let errorMessage = "Fout in communicatie met OpenAI";
      if (openaiError.message) {
        errorMessage = openaiError.message;
      }
      
      return NextResponse.json(
        { error: `OpenAI fout: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Samenvatting verfijnen mislukt:', error);
    const errorMessage = error.error?.message || error.message || 'Samenvatting verfijnen mislukt';
    const statusCode = error.status || 500;
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
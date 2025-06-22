import { NextRequest, NextResponse } from 'next/server';
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: process.env.OPENAI_PROJECT_ID,
  organization: process.env.OPENAI_ORGANIZATION_ID,
  timeout: 60 * 1000, // 60s
  maxRetries: 3,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    
    if (!name) {
      return NextResponse.json({ error: 'Name parameter is required' }, { status: 400 });
    }
    
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('users')
      .select('calories, protein, created_at')
      .eq('name', name)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lt('created_at', `${today}T23:59:59.999Z`)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    const totalCalories = data.reduce((sum, entry) => sum + (entry.calories || 0), 0);
    const totalProtein = data.reduce((sum, entry) => sum + (entry.protein || 0), 0);
    
    return NextResponse.json({ 
      success: true, 
      name,
      date: today,
      totalCaloriesToday: totalCalories,
      totalProteinToday: totalProtein,
      entriesCount: data.length,
      entries: data 
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, text } = body;
    
    console.log(name);



    const CalendarEvent = z.object({
      calories: z.number(),
      protein: z.number(),
    });

    const response = await openai.responses.parse({
      model: "gpt-4.1-nano",
      input: [
        { role: "system", content: "You are a calories counting assistant. The User will give you information about what he ate, and you will calculate the calories and give it in a structured output back." },
        {
          role: "user",
          content: text,
        },
      ],
      text: {
        format: zodTextFormat(CalendarEvent, "event"),
      },
    });

    const event = response.output_parsed;
    
    // Save to Supabase users table
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          name: name,
          calories: event?.calories,
          protein: event?.protein,
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, answer: event, data });
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
}
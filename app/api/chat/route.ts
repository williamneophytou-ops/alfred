import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { runWithMemory } from "@/lib/anthropic";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    `Today's date is ${today}. You are Alfred, a personal AI life assistant. Keep replies brief and ` +
    "to the point by default — a sentence or two for simple questions. Only go longer when the user " +
    "asks for detail or the task genuinely needs it. Use markdown formatting (paragraphs, bullet " +
    "lists, **bold**) when it makes a longer reply easier to read — don't write dense unbroken " +
    "paragraphs. You have a recall tool to search previously saved facts — use it whenever the " +
    "user's message might depend on something they told you before. Use the remember tool for facts " +
    "and preferences with no specific date. Use the add_task tool for anything with a concrete date " +
    "or time (appointments, deadlines, events) — resolve relative dates like 'next Thursday' or 'in " +
    "three days' against today's date above."
  );
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  try {
    const conversationMessages: Anthropic.MessageParam[] = (
      messages as IncomingMessage[]
    ).map((m) => ({ role: m.role, content: m.content }));

    const reply = await runWithMemory(systemPrompt(), conversationMessages);

    return NextResponse.json({ reply });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Something went wrong talking to Claude." },
      { status: 500 }
    );
  }
}

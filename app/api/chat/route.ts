import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSupabase, type Memory } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

const tools: Anthropic.Tool[] = [
  {
    name: "remember",
    description:
      "Save a fact, deadline, or commitment the user wants remembered long-term (e.g. an exam date, a preference, a task). Call this whenever the user tells you something worth remembering across future conversations.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The fact to remember, written as a short, self-contained sentence.",
        },
      },
      required: ["content"],
    },
  },
];

async function executeTool(name: string, input: unknown): Promise<string> {
  if (name === "remember") {
    const { content } = input as { content: string };
    const { error } = await getSupabase().from("memories").insert({ content });
    if (error) {
      console.error("Failed to save memory:", error);
      return "Failed to save that.";
    }
    return "Saved.";
  }
  return "Unknown tool.";
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  try {
    const { data: memories } = await getSupabase()
      .from("memories")
      .select("content")
      .order("created_at", { ascending: true })
      .returns<Pick<Memory, "content">[]>();

    const memoryContext =
      memories && memories.length > 0
        ? `Known facts about the user, remembered from past conversations:\n${memories
            .map((m) => `- ${m.content}`)
            .join("\n")}`
        : "No facts have been remembered about the user yet.";

    const conversationMessages: Anthropic.MessageParam[] = (
      messages as IncomingMessage[]
    ).map((m) => ({ role: m.role, content: m.content }));

    let finalReply = "";

    while (true) {
      const response = await anthropic.messages.create({
        model: "claude-opus-5",
        max_tokens: 1024,
        system: `You are Alfred, a personal AI life assistant. Keep replies brief and to the point by default — a sentence or two for simple questions. Only go longer when the user asks for detail or the task genuinely needs it.\n\n${memoryContext}`,
        tools,
        messages: conversationMessages,
      });

      if (response.stop_reason !== "tool_use") {
        const textBlock = response.content.find((b) => b.type === "text");
        finalReply = textBlock?.text ?? "";
        break;
      }

      conversationMessages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const result = await executeTool(block.name, block.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      conversationMessages.push({ role: "user", content: toolResults });
    }

    return NextResponse.json({ reply: finalReply });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Something went wrong talking to Claude." },
      { status: 500 }
    );
  }
}

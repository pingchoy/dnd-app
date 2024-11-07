import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(request: Request) {
  const body = await request.json();
  const message = await openai.beta.threads.messages.create(body.threadId, {
    role: "user",
    content: body.inputWithMetadata,
  });

  return Response.json({
    message: message,
  });
}

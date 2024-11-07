import OpenAI from "openai";

const openai = new OpenAI();

export async function GET(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  const message = await openai.beta.threads.messages.list(params.threadId);

  return Response.json({
    message: message.data,
  });
}

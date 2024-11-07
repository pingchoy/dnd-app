import OpenAI from "openai";

const openai = new OpenAI();

export async function GET(request: Request) {
  const body = await request.json();
  const thread = await openai.beta.threads.retrieve(body.threadId);

  return Response.json({
    thread: thread,
  });
}

export async function POST(request: Request) {
  const thread = await openai.beta.threads.create();

  return Response.json({
    thread: thread,
  });
}

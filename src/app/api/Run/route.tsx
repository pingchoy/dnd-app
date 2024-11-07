import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(request: Request) {
  const body = await request.json();
  let run = await openai.beta.threads.runs.createAndPoll(body.threadId, {
    assistant_id: body.assistantId,
  });

  if (run.status === "completed") {
    const messages = await openai.beta.threads.messages.list(run.thread_id);
    let response = messages.data[0].content[0].text.value;

    for (const message of messages.data.reverse()) {
      console.log(`${message.content[0].text.value}`);
    }

    return Response.json({
      message: response,
      messageList: messages.data,
      token: run.usage?.total_tokens,
    });
  } else {
    console.log(run.status);
  }
}

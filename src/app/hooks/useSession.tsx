import { useEffect, useState } from "react";
import { Assistant } from "openai/resources/beta/assistants.mjs";

export const useSession = (
  existingThreadId?: string
): {
  assistant: Assistant | undefined;
  threadId: string;
  existingMessageList: any[];
} => {
  const [assistant, setAssistant] = useState<Assistant>();
  const [threadId, setThreadId] = useState<string>(existingThreadId || "");
  const [existingMessageList, setExistingMessageList] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/DMAssistant", {
      method: "GET",
    })
      .then((res) => res.json())
      .then((data) => {
        console.log(data);
        setAssistant(data.assistant);
        if (!threadId) {
          fetch("/api/Thread", {
            method: "POST",
          })
            .then((res) => res.json())
            .then((data) => {
              console.log(data);
              setThreadId(data.thread.id);
            });
        } else {
          fetch("/api/Message/" + threadId, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          })
            .then((res) => res.json())
            .then((data) => {
              console.log(data);
              data.message.sort((a: any, b: any) => {
                return (
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime()
                );
              });
              setExistingMessageList(data.message);
            });
        }
      });
  }, []);

  return { assistant, threadId, existingMessageList };
};

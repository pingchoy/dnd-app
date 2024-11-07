"use client";
import Image from "next/image";
import Input from "../components/Input";
import { useEffect, useState } from "react";
import ChatCard from "../components/ChatCard";
import OpenAI from "openai";
import { Assistant } from "openai/resources/beta/assistants.mjs";
import { useSession } from "../hooks/useSession";

export default function Home() {
  const { assistant, threadId, existingMessageList } = useSession();

  const [userInput, setUserInput] = useState("");
  const [currentRun, setCurrentRun] = useState();
  const [messageList, setMessageList] = useState<any[]>(
    existingMessageList ?? []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const [playerName, setPlayerName] = useState("Xavier");

  const handleSubmit = async () => {
    // Call gptPrompt API
    console.log("Test");
    console.log(assistant, threadId);
    if (assistant && threadId) {
      setIsLoading(true);
      const inputWithMetadata = `%%%Player_Character=${playerName}\n${userInput}`;

      const messageRes = await fetch("/api/Message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId,
          inputWithMetadata,
        }),
      });
      console.log(messageRes);

      const runRes = fetch("/api/Run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistantId: assistant.id,
          threadId: threadId,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log(data);
          setTotalTokens(totalTokens + data.token);
          // sort data.messageList
          data.messageList.sort((a: any, b: any) => {
            return (
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
            );
          });
          setMessageList(data.messageList);
          setIsLoading(false);
          setUserInput("");
        });
    }
  };

  return (
    <main className="flex flex-col h-screen items-center px-24 py-12 ">
      <div className="w-full h-full overflow-auto mt-12 pb-12 border-gray-600 border-2 rounded-md rounded-b-none bg-white">
        {messageList.map((message) => {
          return (
            <div className="w-full h-auto px-6" key={message.id}>
              <ChatCard message={message} tokens={totalTokens} />
            </div>
          );
        })}
        {isLoading && <p>Loading...</p>}
      </div>
      <Input setUserInput={setUserInput} />
      <button
        onClick={() => handleSubmit()}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-4"
      >
        Submit
      </button>
    </main>
  );
}

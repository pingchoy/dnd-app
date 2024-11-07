"use client";
import Input from "../components/Input";
import { useState } from "react";
import ChatCard from "../components/ChatCard";
import { useSession } from "../hooks/useSession";

export default function Home() {
  const { assistant, threadId, existingMessageList } = useSession(); // Input thread Id as argument if you want to get an existing session

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
    setUserInput("");
    const tmpMessageList = [...messageList];
    tmpMessageList.push({
      role: "player",
      content: [{ text: { value: userInput } }],
      created_at: new Date().toISOString(),
    });
    setMessageList(tmpMessageList);
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
        });
    }
  };

  return (
    <main className="flex flex-col h-screen items-center px-24 py-12 bg-gray-700 ">
      <div className="flex flex-col w-full h-full overflow-auto mt-12 pb-12  border-gray-600 border-[1px] rounded-md rounded-b-none bg-gray-100">
        <div className="flex flex-col h-full grow flex-1 items-start">
          {messageList.map((message) => {
            return (
              <div className="w-full h-auto px-6" key={message.id}>
                <ChatCard message={message} />
              </div>
            );
          })}
          {isLoading && <p>Loading...</p>}
          <div className="mt-12 ml-6">Total Tokens Consumed: {totalTokens}</div>
        </div>
      </div>

      <Input
        userInput={userInput}
        setUserInput={setUserInput}
        handleSubmit={handleSubmit}
      />
    </main>
  );
}

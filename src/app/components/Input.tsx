import { useState } from "react";

export default function Input({
  userInput,
  setUserInput,
  handleSubmit,
}: {
  userInput: string;
  setUserInput: React.Dispatch<React.SetStateAction<string>>;
  handleSubmit: () => void;
}) {
  const handleUserInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserInput(e.target.value);
  };

  return (
    <div className="flex w-full">
      <input
        name="userInput"
        id="userInput"
        onChange={(e) => handleUserInput(e)}
        className="rounded-t-none block h-24 w-full rounded-bl-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400  sm:text-sm sm:leading-6"
        placeholder="Your action"
        value={userInput}
      />
      <button
        onClick={() => handleSubmit()}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold w-24 h-full rounded-br-md"
      >
        Submit
      </button>
    </div>
  );
}

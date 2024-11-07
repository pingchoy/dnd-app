import { useState } from "react";

export default function Input({
  setUserInput,
}: {
  setUserInput: React.Dispatch<React.SetStateAction<string>>;
}) {
  const handleUserInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserInput(e.target.value);
  };

  return (
    <div className=" w-full">
      <textarea
        name="userInput"
        id="userInput"
        onChange={(e) => handleUserInput(e)}
        className="rounded-t-none block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
        placeholder="Your action"
      />
    </div>
  );
}

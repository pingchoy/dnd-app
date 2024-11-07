import { Fragment, useState } from "react";
import {
  FaceFrownIcon,
  FaceSmileIcon,
  FireIcon,
  HandThumbUpIcon,
  HeartIcon,
  PaperClipIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import {
  Label,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import { Message } from "openai/resources/beta/threads/messages.mjs";
import { cleanDialog } from "../utils/cleanDialog";

const moods = [
  {
    name: "Excited",
    value: "excited",
    icon: FireIcon,
    iconColor: "text-white",
    bgColor: "bg-red-500",
  },
  {
    name: "Loved",
    value: "loved",
    icon: HeartIcon,
    iconColor: "text-white",
    bgColor: "bg-pink-400",
  },
  {
    name: "Happy",
    value: "happy",
    icon: FaceSmileIcon,
    iconColor: "text-white",
    bgColor: "bg-green-400",
  },
  {
    name: "Sad",
    value: "sad",
    icon: FaceFrownIcon,
    iconColor: "text-white",
    bgColor: "bg-yellow-400",
  },
  {
    name: "Thumbsy",
    value: "thumbsy",
    icon: HandThumbUpIcon,
    iconColor: "text-white",
    bgColor: "bg-blue-500",
  },
  {
    name: "I feel nothing",
    value: null,
    icon: XMarkIcon,
    iconColor: "text-gray-400",
    bgColor: "bg-transparent",
  },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function ChatCard({ message }: { message: Message }) {
  return (
    <div className="flex h-auto items-start space-x-4  mt-6" key={message.id}>
      <div className="flex-shrink-0">
        {message.role === "assistant" ? (
          <img
            className="inline-block h-10 w-10 rounded-full"
            src="https://external-preview.redd.it/what-is-your-opinion-on-ai-dungeon-masters-like-what-is-v0-WpaWjhuCTQqDr7Bjxfgk64VRVNcQRQdDef5AHf2Nm00.jpg?auto=webp&s=9b13adb0302ff2b30200fcf5f6e2d9595f7551ce"
            alt=""
          />
        ) : (
          <img
            className="inline-block h-10 w-10 rounded-full"
            src="https://easy-peasy.ai/cdn-cgi/image/quality=80,format=auto,width=700/https://fdczvxmwwjwpwbeeqcth.supabase.co/storage/v1/object/public/images/00255baa-a07c-4a37-9ede-f778c4dc6506/cf1754f3-8fe1-42bb-bd2f-25d2dd29be4e.png"
            alt=""
          />
        )}
      </div>
      <div className="min-w-0 w-full h-auto grow">
        <form action="#" className="relative h-auto">
          <div className="overflow-hidden  rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 focus-within:ring-2 focus-within:ring-indigo-600 bg-white">
            <label htmlFor="title" className="sr-only">
              DM
            </label>
            <input
              type="text"
              name="title"
              id="title"
              className="block w-full border-0 pt-2.5 text-lg font-medium placeholder:text-gray-400 text-gray-900 focus:ring-0 bg-transparent"
              placeholder="Title"
              defaultValue={
                message.role === "assistant" ? "Dungeon Master" : "Player"
              }
            />
            <div
              id="comment"
              className="block w-full h-auto pb-6 px-4 resize-none border-0 bg-transparent py-1.5 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm sm:leading-6"
            >
              {cleanDialog(message.content[0].text.value)}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

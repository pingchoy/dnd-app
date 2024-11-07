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

export default function ChatCard({
  message,
  tokens,
}: {
  message: Message;
  tokens: number;
}) {
  return (
    <div className="flex h-auto items-start space-x-4  mt-6" key={message.id}>
      <div className="flex-shrink-0">
        <img
          className="inline-block h-10 w-10 rounded-full"
          src="https://images.unsplash.com/photo-1550525811-e5869dd03032?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
          alt=""
        />
      </div>
      <div className="min-w-0 w-full h-auto grow">
        <form action="#" className="relative h-auto">
          <div className="overflow-hidden  rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 focus-within:ring-2 focus-within:ring-indigo-600">
            <label htmlFor="title" className="sr-only">
              DM
            </label>
            <input
              type="text"
              name="title"
              id="title"
              className="block w-full border-0 pt-2.5 text-lg font-medium placeholder:text-gray-400 focus:ring-0 bg-transparent"
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
              <br />
              <br />
              {"tokens:" + tokens}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

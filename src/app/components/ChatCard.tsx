import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "../hooks/useChat";
import DiceRoll from "./DiceRoll";

interface Props {
  message: ChatMessage;
  playerName?: string;
}

function ChatCard({ message, playerName = "You" }: Props) {
  // Dice-roll card — animate if it's a new roll from this session
  if (message.rollResult) {
    return <DiceRoll result={message.rollResult} isHistorical={!message.isNewRoll} />;
  }

  const isDM = message.role === "assistant";

  return (
    <div
      className={`flex gap-4 mt-5 ${isDM ? "" : "flex-row-reverse"} ${message.isNew ? "animate-chat-enter" : ""}`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div
          className={`relative w-11 h-11 rounded-full overflow-hidden border-2 ${isDM ? "border-gold" : "border-[#6b7280]"} shadow-lg`}
        >
          <img
            src={
              isDM
                ? "https://external-preview.redd.it/what-is-your-opinion-on-ai-dungeon-masters-like-what-is-v0-WpaWjhuCTQqDr7Bjxfgk64VRVNcQRQdDef5AHf2Nm00.jpg?auto=webp&s=9b13adb0302ff2b30200fcf5f6e2d9595f7551ce"
                : "https://easy-peasy.ai/cdn-cgi/image/quality=80,format=auto,width=700/https://fdczvxmwwjwpwbeeqcth.supabase.co/storage/v1/object/public/images/00255baa-a07c-4a37-9ede-f778c4dc6506/cf1754f3-8fe1-42bb-bd2f-25d2dd29be4e.png"
            }
            alt={isDM ? "Dungeon Master" : "Player"}
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Message card */}
      <div
        className={`flex-1 min-w-0 rounded-md overflow-hidden border-l-4 ${isDM ? "card-parchment border-gold-dark" : "card-parchment-player border-[#6b7280]"}`}
      >
        <div
          className={`px-4 pt-3 pb-1 border-b ${isDM ? "border-gold-dark/30" : "border-gray-300/60"}`}
        >
          <span
            className={`font-cinzel text-xs tracking-widest uppercase ${isDM ? "text-gold-dark" : "text-[#5a5a5a]"}`}
          >
            {isDM ? "✦ Dungeon Master ✦" : playerName}
          </span>
        </div>
        <div
          className="px-4 py-3 text-ink text-[1.05rem] leading-relaxed prose prose-stone max-w-none
          prose-strong:text-ink prose-strong:font-semibold
          prose-em:italic prose-em:text-ink/80
          prose-p:my-2 prose-p:leading-relaxed
          prose-ul:my-2 prose-ul:pl-5 prose-li:my-0.5
          prose-hr:border-gold-dark/30"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export default memo(ChatCard);

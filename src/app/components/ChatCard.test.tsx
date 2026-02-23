import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ChatCard from "./ChatCard";
import type { ChatMessage } from "../hooks/useChat";

// ─── Mock ReactMarkdown to render children as plain text ─────────────────────

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <p>{children}</p>,
}));

vi.mock("remark-gfm", () => ({ default: () => {} }));

// Mock DiceRoll to avoid its animation logic
vi.mock("./DiceRoll", () => ({
  default: ({ result }: { result: { checkType: string } }) => (
    <div data-testid="dice-roll">{result.checkType}</div>
  ),
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("ChatCard", () => {
  it("renders DM message with label and content", () => {
    const msg: ChatMessage = {
      id: "1",
      role: "assistant",
      content: "You enter a dimly lit tavern.",
      timestamp: Date.now(),
    };

    render(<ChatCard message={msg} />);

    expect(screen.getByText("You enter a dimly lit tavern.")).toBeInTheDocument();
    expect(screen.getByText(/Dungeon Master/)).toBeInTheDocument();
  });

  it("renders player message with default name", () => {
    const msg: ChatMessage = {
      id: "2",
      role: "user",
      content: "I look around the room.",
      timestamp: Date.now(),
    };

    render(<ChatCard message={msg} />);

    expect(screen.getByText("I look around the room.")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("renders player message with custom playerName", () => {
    const msg: ChatMessage = {
      id: "3",
      role: "user",
      content: "I draw my sword.",
      timestamp: Date.now(),
    };

    render(<ChatCard message={msg} playerName="Aragorn" />);

    expect(screen.getByText("Aragorn")).toBeInTheDocument();
  });

  it("renders DiceRoll component when message has rollResult", () => {
    const msg: ChatMessage = {
      id: "4",
      role: "user",
      content: "",
      timestamp: Date.now(),
      rollResult: {
        checkType: "Athletics Check",
        components: "STR +3",
        dieResult: 15,
        totalModifier: "+3",
        total: 18,
        dcOrAc: "15",
        success: true,
        notes: "",
      },
    };

    render(<ChatCard message={msg} />);

    expect(screen.getByTestId("dice-roll")).toBeInTheDocument();
    expect(screen.getByText("Athletics Check")).toBeInTheDocument();
    // Should NOT render the chat card layout
    expect(screen.queryByText(/Dungeon Master/)).not.toBeInTheDocument();
    expect(screen.queryByText("You")).not.toBeInTheDocument();
  });

  it("renders DM avatar for assistant messages", () => {
    const msg: ChatMessage = { id: "5", role: "assistant", content: "Hello.", timestamp: Date.now() };
    render(<ChatCard message={msg} />);

    const img = screen.getByAltText("Dungeon Master");
    expect(img).toBeInTheDocument();
  });

  it("renders Player avatar for user messages", () => {
    const msg: ChatMessage = { id: "6", role: "user", content: "Hi.", timestamp: Date.now() };
    render(<ChatCard message={msg} />);

    const img = screen.getByAltText("Player");
    expect(img).toBeInTheDocument();
  });
});

import OpenAI from "openai";
import fs from "fs";
const openai = new OpenAI();

const dialogue = {
  messages: [
    {
      name: "Dungeon Master",
      dialogue:
        "As you enter the bustling market square, you see Catherine standing by a fruit stall, her eyes scanning the crowd nervously. What do you do?",
    },
    {
      name: "Player",
      dialogue:
        "I approach Catherine and greet her warmly. 'Catherine, is everything alright? You seem worried.'",
    },
    {
      name: "Dungeon Master",
      dialogue:
        "Catherine jumps slightly at your voice, then relaxes when she recognizes you. 'Oh, it's you. I'm glad to see a familiar face. I think someone is following me.'",
    },
    {
      name: "Player",
      dialogue:
        "'Following you? Did you see who it was?' I look around to see if anyone is paying undue attention to us.",
    },
    {
      name: "Dungeon Master",
      dialogue: "Roll for Perception.",
    },
    {
      name: "Player",
      dialogue: "I rolled a 15.",
    },
    {
      name: "Dungeon Master",
      dialogue:
        "You notice a hooded figure lingering near a shop entrance, their gaze fixed intently on Catherine. They quickly look away when they see you noticing them.",
    },
    {
      name: "Player",
      dialogue:
        "'Catherine, I see someone over there watching us. Stay close to me.' I subtly point out the hooded figure to her.",
    },
    {
      name: "Dungeon Master",
      dialogue:
        "Catherine nods, her face pale. 'What should we do? I don't feel safe here anymore.'",
    },
    {
      name: "Player",
      dialogue:
        "'Let's head to a safer place. Follow me.' I start leading Catherine towards the inn where we can talk more privately.",
    },
    {
      name: "Dungeon Master",
      dialogue:
        "As you make your way through the crowded market, the hooded figure begins to follow you at a distance. You reach the inn, its warm glow a stark contrast to the chilly market outside. What do you do now?",
    },
    {
      name: "Player",
      dialogue:
        "'Let's go inside quickly.' I guide Catherine into the inn and find a secluded table where we can talk without being overheard.",
    },
    {
      name: "Dungeon Master",
      dialogue:
        "Inside the inn, the noise of the market is replaced by the murmur of conversations and the clink of mugs. Catherine sits down, visibly relieved. 'Thank you for helping me. Do you think we're safe here?'",
    },
    {
      name: "Player",
      dialogue:
        "'For now, yes. But we need to find out who that person is and why they're following you.' I keep an eye on the entrance while we talk.",
    },
    {
      name: "Dungeon Master",
      dialogue:
        "As dawn breaks, you find yourself on the edge of the ancient forest, the trees looming ominously. A faint path winds into the darkness ahead. What do you do?",
    },
    {
      name: "Player",
      dialogue:
        "I want to inspect the area for any signs of recent activity or dangers.",
    },
    {
      name: "Dungeon Master",
      dialogue: "Roll for Perception.",
    },
    {
      name: "Player",
      dialogue: "I rolled a 17.",
    },
    {
      name: "Dungeon Master",
      dialogue:
        "Your keen eyes catch the glint of something metallic hidden under a bush beside the path. Upon closer inspection, it appears to be a small, ornate key.",
    },
    {
      name: "Player",
      dialogue:
        "I take the key and carefully continue along the path, keeping an eye out for any traps or hidden dangers.",
    },
    {
      name: "Dungeon Master",
      dialogue:
        "As you proceed, the air grows colder, and the path narrows. Suddenly, you hear a low growl from behind a large tree. What is your next action?",
    },
    {
      name: "Player",
      dialogue:
        "I prepare my weapon and slowly approach the source of the growl, ready to defend myself.",
    },
    {
      name: "Dungeon Master",
      dialogue:
        "A large wolf, its fur bristling with frost, steps into view. It watches you intently, its stance defensive but not yet aggressive.",
    },
    {
      name: "Player",
      dialogue:
        "I try to calm the wolf by speaking softly and avoiding sudden movements.",
    },
    {
      name: "Dungeon Master",
      dialogue: "Make an Animal Handling check.",
    },
    {
      name: "Player",
      dialogue: "I rolled a 14.",
    },
    {
      name: "Dungeon Master",
      dialogue:
        "The wolf's ears flick back and forth as it listens to you. After a tense moment, it seems to relax slightly and no longer appears to threaten you.",
    },
  ],
};

export async function GET(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  const response = await openai.files.create({
    file: fs.createReadStream("Sample_JSON/Player_Character_Xavier.json"),
    purpose: "assistants",
  });

  const myVectorStoreFile = await openai.beta.vectorStores.files.create(
    "vs_cfvOlQZ6ZUQSc4Q3t5K8yRgu",
    {
      file_id: response.id,
    }
  );

  return Response.json({
    // response: response,
    myVectorStoreFile: myVectorStoreFile,
  });
}

const generateEmbedding = async (text: string) => {
  const dataToUpload: any[] = [];

  const processedDialgoue = Promise.all(
    dialogue.messages.map(async (message) => {
      const processedText = `${message.name}: ${message.dialogue
        .toLowerCase()
        .trim()}`;

      const embedding = await openai.embeddings
        .create({
          model: "text-embedding-ada-002",
          input: text,
        })
        .then((response) => {
          return response.data[0].embedding;
        });

      dataToUpload.push({
        name: message.name,
        embedding: embedding,
        metadata: message.dialogue,
      });
    })
  ).then(async () => {
    const jsonString = JSON.stringify(dataToUpload, null, 2);
    fs.writeFileSync("dnd_dialogues.json", jsonString);
    console.log("Data prepared and saved to dnd_dialogues.json");

    const response = await openai.files.create({
      file: fs.createReadStream("dnd_dialogues.json"),
      purpose: "assistants",
    });

    const myVectorStoreFile = await openai.beta.vectorStores.files.create(
      "vs_cfvOlQZ6ZUQSc4Q3t5K8yRgu",
      {
        file_id: response.id,
      }
    );

    console.log(myVectorStoreFile);
    return myVectorStoreFile;
  });
};

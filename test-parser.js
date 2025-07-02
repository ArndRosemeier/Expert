const testResponse = `\`\`\`json
{
    "Content": "### Story Synopsis\\nA perpetually hungry young mouse named Pip embarks on a grand quest for a legendary 'Great Cheese' to finally satisfy his rumbling tummy. His adventure through the giant and dangerous world of a human house teaches him that the greatest satisfaction comes not from filling his own belly, but from sharing the bounty with his community.\\n\\n### Part 1: The Endless Hunger\\n*   **Chapter 1: A Tummy Full of Rumbles** - Introduce Pip, a mouse whose hunger is never-ending. We see him in his home behind the wainscoting, a loving but modest mouse colony. He eats his share and more, but his stomach still rumbles, setting him apart from his family.\\n*   **Chapter 2: The Kitchen Expedition** - Driven by hunger, Pip attempts a solo raid on the human kitchen. He bravely navigates giant furniture and avoids the sleeping housecat, Mittens, only to retrieve a single, disappointing crumb. This failure fuels his determination.\\n*   **Chapter 3: The Legend of the Great Cheese** - An elder mouse recounts the tale of the 'Great Cheese,' a mythical wheel of cheese hidden within the house, so large it could feed a colony for a year. Pip becomes obsessed with finding this legendary feast.\\n\\n### Part 2: The Quest Begins\\n*   **Chapter 4: A Whisker of a Clue** - Pip begins his search in the dusty, forgotten spaces between the walls. He discovers an old, nibbled map tucked away, revealing a perilous path to the prize.\\n*   **Chapter 5: The Shadow of the Hunter** - The map leads Pip directly through the living room, the domain of Mittens the cat. Pip must use all his cunning and stealth to sneak past the dangerous predator, creating a tense and thrilling sequence.\\n*   **Chapter 6: An Unlikely Friendship** - Pip gets into a tight spot and is saved by an unexpected ally, a wise old spider named Silas, who has observed the humans' habits. Silas provides the final clue: the 'Great Cheese' is kept in the 'Ice Cavern' (the refrigerator).\\n*   **Chapter 7: The Cold, Hard Truth** - Pip reaches the refrigerator. Opening it is a challenge, and the cold, bright interior is an alien and intimidating world. He bravely ventures inside.\\n\\n### Part 3: A Feast for All\\n*   **Chapter 8: The Treasure Revealed** - Pip finds the treasure. It's not a single wheel of cheese, but a forgotten deli platter from a party—a stunning bounty of different cheeses, crackers, and fruits. It's more than he could have ever imagined.\\n*   **Chapter 9: The Generous Heart** - Staring at the feast, Pip realizes two things: it's too much for one mouse to eat, and it's too much for one mouse to move. He has a moment of clarity, understanding that the treasure's true value is in sharing it.\\n*   **Chapter 10: The Call to Community** - Pip races back to his colony and excitedly announces his discovery. He rallies his family and friends to help bring the feast home.\\n*   **Chapter 11: The Great Heist** - Working together, the mice form a long chain, carefully transporting the food piece by piece back to their home. It's a triumphant celebration of teamwork.\\n*   **Chapter 12: A New Kind of Hunger** - Pip finally eats until he is truly full and satisfied. He realizes his deep 'hunger' was not just for food, but for adventure and purpose. He is no longer just 'Pip the hungry mouse'; he is 'Pip the Provider,' and his greatest joy is seeing his community happy and fed.",
    "Template": {
        "name": "Children's Adventure Fable",
        "hierarchyLevels": [
            "Story",
            "Part",
            "Chapter"
        ],
        "scaffoldingDocuments": [
            "Character Profile Sheet",
            "World-Building & Location Guide"
        ]
    },
    "Context": {
        "Project Goal": "To write a charming and complete children's story suitable for illustration, focusing on themes of community, purpose, and courage.",
        "Character Profiles": [
            {
                "Name": "Pip Squeak",
                "Role": "Protagonist",
                "Description": "A young mouse, small in stature but with a massive appetite and a brave heart. His defining trait is his insatiable hunger, which propels him on an adventure. His arc takes him from a self-focused goal (filling his own tummy) to a community-focused one (feeding his colony)."
            },
            {
                "Name": "Mittens",
                "Role": "Antagonist/Obstacle",
                "Description": "The family housecat. Not malicious, but a lazy, territorial predator who represents the primary danger in Pip's world. From a mouse's perspective, she is a slumbering mountain and a terrifyingly swift hunter."
            },
            {
                "Name": "Elder Barnaby",
                "Role": "Mentor/Inciting Incident",
                "Description": "The oldest mouse in the colony. He is the keeper of stories and legends, including the one about the 'Great Cheese.' His wisdom and storytelling inspire Pip's quest."
            }
        ],
        "World-Building": {
            "Setting": "A large, slightly old human house, seen from a mouse's perspective.",
            "Scale": "Emphasize the scale difference. Chair legs are towering pillars, a rug is a vast, fibrous plain, and the distance between rooms is a significant journey.",
            "Key Locations": {
                "The Nest": "The cozy, warm, but resource-scarce mouse colony behind the kitchen wall.",
                "The Kitchen": "The land of plenty, filled with tantalizing smells but also great danger.",
                "The Wall-Ways": "A dark, dusty, and secret network of passages for the mice.",
                "The Living Room": "The open, dangerous territory of Mittens the cat.",
                "The Ice Cavern": "The refrigerator—a cold, bright, and alien world holding the ultimate prize."
            }
        },
        "Themes": [
            "Community vs. Individualism",
            "The nature of hunger (physical vs. emotional/purpose)",
            "Courage in the face of fear",
            "The power of perspective"
        ],
        "Style Guide": {
            "Tone": "Warm, whimsical, adventurous, and heartfelt.",
            "Audience": "Young children (ages 4-8), and adults reading to them.",
            "Point of View": "Third-Person Limited, focused tightly on Pip's thoughts, feelings, and sensory experiences.",
            "Language": "Simple, clear, and evocative. Use rich sensory details: the smell of cheese, the dust in the walls, the hum and chill of the refrigerator. Use classic fairytale language and anthropomorphism without being overly complex."
        }
    }
}
\`\`\``;

console.log('Testing JSON parsing...');
console.log('Response length:', testResponse.length);

// Test direct JSON parsing
try {
    // Extract the JSON part
    const jsonMatch = testResponse.match(/\`\`\`json\\s*(\{[\\s\\S]*\})\\s*\`\`\`/i);
    if (jsonMatch) {
        console.log('JSON match found, length:', jsonMatch[1].length);
        const parsed = JSON.parse(jsonMatch[1]);
        console.log('✅ Direct JSON parsing succeeded');
        console.log('Keys:', Object.keys(parsed));
        console.log('Content type:', typeof parsed.Content);
        console.log('Template exists:', !!parsed.Template);
        console.log('Context type:', typeof parsed.Context);
    } else {
        console.log('❌ No JSON match found');
    }
} catch (error) {
    console.log('❌ Direct JSON parsing failed:', error.message);
    console.log('Error position:', error.message.match(/position (\\d+)/)?.[1]);
} 
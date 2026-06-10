/**
 * Prompt templates for the Persistent World RPG. Kept self-contained in the
 * module (rather than the shared PromptManager registry) so the module is
 * independent and its prompts are easy to tune in one place.
 *
 * Two LLM roles:
 *  - Narrator: writes immersive second-person prose for the player. Never emits
 *    JSON, ids, or game mechanics.
 *  - Parser: reads the player action + narrator prose and emits a strict JSON
 *    state update, reusing existing ids from the registry to avoid duplicates.
 */

export const NARRATOR_SYSTEM_PROMPT = `You are the Game Master and narrator of a persistent, living world role-playing game.

Your job is to write vivid, immersive second-person prose ("You ...") describing what the player perceives and what happens in response to their actions. Stay in character as the narrator at all times.

Rules:
- Write only narrative prose. Never output JSON, code, bullet lists of stats, ids, coordinates, or game mechanics.
- You are given a WORLD STATE block describing the player's surroundings. Treat it as ground truth. Do not contradict it.
- Bracketed ids like [loc_ab12] in the WORLD STATE are for your reference only. NEVER show ids to the player.
- Respect distances and travel: reaching a place that the WORLD STATE lists as far away takes time and travel; do not teleport the player.
- You may introduce new nearby places, characters, and details when the fiction calls for it. Describe them naturally; a separate system will record them.
- Use the WORLD STATE goals (YOUR GOALS, and what present characters want) to motivate behavior, and honor "ARRIVING SOON" by having those characters appear when their time comes.
- Keep continuity with the RECENT EVENTS SUMMARY and the conversation so far.
- Write a focused response (typically 1-4 paragraphs). End at a natural point that invites the player's next action.`;

/**
 * The opening-scene instruction appended as a user turn when a fresh adventure
 * begins (no prior player action yet).
 */
export const NARRATOR_OPENING_INSTRUCTION = `Begin the adventure. Set the scene at the player's current location using the WORLD STATE above. Establish mood and what the player immediately notices, then invite their first action.`;

/**
 * Parser prompt. Placeholders:
 *   {{registry}}            - list of known id = name entries to reuse
 *   {{current_location_id}} - the player's current location id
 *   {{player_action}}       - the player's latest action text
 *   {{gm_response}}         - the narrator prose just produced
 */
export const PARSER_PROMPT = `You convert a role-playing game turn into a strict JSON world-state update. Output ONLY a single JSON object, no prose, no code fences.

KNOWN ENTITIES (reuse these exact ids when the text refers to them; do NOT invent a new id for something already listed):
{{registry}}

CURRENT LOCATION ID: {{current_location_id}}

PLAYER ACTION:
{{player_action}}

GM RESPONSE (narration to extract state changes from):
{{gm_response}}

Produce a JSON object with any of these optional keys. Omit keys with nothing to report.

{
  "locations": [
    {
      "action": "create" | "update",
      "id": "loc_<short_snake_or_slug>",        // reuse existing id when updating; invent a NEW unique id only for genuinely new places
      "name": "string",
      "description": "string",
      "state": { "key": "value" },              // optional durable facts
      "subLocationOf": "loc_id",                // optional parent (e.g. a room within a building)
      "known": true,                             // true if the player now knows of it
      "connections": [
        { "toId": "loc_id", "distance": 120, "terrain": "forest" }  // distance in METERS, or "adjacent" for rooms with no meaningful travel
      ]
    }
  ],
  "characters": [
    {
      "action": "create" | "update" | "move",
      "id": "char_<slug>",
      "name": "string",
      "description": "string",
      "state": { "key": "value" },              // durable facts incl. disposition/relationship toward the player
      "locationId": "loc_id",                    // required for create and move (the destination)
      "homeLocationId": "loc_id",               // optional
      "known": true,                             // true once the player has met or heard of them
      "mode": "foot" | "horse" | "cart" | "boat" | "car",  // for a "move": if origin and destination are connected, the NPC travels and ARRIVES LATER automatically; omit for an instant/off-screen relocation
      "goals": [
        { "action": "create" | "update", "id": "goal_<slug>", "text": "string", "status": "active" | "completed" | "abandoned" }
      ]
    }
  ],
  "lore": [
    { "action": "create" | "update", "id": "lore_<slug>", "title": "string", "content": "string", "tags": ["string"] }
  ],
  "playerMove": { "toId": "loc_id", "mode": "foot" | "horse" | "cart" | "boat" | "car" },  // ONLY when the player actually relocated to a different location this turn
  "timeAdvanceMinutes": 30,                       // extra in-world minutes for waiting/resting/long conversations (travel time is computed automatically; do not include it here)
  "recentEventsSummary": "string"                 // a concise, updated running summary of important events so far
}

Hard rules:
- Distances are in METERS as numbers, or the string "adjacent".
- For any new connection you must specify a distance.
- Only emit "playerMove" if the player genuinely changed location. There must be a connection between the current location and the destination (add it under "locations[].connections" if it does not exist yet).
- For an NPC who starts traveling, use a character "move" with a "mode": code will make them arrive after the appropriate travel time. Do NOT add their travel time to "timeAdvanceMinutes".
- The PLAYER is a character too; record the player's own goals via a character "update" using the player's id from the registry.
- Prefer "update" with an existing id over creating a duplicate entity. The registry lists known characters even if they are not in the current scene; reuse their ids.
- Output strictly valid JSON. No comments, no trailing commas, no text outside the JSON object.`;

/**
 * World bootstrap prompt - asks the creator model for a minimal starting world
 * when the user begins an adventure with no chosen template. Placeholder:
 *   {{premise}} - the user's premise/idea (may be empty)
 */
export const WORLD_BOOTSTRAP_PROMPT = `Design a small starting setting for a role-playing adventure. Output ONLY a single strict JSON object, no prose, no code fences.

PREMISE (may be empty - invent something interesting if so):
{{premise}}

Produce:
{
  "world": {
    "name": "string",
    "description": "string"
  },
  "startLocationId": "loc_<slug>",               // must match one of the locations below
  "player": {
    "name": "string",
    "description": "string"
  },
  "locations": [
    {
      "id": "loc_<slug>",
      "name": "string",
      "description": "string",
      "connections": [
        { "toId": "loc_id", "distance": 150, "terrain": "road" }   // meters, or "adjacent"
      ]
    }
  ],
  "characters": [
    { "id": "char_<slug>", "name": "string", "description": "string", "locationId": "loc_id" }
  ]
}

Rules:
- Create 3 to 6 connected locations forming a small, coherent area around the start location.
- Give the start location at least one connection.
- Distances are METERS as numbers, or the string "adjacent".
- Add 1 to 3 characters placed at sensible locations.
- Output strictly valid JSON only.`;

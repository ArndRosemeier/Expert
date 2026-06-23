import { QualityCriterion } from '../types';

/**
 * Snapshots of every PREVIOUS released DEFAULT_CRITERIA set.
 *
 * Why this exists: unchanged profiles store no criteria and re-adopt the live
 * defaults on load, so they upgrade automatically. But some profiles have an
 * older default set physically persisted (saved by versions that predate the
 * strip-on-save behavior, or imported). Once DEFAULT_CRITERIA changes, those
 * stored sets would otherwise look like user customizations and freeze forever.
 *
 * By recording each prior default set here, the settings loader can recognize a
 * persisted set as "an old default the user never touched" and upgrade it to the
 * current defaults. Genuine customizations never match a snapshot and are left
 * untouched.
 *
 * IMPORTANT: When changing DEFAULT_CRITERIA, append the OUTGOING set here exactly
 * as it was (names, descriptions, goals, outline, leaf) so existing users keep
 * upgrading cleanly. Comparison ignores the `kind` discriminant.
 */

/** The default criteria set used before the deterministic-metric guardrails were introduced. */
const PRE_METRICS_DEFAULT_CRITERIA: QualityCriterion[] = [
    {
        name: "Prompt Adherence",
        description: "The response directly addresses the given prompt and stays on topic throughout. It fulfills the specific request without wandering off into tangential areas.",
        goal: 9,
        outline: true,
        leaf: true
    },
    {
        name: "Clarity & Conciseness",
        description: "The writing is direct, easy to understand, and avoids unnecessary words or filler phrases.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Natural & Authentic Tone",
        description: "The language sounds human and authentic. It avoids being overly formal, academic, or robotic.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Engaging Flow",
        description: "The text is interesting and holds the reader's attention. Sentences and paragraphs transition smoothly.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Varied Sentence Structure",
        description: "The length and structure of sentences are varied to create a pleasing rhythm, avoiding monotony.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Subtlety (Show, Don't Tell)",
        description: "The writing implies emotions and ideas through description and action rather than stating them directly. It avoids being on-the-nose.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Avoids AI Clichés",
        description: "The text avoids common AI phrases like 'In conclusion,' 'It's important to note,' 'delve into,' 'tapestry of,' 'testament to,' 'in the realm of,' 'navigate the landscape,' 'meticulous examination of,' 'crucial,' 'pivotal,' 'essential,' 'underscores,' 'harness,' 'illuminate,' 'transformative,' 'fostering,' 'utilize,' 'thus,' 'furthermore,' or 'ostensibly'",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Understated Language",
        description: "The prose avoids overly dramatic, sensational, or grandiose language. The tone is measured and appropriate.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Specificity & Concrete Detail",
        description: "The writing uses specific, concrete details and examples rather than vague generalities.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Original Phrasing",
        description: "The text avoids common idioms and clichés, opting for more original ways to express ideas.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Stylistic Variation",
        description: "Natural shifts in rhythm, tone, and phrasing that reflect a human voice.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Emotional Subtlety",
        description: "Emotions are implied or layered rather than explicitly stated.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Lexical Character",
        description: "Word choices feel personal, distinctive, or slightly idiosyncratic without being distracting.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: 'Human-like Naming',
        goal: 8,
        description: "Avoid overused fantasy/AI-generated names when introducing a new name. Names like Elara, Lyra, Aris, Thorne, Lyria, Chen, Stormrider, Dawnwalker, Shadowblade, Emberheart, Snowsong, Park, Johnson, Thorne, Vance, Kieran, Nova, Soren, Sylas, Astrid, Calix, Xander, Draven, Isolde, Aerin, Kael, Thalia, or Dorian are overused. Instead, use more natural, varied names that feel authentic and less predictable. Do not change names that are already established. If a name that matches the name list exactly is introduced, that is a major flaw.",
        outline: true,
        leaf: true
    },
    {
        name: "Avoids Dramatical Reframing",
        description: "The text avoids artificially elevating the significance of ordinary actions, objects, or perceptions through dramatic recontextualization. This includes explicit patterns like \"It wasn't X. It was Y.\" as well as subtler forms of rhetorical inflation — where minor events are presented as symbolically profound, emotionally transformative, or mythically significant without narrative justification.\n\nExamples to avoid:\n• \"It wasn't just food. It was fuel.\"\n• \"He wasn't waiting. He was strategizing.\"\n• \"Fixing the cart wasn't a simple repair; it was the beginning of an unlikely alliance.\"\n\nStrong writing presents events and choices with clarity and restraint, allowing significance to emerge organically rather than through overt authorial framing.",
        goal: 8,
        outline: true,
        leaf: true
    },
    {
        name: "Immediate clarity",
        description: "Prose won't tell how things are not only to immediately tell how they are. Constructs like \"He was not x, he was y\" are way overused and should be severely limited.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Keep the essence of the draft intact",
        description: "Creativity can only be on the details level. The essence of the draft is the ultimate truth, if that gets violated, other contents created for the same project will get inconsistent.",
        goal: 9,
        outline: true,
        leaf: true
    }
];

/**
 * The first default set that introduced deterministic metrics (19 entries:
 * 16 LLM + 3 metric), before the streamlining consolidation.
 *
 * Snapshots only need the fields compared by SettingsManager.criteriaMatch
 * (name, description, goal, outline, leaf), so every entry is represented in a
 * uniform LLM-shaped form even where the live default was a metric criterion.
 * The descriptions/goals/order MUST mirror exactly what was stored for users.
 */
const WITH_METRICS_DEFAULT_CRITERIA: QualityCriterion[] = [
    {
        name: "Prompt Adherence",
        description: "The response directly addresses the given prompt and stays on topic throughout. It fulfills the specific request without wandering off into tangential areas.",
        goal: 9,
        outline: true,
        leaf: true
    },
    {
        name: "Clarity & Conciseness",
        description: "The writing is direct, easy to understand, and avoids unnecessary words or filler phrases.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Natural & Authentic Tone",
        description: "The language sounds human and authentic. It avoids being overly formal, academic, or robotic.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Engaging Flow",
        description: "The text is interesting and holds the reader's attention. Sentences and paragraphs transition smoothly.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Varied Sentence Structure",
        description: "The length and structure of sentences are varied to create a pleasing rhythm, avoiding monotony.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Subtlety (Show, Don't Tell)",
        description: "The writing implies emotions and ideas through description and action rather than stating them directly. It avoids being on-the-nose.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Avoids AI Clichés",
        description: "Flags overused AI cliché phrases. Edit the phrase/regex list to customize.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Em-dash Restraint",
        description: "Hard gate against em-dash overuse, a strong AI-ism tell.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "No Antithesis Reframing",
        description: "Flags the \"It wasn't X, it was Y\" antithesis construction.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Understated Language",
        description: "The prose avoids overly dramatic, sensational, or grandiose language. The tone is measured and appropriate.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Specificity & Concrete Detail",
        description: "The writing uses specific, concrete details and examples rather than vague generalities.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Original Phrasing",
        description: "The text avoids common idioms and clichés, opting for more original ways to express ideas.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Stylistic Variation",
        description: "Natural shifts in rhythm, tone, and phrasing that reflect a human voice.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Emotional Subtlety",
        description: "Emotions are implied or layered rather than explicitly stated.",
        goal: 7,
        outline: false,
        leaf: true
    },
    {
        name: "Lexical Character",
        description: "Word choices feel personal, distinctive, or slightly idiosyncratic without being distracting.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: 'Human-like Naming',
        goal: 8,
        description: "Avoid overused fantasy/AI-generated names when introducing a new name. Names like Elara, Lyra, Aris, Thorne, Lyria, Chen, Stormrider, Dawnwalker, Shadowblade, Emberheart, Snowsong, Park, Johnson, Thorne, Vance, Kieran, Nova, Soren, Sylas, Astrid, Calix, Xander, Draven, Isolde, Aerin, Kael, Thalia, or Dorian are overused. Instead, use more natural, varied names that feel authentic and less predictable. Do not change names that are already established. If a name that matches the name list exactly is introduced, that is a major flaw.",
        outline: true,
        leaf: true
    },
    {
        name: "Avoids Dramatical Reframing",
        description: "The text avoids artificially elevating the significance of ordinary actions, objects, or perceptions through dramatic recontextualization. This includes explicit patterns like \"It wasn't X. It was Y.\" as well as subtler forms of rhetorical inflation — where minor events are presented as symbolically profound, emotionally transformative, or mythically significant without narrative justification.\n\nExamples to avoid:\n• \"It wasn't just food. It was fuel.\"\n• \"He wasn't waiting. He was strategizing.\"\n• \"Fixing the cart wasn't a simple repair; it was the beginning of an unlikely alliance.\"\n\nStrong writing presents events and choices with clarity and restraint, allowing significance to emerge organically rather than through overt authorial framing.",
        goal: 8,
        outline: true,
        leaf: true
    },
    {
        name: "Immediate clarity",
        description: "Prose won't tell how things are not only to immediately tell how they are. Constructs like \"He was not x, he was y\" are way overused and should be severely limited.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Keep the essence of the draft intact",
        description: "Creativity can only be on the details level. The essence of the draft is the ultimate truth, if that gets violated, other contents created for the same project will get inconsistent.",
        goal: 9,
        outline: true,
        leaf: true
    }
];

/**
 * The streamlined default set (5 LLM + 4 metric) that shipped before the
 * antithesis guard was converted from a deterministic metric into an LLM
 * criterion. Represented in LLM-shaped form because criteriaMatch only compares
 * name/description/goal/outline/leaf. Descriptions mirror exactly what was
 * stored for users so unchanged profiles upgrade cleanly.
 */
const ANTITHESIS_METRIC_DEFAULT_CRITERIA: QualityCriterion[] = [
    {
        name: "Prompt Adherence",
        description: "The response directly addresses the given prompt and stays on topic throughout. It fulfills the specific request without wandering off into tangential areas.",
        goal: 9,
        outline: true,
        leaf: true
    },
    {
        name: "Specificity & Concrete Detail",
        description: "The writing uses specific, concrete details and examples rather than vague generalities or abstract summary.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Natural Human Voice",
        description: "The prose reads like a specific person wrote it, not a model. Sentence length and structure vary naturally, creating rhythm without monotony or a formulaic cadence. Word choices are distinctive and occasionally idiosyncratic rather than generic, and phrasing avoids stock idioms and predictable constructions. Flow is smooth but never mechanical or self-consciously 'writerly'.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Restraint & Subtlety",
        description: "The writing trusts the reader. It implies emotion and meaning through concrete action and detail rather than naming them, and never inflates ordinary events into something grand, symbolic, or transformative. Tone stays measured — no melodrama, no rhetorical heightening, no telling the reader how to feel.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Keep the essence of the draft intact",
        description: "Creativity can only be on the details level. The essence of the draft is the ultimate truth, if that gets violated, other contents created for the same project will get inconsistent.",
        goal: 9,
        outline: true,
        leaf: true
    },
    {
        name: "Avoids AI Clichés",
        description: "Flags overused AI cliché phrases. Edit the phrase/regex list to customize.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Em-dash Restraint",
        description: "Limits em-dash density, a strong AI-ism tell.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "No Antithesis Reframing",
        description: "Flags the \"It wasn't X, it was Y\" antithesis construction.",
        goal: 8,
        outline: false,
        leaf: true
    },
    {
        name: "Human-like Naming",
        description: "Flags the most egregious overused fantasy/AI names. Case-sensitive; edit the list to customize.",
        goal: 8,
        outline: true,
        leaf: true
    }
];

/** All previously-released default criteria sets, newest first. */
export const PREVIOUS_DEFAULT_CRITERIA_SETS: QualityCriterion[][] = [
    ANTITHESIS_METRIC_DEFAULT_CRITERIA,
    WITH_METRICS_DEFAULT_CRITERIA,
    PRE_METRICS_DEFAULT_CRITERIA
];

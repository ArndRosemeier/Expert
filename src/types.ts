import { Rating } from "./LoopOrchestrator";

export interface CreatorPayload {
    prompt: string;
    response: string;
}
export interface RatingPayload {
    ratings: Rating[];
}
export interface EditorPayload {
    prompt:string;
    advice: string;
}

export interface QualityCriterion {
    name: string;
    goal: number;
    weight: number;
    description?: string;
} 
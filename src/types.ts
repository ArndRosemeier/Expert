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
    description?: string;
    outline?: boolean;
    leaf?: boolean;
} 

export interface AILogEntry {
    id: string;
    timestamp: Date;
    purpose: string;
    prompt: string;
    response: string;
    model: string;
    requestDuration: number; // in milliseconds
} 
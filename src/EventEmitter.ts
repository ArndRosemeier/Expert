type Listener<T extends any[] = any[]> = (...args: T) => void;

export class EventEmitter<Events extends Record<string, any[]>> {
    private listeners: { [K in keyof Events]?: Listener<Events[K]>[] } = {};

    on<K extends keyof Events>(eventName: K, listener: Listener<Events[K]>): void {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName]!.push(listener);
    }

    off<K extends keyof Events>(eventName: K, listener: Listener<Events[K]>): void {
        if (!this.listeners[eventName]) {
            return;
        }
        this.listeners[eventName] = this.listeners[eventName]!.filter(l => l !== listener);
    }

    emit<K extends keyof Events>(eventName: K, ...args: Events[K]): void {
        if (!this.listeners[eventName]) {
            return;
        }
        this.listeners[eventName]!.forEach(listener => listener(...args));
    }
} 
type Listener<T extends readonly unknown[] = readonly unknown[]> = (...args: T) => void;

export class EventEmitter<Events extends Record<string, readonly unknown[]>> {
    private listeners: { [K in keyof Events]?: Listener<Events[K]>[] } = {};

    on<K extends keyof Events>(eventName: K, listener: Listener<Events[K]>): void {
        const existing = this.listeners[eventName];
        if (existing) {
            existing.push(listener);
        } else {
            this.listeners[eventName] = [listener];
        }
    }

    off<K extends keyof Events>(eventName: K, listener: Listener<Events[K]>): void {
        const existing = this.listeners[eventName];
        if (!existing) {
            return;
        }
        this.listeners[eventName] = existing.filter(l => l !== listener);
    }

    emit<K extends keyof Events>(eventName: K, ...args: Events[K]): void {
        const existing = this.listeners[eventName];
        if (!existing) {
            return;
        }
        existing.forEach(listener => { listener(...args); });
    }
}

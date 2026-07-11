// Node >= 22 exposes its own `localStorage` global, which shadows jsdom's
// implementation in vitest's jsdom environment. Without a valid
// `--localstorage-file` the Node object has no working Storage methods
// (`localStorage.clear is not a function`), so install a spec-compliant
// in-memory Storage for tests instead.
class MemoryStorage implements Storage {
    private store = new Map<string, string>();

    get length(): number {
        return this.store.size;
    }

    key(index: number): string | null {
        return Array.from(this.store.keys())[index] ?? null;
    }

    getItem(key: string): string | null {
        return this.store.has(key) ? this.store.get(key)! : null;
    }

    setItem(key: string, value: string): void {
        this.store.set(String(key), String(value));
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, name, {
        value: new MemoryStorage(),
        writable: true,
        configurable: true,
    });
}

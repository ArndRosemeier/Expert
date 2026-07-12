declare global {
  interface Window {
    currentModalClickHandler?: (event: MouseEvent) => void;
  }
}

export {};

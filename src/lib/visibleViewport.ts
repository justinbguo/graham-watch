export function visibleHeight(innerHeight: number, visualHeight: number | null | undefined): number {
  if (visualHeight == null || !Number.isFinite(visualHeight) || visualHeight <= 0) return innerHeight;
  return Math.min(innerHeight, visualHeight);
}

let bound = false;

export function bindVisibleViewport(): void {
  if (typeof window === 'undefined' || bound) return;
  bound = true;

  const apply = () => {
    const px = `${visibleHeight(window.innerHeight, window.visualViewport?.height)}px`;
    const root = document.getElementById('root');
    for (const node of [document.documentElement, document.body, root]) {
      if (node && node.style.height !== px) node.style.height = px;
    }
  };

  apply();
  window.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', apply);
}

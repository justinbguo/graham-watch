export type SearchBarRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

let launch: SearchBarRect | null = null;

/** Where the buy-header door was when search opened. Consumed once. */
export function takeSearchLaunchRect(): SearchBarRect | null {
  const rect = launch;
  launch = null;
  return rect;
}

export function setSearchLaunchRect(rect: SearchBarRect) {
  launch = rect;
}

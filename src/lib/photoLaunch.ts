export type PhotoRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

let launch: PhotoRect | null = null;

/** Where the photograph was when the viewer opened. Consumed once. */
export function takePhotoLaunchRect(): PhotoRect | null {
  const rect = launch;
  launch = null;
  return rect;
}

export function setPhotoLaunchRect(rect: PhotoRect) {
  launch = rect;
}

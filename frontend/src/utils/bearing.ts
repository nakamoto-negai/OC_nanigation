export function gpsBearing(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(toLng - fromLng);
  const lat1 = toRad(fromLat);
  const lat2 = toRad(toLat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function mapBearing(
  fromX: number, fromY: number,
  toX: number, toY: number,
  mapNorthOffset: number
): number {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return ((angle + mapNorthOffset) + 360) % 360;
}

export function angleDiff(target: number, current: number): number {
  let diff = ((target - current) + 360) % 360;
  if (diff > 180) diff -= 360;
  return diff;
}

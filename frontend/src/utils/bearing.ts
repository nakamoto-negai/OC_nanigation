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

// 2 つの GPS 座標間の距離（メートル）を Haversine 公式で求める。到着判定に使う。
export function gpsDistance(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): number {
  const R = 6371000; // 地球半径（m）
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function angleDiff(target: number, current: number): number {
  let diff = ((target - current) + 360) % 360;
  if (diff > 180) diff -= 360;
  return diff;
}

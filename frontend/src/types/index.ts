export interface Category {
  id: number;
  name: string;
  sort_order: number;
  is_open_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Node {
  id: number;
  name: string;
  description: string;
  x: number;
  y: number;
  lat: number | null;
  lng: number | null;
  category_id: number | null;
  category?: Category;
  is_selectable: boolean;
  congestion_level: number;
  wait_time: number;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: number;
  link_id: number;
  sort_order: number;
  url: string;
  caption: string;
  created_at: string;
}

export interface Link {
  id: number;
  name: string;
  description: string;
  from_node_id: number;
  to_node_id: number;
  from_node?: Node;
  to_node?: Node;
  distance: number;
  photos: Photo[];
  created_at: string;
  updated_at: string;
}

export interface RouteStepDetail {
  step_number: number;
  link: Link;
  from_node: Node;
  to_node: Node;
}

export interface RouteResponse {
  node_path: Node[];
  steps: RouteStepDetail[];
  total_distance: number;
}

export interface Setting {
  id: number;
  map_north_offset: number;
  reroute_visibility: boolean;
  reroute_incident: boolean;
  reroute_congestion: boolean;
  reroute_other: boolean;
  stamp_url: string;
  cafeteria_congestion: number;
}

export interface User {
  id: number;
  device_id: string;
  created_at: string;
}

export interface UserLog {
  id: number;
  device_id: string;
  action: string;
  from_node: string;
  to_node: string;
  step: number;
  total_steps: number;
  created_at: string;
}

export interface MapImage {
  id: number;
  name: string;
  url: string;
  width: number;
  height: number;
  is_active: boolean;
  created_at: string;
}

export interface ARFeature {
  id: number;
  node_id: number | null;
  node?: Node;
  viewpoint_node_id: number | null;
  viewpoint_node?: Node;
  name: string;
  image_url: string;
  width: number;
  height: number;
  keypoint_count: number;
  keypoints: string;
  descriptors?: string;
  desc_rows: number;
  desc_cols: number;
  created_at: string;
}

export interface NodeDetour {
  id: number;
  node_id: number;
  detour_node_id: number;
  node?: Node;
  detour_node?: Node;
  created_at: string;
  updated_at: string;
}

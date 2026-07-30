export interface Category {
  id: number;
  name: string;
  sort_order: number;
  is_open_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: number;
  destination_id: number;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 目的地。1つの目的地に複数のノード（地点）を多対多で登録でき、
// 経路案内では現在地から最も近い所属ノードが自動選択される。
// カテゴリ・イベントは目的地に紐づく。説明・混雑度はノード側が持つ。
export interface Destination {
  id: number;
  name: string;
  category_id: number | null;
  category?: Category;
  sort_order: number;
  nodes?: Node[];
  events?: Event[];
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

// 到着地点写真の合成に使う「合成用写真」（ステッカー等）。事前に登録しておく。
export interface OverlayImage {
  id: number;
  name: string;
  url: string;
  created_at: string;
}

// リンクに紐づく到着地点の写真（「到着地点を確認する」で表示）。道中スライダーの Photo とは別系統。
export interface ArrivalPhoto {
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
  arrival_photos?: ArrivalPhoto[];
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

// 食堂。管理画面から複数登録でき、それぞれ混雑度を持つ。
// congestion_level: 0=不明, 1=空き, 2=普通, 3=混雑, 4=大混雑
export interface Cafeteria {
  id: number;
  name: string;
  congestion_level: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Setting {
  id: number;
  map_north_offset: number;
  reroute_visibility: boolean;
  reroute_incident: boolean;
  reroute_congestion: boolean;
  reroute_other: boolean;
  stamp_url: string;
  show_cafeteria_congestion: boolean;
  show_ar_button: boolean;
  survey_url: string;
  /** ホーム画面で最初から選択しておく目的地ID（未設定なら null）。 */
  default_destination_id: number | null;
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
  origin_node: string;
  dest_node: string;
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

export interface ARObject {
  id: number;
  name: string;
  description: string;
  category: string;
  image_url: string;
  link_url: string;
  created_at: string;
  updated_at: string;
}

export interface ARFeature {
  id: number;
  node_id: number | null;
  node?: Node;
  viewpoint_node_id: number | null;
  viewpoint_node?: Node;
  ar_object_id: number | null;
  ar_object?: ARObject;
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

// お知らせ（アプリを開いたとき最初に表示する POP 画像）
export interface Announcement {
  id: number;
  title: string;
  body: string;
  image_url: string;
  link_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 道案内ARデモ用の重ね画像（管理画面限定）
export interface DemoOverlay {
  id: number;
  name: string;
  image_url: string;
  created_at: string;
}

export type SurveyQuestionType = "likert" | "text";

export interface SurveyQuestion {
  id: number;
  text: string;
  type: SurveyQuestionType;
  required: boolean;
  page: number;
  sort_order: number;
  is_active: boolean;
  scale_max: number;
  min_label: string;
  max_label: string;
  created_at: string;
  updated_at: string;
}

export interface SurveyAnswer {
  id: number;
  response_id: number;
  question_id: number;
  value: number;
  text: string;
  question_text: string;
  question_type: SurveyQuestionType;
}

export interface SurveyResponse {
  id: number;
  device_id: string;
  created_at: string;
  answers: SurveyAnswer[];
}

// ユーザーアプリ向け公開エンドポイントのレスポンス
export interface SurveyPublic {
  questions: SurveyQuestion[];
  answered: boolean;
}

// 送信ペイロードの1回答
export interface SurveyAnswerInput {
  question_id: number;
  value?: number;
  text?: string;
}

export interface NodeDetour {
  id: number;
  node_id: number;
  detour_node_id: number;
  node?: Node;
  detour_node?: Node;
  description: string;
  image_url: string;
  created_at: string;
  updated_at: string;
}

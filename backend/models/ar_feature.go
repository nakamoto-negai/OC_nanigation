package models

import "time"

// ARFeature は AR 用に「ある地点で撮影した、ある建物の参照フレーム」とその特徴点を保持する。
// 後段の特徴点マッチング（平面認識・空間幾何）で、カメラ映像とこの参照を突き合わせる。
//
//   NodeID         : 認識される対象＝建物のノード。認識時にこの名前を「建物名」として表示する。
//   ViewpointNodeID: この建物が見える地点（現在地ノード）。現在地で認識候補を絞り込むのに使う。
//   Keypoints      : ORB が検出したキーポイントの JSON 配列 [{x,y,size,angle,response,octave}, ...]
//   Descriptors    : ORB バイナリ記述子（CV_8U, rows×cols）を base64 化したもの
//   DescRows/DescCols : 記述子行列の形状（マッチング時に復元するために保持）
type ARFeature struct {
	ID              uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	NodeID          *uint     `json:"node_id"`
	Node            *Node     `json:"node,omitempty" gorm:"foreignKey:NodeID"`
	ViewpointNodeID *uint     `json:"viewpoint_node_id"`
	ViewpointNode   *Node     `json:"viewpoint_node,omitempty" gorm:"foreignKey:ViewpointNodeID"`
	Name            string    `json:"name"`
	ImageURL        string    `json:"image_url" gorm:"not null"`
	Width           int       `json:"width" gorm:"default:0"`
	Height          int       `json:"height" gorm:"default:0"`
	KeypointCount   int       `json:"keypoint_count" gorm:"default:0"`
	Keypoints       string    `json:"keypoints" gorm:"type:text"`
	Descriptors     string    `json:"descriptors" gorm:"type:text"`
	DescRows        int       `json:"desc_rows" gorm:"default:0"`
	DescCols        int       `json:"desc_cols" gorm:"default:0"`
	CreatedAt       time.Time `json:"created_at"`
}

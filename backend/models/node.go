package models

import "time"

// CongestionLevel: 0=不明, 1=空き, 2=普通, 3=混雑
// WaitTime: 推定待ち時間（分）。0=なし/不明
// Node は地図上の地点。目的地（Destination）に多対多で所属する地点のほか、
// 中継地点（廊下・交差点など）もノードとして表現する。
// カテゴリ・イベントは目的地(Destination)側に移動した。説明・混雑度・待ち時間・
// 到着写真はノードが持ち続ける（ゴールカードは到達したノードの情報を表示する）。
type Node struct {
	ID              uint     `json:"id" gorm:"primaryKey;autoIncrement"`
	Name            string   `json:"name" gorm:"not null"`
	Description     string   `json:"description"`
	X               float64  `json:"x" gorm:"not null"`
	Y               float64  `json:"y" gorm:"not null"`
	Lat             *float64 `json:"lat"`
	Lng             *float64 `json:"lng"`
	CongestionLevel int      `json:"congestion_level" gorm:"not null;default:0"`
	WaitTime        int      `json:"wait_time" gorm:"not null;default:0"`
	// この地点に紐づく写真（ゴールカードで到着者が登録する到着記念写真）
	Photos    []NodePhoto `json:"photos" gorm:"foreignKey:NodeID;constraint:OnDelete:CASCADE"`
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
}

// NodeDetour はノード同士の寄り道提案ペアリングを管理する中間テーブル。
// NodeID と DetourNodeID にそれぞれ一意制約を付けて一対一対応を強制する。
type NodeDetour struct {
	ID           uint   `json:"id" gorm:"primaryKey;autoIncrement"`
	NodeID       uint   `json:"node_id" gorm:"not null;uniqueIndex"`
	DetourNodeID uint   `json:"detour_node_id" gorm:"not null;uniqueIndex"`
	Node         *Node  `json:"node,omitempty" gorm:"foreignKey:NodeID"`
	DetourNode   *Node  `json:"detour_node,omitempty" gorm:"foreignKey:DetourNodeID"`
	// 寄り道カード専用の説明文・画像（任意）。未設定なら寄り道先ノードの情報で代替表示する。
	Description string    `json:"description"`
	ImageURL   string    `json:"image_url"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

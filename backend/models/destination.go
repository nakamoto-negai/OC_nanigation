package models

import "time"

// Destination は「目的地」。ユーザーが目的地選択画面で選ぶ単位。
// 1つの目的地に複数のノード（地点）を多対多で登録でき、経路案内では
// 現在地から最も近い所属ノードが自動選択される（フロントの calcRouteToNodes）。
// カテゴリ・イベントは目的地に紐づく。説明・混雑度・到着写真はノード側が持つ。
type Destination struct {
	ID         uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Name       string    `json:"name" gorm:"not null"`
	CategoryID *uint     `json:"category_id"`
	Category   *Category `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
	SortOrder  int       `json:"sort_order" gorm:"not null;default:0"`
	// バス停ラベル。true の目的地は「バス停選択」の地図に表示され、現在地として選べる。
	IsBusStop bool `json:"is_bus_stop" gorm:"not null;default:false"`
	// スタンプラリー対象地点ラベル。true の目的地はイベント選択でラベル付き表示する。
	IsStampRally bool `json:"is_stamp_rally" gorm:"not null;default:false"`
	// 所属ノード（多対多）。中間テーブル destination_nodes。
	Nodes []Node `json:"nodes,omitempty" gorm:"many2many:destination_nodes;"`
	// この目的地で開催されるイベント（目的地カードに流して表示する）
	Events    []Event   `json:"events,omitempty" gorm:"foreignKey:DestinationID;constraint:OnDelete:CASCADE"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

package models

import "time"

// NodePhoto は地点(ノード)に紐づく写真。
// 道案内の最後（ゴール）カードで、到着した本人が「到着記念」として登録する。
type NodePhoto struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	NodeID    uint      `json:"node_id" gorm:"not null;index"`
	SortOrder int       `json:"sort_order" gorm:"default:0"`
	URL       string    `json:"url" gorm:"not null"`
	Caption   string    `json:"caption"`
	CreatedAt time.Time `json:"created_at"`
}

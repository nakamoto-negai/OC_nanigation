package models

import "time"

// Event は、あるノード（目的地）で開催されるイベント。
// 目的地選択画面で、その地点のカードにイベント名を流して表示するのに使う。
type Event struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	NodeID    uint      `json:"node_id" gorm:"not null;index"`
	Name      string    `json:"name" gorm:"not null"`
	SortOrder int       `json:"sort_order" gorm:"default:0"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

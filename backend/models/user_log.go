package models

import "time"

type UserLog struct {
	ID         uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	DeviceID   string    `json:"device_id" gorm:"index;not null"`
	Action     string    `json:"action" gorm:"not null"`
	// OriginNode / DestNode はナビ全体の出発地・目的地（ユーザーが選んだ最終目的地）。
	// FromNode / ToNode は現在のステップ区間（隣り合うノード間）を表す。
	OriginNode string    `json:"origin_node"`
	DestNode   string    `json:"dest_node"`
	FromNode   string    `json:"from_node"`
	ToNode     string    `json:"to_node"`
	Step       int       `json:"step"`
	TotalSteps int       `json:"total_steps"`
	CreatedAt  time.Time `json:"created_at"`
}

package models

import "time"

type UserLog struct {
	ID         uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	DeviceID   string    `json:"device_id" gorm:"index;not null"`
	Action     string    `json:"action" gorm:"not null"`
	// Label はボタン等の押下ログでの識別名（ボタン文言 / aria-label / data-log）。
	// Screen は押下時の画面パス（/, /route, /ar, /survey など）。
	Label      string    `json:"label"`
	Screen     string    `json:"screen"`
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

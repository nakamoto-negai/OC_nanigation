package models

import "time"

// Cafeteria は食堂。管理画面から複数登録でき、それぞれ混雑度を持つ。
// ユーザーアプリのヘッダーに名前＋混雑度バッジで表示される。
// CongestionLevel: 0=不明, 1=空き, 2=普通, 3=混雑, 4=大混雑
type Cafeteria struct {
	ID              uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Name            string    `json:"name" gorm:"not null"`
	CongestionLevel int       `json:"congestion_level" gorm:"not null;default:0"`
	SortOrder       int       `json:"sort_order" gorm:"not null;default:0"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

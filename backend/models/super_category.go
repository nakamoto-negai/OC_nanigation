package models

import "time"

// SuperCategory は「大カテゴリー」。複数の Category を束ねる上位分類。
// イベント選択画面で 大カテゴリー → カテゴリー → イベント → 目的地 の階層見出しに使う。
type SuperCategory struct {
	ID            uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Name          string    `json:"name" gorm:"not null"`
	SortOrder     int       `json:"sort_order" gorm:"not null;default:0"`
	IsOpenDefault bool      `json:"is_open_default" gorm:"not null;default:true"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

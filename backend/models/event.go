package models

import "time"

// Event は、ある目的地（Destination）で開催されるイベント。
// 目的地選択画面で、その目的地のカードにイベント名を流して表示するのに使う。
// DestinationID をポインタ（nullable）にしているのは、既存行がある events 表へ
// AutoMigrate で FK 付きの新カラムを追加する際、NOT NULL だと既存行が制約違反で
// 失敗するため。既存行は一旦 NULL で追加 → データ移行で値を埋める。必須性は
// ハンドラ側のバリデーションで担保する。
type Event struct {
	ID            uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	DestinationID *uint     `json:"destination_id" gorm:"index"`
	Name          string    `json:"name" gorm:"not null"`
	SortOrder     int       `json:"sort_order" gorm:"default:0"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

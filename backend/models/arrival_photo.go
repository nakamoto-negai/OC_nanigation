package models

import "time"

// ArrivalPhoto はリンク（経路）に紐づく「到着地点の写真」。
// 道案内の「到着地点を確認する」ボタンを押したとき、そのステップのリンク
// （＝実際に到着した経路）に対して表示される。リンクの道中スライダー写真(Photo)
// とは別系統で、管理画面ではリンクごとに登録する。
type ArrivalPhoto struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	LinkID    uint      `json:"link_id" gorm:"not null;index"`
	SortOrder int       `json:"sort_order" gorm:"default:0"`
	URL       string    `json:"url" gorm:"not null"`
	Caption   string    `json:"caption"`
	CreatedAt time.Time `json:"created_at"`
}

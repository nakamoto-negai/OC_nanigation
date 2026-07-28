package models

import "time"

// DemoOverlay は道案内ARのデモ画面用に管理者が登録する重ね画像。
// カメラ映像の上に全面オーバーレイして、AR デモの見た目づくりに使う。
// 管理画面からのみ登録・閲覧・削除する（ユーザーアプリでは使わない）。
type DemoOverlay struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Name      string    `json:"name"`
	ImageURL  string    `json:"image_url" gorm:"not null"`
	CreatedAt time.Time `json:"created_at"`
}

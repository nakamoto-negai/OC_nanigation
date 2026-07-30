package models

import "time"

// OverlayImage は到着地点写真の合成に使う「合成用写真」（ステッカー・フレーム等）。
// 事前に登録しておき、合成エディタで既存の到着写真の上に重ねて使う。
// 透過PNGを想定するが、任意の画像を受け付ける。
type OverlayImage struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Name      string    `json:"name"`
	URL       string    `json:"url" gorm:"not null"`
	CreatedAt time.Time `json:"created_at"`
}

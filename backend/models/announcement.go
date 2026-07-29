package models

import "time"

// Announcement は「お知らせ」。アプリ（リンク）を開いたときに最初に表示する POP 画像。
// カメラ・コンパスの許可要求よりも前にユーザーへ提示する。
//   ImageURL : POP に表示する画像（必須）
//   Title/Body : 画像に添える文言（任意）
//   LinkURL  : 「詳しく見る」で開く外部リンク（任意）
//   IsActive : 有効なお知らせは同時に1件だけ。表示されるのはこれが true のもの。
type Announcement struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Title     string    `json:"title"`
	Body      string    `json:"body" gorm:"type:text"`
	ImageURL  string    `json:"image_url" gorm:"not null"`
	LinkURL   string    `json:"link_url"`
	IsActive  bool      `json:"is_active" gorm:"not null;default:false"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

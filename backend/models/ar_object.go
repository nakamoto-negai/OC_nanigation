package models

import "time"

// ARObject は AR 認識で表示する「物体の詳細情報」を保持する。
//
// 建物ノード(Node)に紐づかない一般の対象（展示物・看板・設備・作品など）を
// 認識したときに、この情報を詳細パネルとして表示する。
// 1つの ARObject に対して複数の ARFeature（撮影角度ごとの参照フレーム）が
// 紐づきうるため、Node と同様に独立したマスタとして持つ。
//
//   Name        : 表示タイトル（物体名）
//   Description : 詳細説明
//   Category    : 種別ラベル（任意。例: 展示物 / 看板 / 設備）
//   ImageURL    : 代表画像（任意。未設定なら認識参照画像で代替表示する）
type ARObject struct {
	ID          uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Name        string    `json:"name" gorm:"not null"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	ImageURL    string    `json:"image_url"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
